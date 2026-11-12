/* Jaguar Task Scheduler - front end.
 * Scheduling engine and Gantt from the Gantt Scheduling Logic Tester, plus log in and saving to the server.
 */
(function () {
'use strict';

const API = 'api/index.php?a=';
const SLOT = 0.25;            // scheduling step in hours
const MAXD = 1500;            // maximum days to simulate
const PXD = 56;               // pixels per day in Day view
const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_DEFAULT = [['08:00', '15:30'], ['08:00', '15:30'], ['08:00', '15:30'], ['08:00', '15:30'], ['08:00', '15:30'], ['', ''], ['', '']];
const SAMPLE = [
  { id: 'T1', name: 'Site visit', res: 'Eng A', dur: 6, due: '2026-11-12', preds: '', fixed: '' },
  { id: 'T2', name: 'Review drawings', res: 'Eng A', dur: 10, due: '2026-11-13', preds: 'T1', fixed: '' },
  { id: 'T3', name: 'Geotech review', res: 'Eng B', dur: 8, due: '2026-11-16', preds: '', fixed: '' },
  { id: 'T4', name: 'Foundation design', res: 'Eng A', dur: 16, due: '2026-11-20', preds: 'T2, T3', fixed: '' },
  { id: 'T5', name: 'Retaining wall design', res: 'Eng B', dur: 12, due: '2026-11-18', preds: 'T3', fixed: '' },
  { id: 'T6', name: 'Draft report', res: 'Eng A', dur: 14, due: '2026-11-24', preds: 'T4, T5', fixed: '' },
  { id: 'T7', name: 'Client proposal', res: 'Eng B', dur: 5, due: '2026-11-11', preds: '', fixed: '' },
  { id: 'T8', name: 'Internal QA', res: 'Eng B', dur: 4, due: '2026-11-25', preds: 'T6', fixed: '' }
];

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
const fmtKey = dt => ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
function parseDate(s) { if (!s) return null; const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

let CSRF = '';
let USER = null;
let zoom = 'day';
let lastRender = null;
let week = [];
let loaded = false;     // becomes true after the saved data is on screen; stops the sample being saved by accident
let saveTimer = null;

/* ---------- server calls ---------- */
async function api(action, opts) {
  opts = opts || {};
  const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  if (init.method !== 'GET') init.headers['X-CSRF-Token'] = CSRF;
  const r = await fetch(API + action, init);
  let data = {};
  try { data = await r.json(); } catch (e) { data = { error: 'The server sent an unexpected reply.' }; }
  if (data.csrf) CSRF = data.csrf;
  if (!r.ok) {
    const err = new Error(data.error || ('Request failed (' + r.status + ').'));
    err.status = r.status;
    err.details = data.details || [];
    throw err;
  }
  return data;
}

function setStatus(text, isErr) {
  const el = $('status');
  el.textContent = text;
  el.style.color = isErr ? '#b00020' : '';
}

function showAuth(msg) {
  USER = null;
  loaded = false;
  $('who').textContent = '';
  $('appBox').hidden = true;
  $('authBox').hidden = false;
  $('authMsg').textContent = msg || '';
}

async function enterApp(user) {
  USER = user;
  $('who').textContent = user.name + ' · ' + user.tenant + ' · ' + user.role;
  $('authBox').hidden = true;
  $('appBox').hidden = false;
  const admin = user.role === 'owner' || user.role === 'admin';
  $('teamBox').hidden = !admin;
  if (admin) loadTeam();
  await loadData();
}

/* ---------- saving and loading ---------- */
function queueSave() {
  if (!loaded || !USER) return;
  clearTimeout(saveTimer);
  setStatus('Unsaved changes…');
  saveTimer = setTimeout(saveAll, 700);
}

async function saveAll() {
  if (!USER) return;
  setStatus('Saving…');
  try {
    await api('tasks', { method: 'POST', body: { tasks: rowsRaw() } });
    await api('calendar', { method: 'POST', body: { week: readWeekPairs(), overrides: $('cOver').value } });
    setStatus('All changes saved at ' + new Date().toLocaleTimeString());
  } catch (e) {
    if (e.status === 401) { showAuth('Your session ended. Please log in again.'); return; }
    const extra = e.details && e.details.length ? ' ' + e.details.join(' ') : '';
    setStatus('Not saved: ' + e.message + extra, true);
  }
}

async function loadData() {
  setStatus('Loading your data…');
  try {
    const [tk, cal] = await Promise.all([api('tasks'), api('calendar')]);
    buildWeekRow();
    setWeekInputs(cal.week);
    $('cOver').value = cal.overrides || '';
    $('tbody').innerHTML = '';
    if (tk.tasks.length) {
      tk.tasks.forEach(t => $('tbody').appendChild(makeRow(t)));
    } else {
      SAMPLE.forEach(t => $('tbody').appendChild(makeRow(t)));
    }
    renumber();
    loaded = false;
    recalc();
    loaded = true;
    setStatus(tk.tasks.length ? 'Loaded your saved tasks.' : 'No saved tasks yet. Showing the sample; your first edit saves it.');
  } catch (e) {
    if (e.status === 401) { showAuth('Please log in.'); return; }
    setStatus('Could not load your data: ' + e.message, true);
  }
}

async function loadTeam() {
  try {
    const r = await api('users');
    $('teamList').innerHTML = r.users.map(u => esc(u.name) + ' (' + esc(u.email) + ') · ' + esc(u.role) + (Number(u.active) ? '' : ' · inactive')).join('<br>');
  } catch (e) {
    $('teamMsg').textContent = e.message;
  }
}

/* ---------- calendar ---------- */
function toHours(str) {
  const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? (+m[1] + (+m[2]) / 60) : null;
}
function windowOf(s, e) { if (s == null || e == null || e <= s) return null; return { s: s, e: e }; }

function buildWeekRow() {
  const row = $('weekRow');
  row.innerHTML = '';
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d, i) => {
    const l = document.createElement('label');
    l.className = 'f';
    l.innerHTML = d + '<span style="display:flex;gap:4px"><input type="time" class="ws" value="' + WEEK_DEFAULT[i][0] +
                  '"><input type="time" class="we" value="' + WEEK_DEFAULT[i][1] + '"></span>';
    row.appendChild(l);
  });
}
function setWeekInputs(pairs) {
  document.querySelectorAll('.ws').forEach((el, i) => { el.value = (pairs[i] && pairs[i][0]) || ''; });
  document.querySelectorAll('.we').forEach((el, i) => { el.value = (pairs[i] && pairs[i][1]) || ''; });
}
function readWeekPairs() {
  const ends = document.querySelectorAll('.we');
  return Array.from(document.querySelectorAll('.ws')).map((s, i) => [s.value, ends[i].value]);
}
function readCalendar() {
  const pairs = readWeekPairs();
  week = pairs.map(p => windowOf(toHours(p[0]), toHours(p[1])));
  const over = new Map();
  $('cOver').value.split('\n').forEach(line => {
    const m = line.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*=\s*(off|(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2}))$/i);
    if (!m) return;
    const key = ymd(+m[1], +m[2], +m[3]);
    if (/^off$/i.test(m[4])) over.set(key, null);
    else over.set(key, windowOf(+m[5] + (+m[6]) / 60, +m[7] + (+m[8]) / 60));
  });
  return over;
}

/* ---------- task table (rows are moved, never rebuilt, so inputs keep their values) ---------- */
function renumber() {
  Array.from(document.querySelectorAll('#tbody tr')).forEach((tr, i) => {
    tr.querySelector('.pri-cell').textContent = i + 1;
  });
}

/* One table: task inputs, schedule results and the Gantt bar share each row.
 * f = scheduler field, x = Excel column kept in "extra", out = result filled by recalc. */
const COLS = [
  { k: 'grip', label: '', fixed: true, stk: true },
  { k: 'pri', label: 'Priority', stk: true },
  { k: 'id', label: 'ID_Item', f: 'id', cls: 's', stk: true },
  { k: 'name', label: 'Task', f: 'name', cls: 'n', stk: true },
  { k: 'project_no', label: 'Project No', x: 'project_no', cls: 's' },
  { k: 'res', label: 'Resource', f: 'res' },
  { k: 'dur', label: 'Duration (h)', f: 'dur', cls: 's', num: true },
  { k: 'due', label: 'Due', f: 'due', cls: 'd', date: true },
  { k: 'preds', label: 'Predecessors', f: 'preds', cls: 'w' },
  { k: 'fixed', label: 'Fixed start', f: 'fixed', cls: 'd', date: true },
  { k: 'id_label', label: 'ID', x: 'id_label', cls: 's', hide: true },
  { k: 'item', label: 'Item', x: 'item', hide: true },
  { k: 'status', label: 'Status', x: 'status', cls: 's', hide: true },
  { k: 'phase', label: 'Phase', x: 'phase', hide: true },
  { k: 'task_date', label: 'Date', x: 'task_date', cls: 'w', hide: true },
  { k: 'other', label: 'Other', x: 'other', hide: true },
  { k: 'description', label: 'Description', x: 'description', cls: 'n', hide: true },
  { k: 'start', label: 'Start', out: true },
  { k: 'finish', label: 'Finish', out: true },
  { k: 'wait', label: 'Waiting (h)', out: true, hide: true },
  { k: 'margin', label: 'Margin (cal. days)', out: true, hide: true },
  { k: 'sched', label: 'Schedule', out: true },
  { k: 'del', label: '', fixed: true },
  { k: 'gantt', label: 'Gantt' }
];
const COLS_KEY = 'jaguar.hiddenCols';
let hiddenCols = new Set(COLS.filter(c => c.hide).map(c => c.k));
try { const saved = JSON.parse(localStorage.getItem(COLS_KEY)); if (Array.isArray(saved)) hiddenCols = new Set(saved); } catch (e) { /* keep defaults */ }

function cellHtml(c, t, x) {
  if (c.k === 'grip') return '<span class="grip" title="Drag to change priority">⋮⋮</span>';
  if (c.k === 'pri') return '–';
  if (c.k === 'del') return '<button class="x" type="button" title="Remove">✕</button>';
  if (c.f || c.x) {
    const val = c.f ? t[c.f] : x[c.x];
    const type = c.num ? ' type="number" step="0.25" min="0"' : c.date ? ' type="date"' : '';
    return '<input ' + (c.f ? 'data-f="' + c.f : 'data-x="' + c.x) + '"' + (c.cls ? ' class="' + c.cls + '"' : '') + type + ' value="' + esc(val) + '">';
  }
  return '';
}

function buildHead() {
  $('headRow').innerHTML = COLS.map(c => '<th class="c-' + c.k + (c.stk ? ' stk' : '') + '">' + esc(c.label) + '</th>').join('');
}

function buildColMenu() {
  $('colBox').innerHTML = COLS.filter(c => !c.fixed).map(c =>
    '<label><input type="checkbox" data-col="' + c.k + '"' + (hiddenCols.has(c.k) ? '' : ' checked') + '> ' + esc(c.label) + '</label>').join('');
  $('colBox').addEventListener('change', e => {
    e.stopPropagation();                              // showing/hiding columns is not a task edit: no recalc, no save
    const cb = e.target.closest('[data-col]');
    if (!cb) return;
    if (cb.checked) hiddenCols.delete(cb.dataset.col); else hiddenCols.add(cb.dataset.col);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(Array.from(hiddenCols))); } catch (err) { /* not kept on this device */ }
    applyCols();
  });
  $('colBox').addEventListener('input', e => e.stopPropagation());
}

function applyCols() {
  let st = $('colStyle');
  if (!st) { st = document.createElement('style'); st.id = 'colStyle'; document.head.appendChild(st); }
  st.textContent = Array.from(hiddenCols).map(k => '#taskTable .c-' + k + '{display:none}').join('');
  applySticky();
}

// Keeps the visible ⋮⋮ / Priority / ID_Item / Task columns fixed on the left while the Gantt scrolls (wide screens only, see CSS)
function applySticky() {
  let st = $('stkStyle');
  if (!st) { st = document.createElement('style'); st.id = 'stkStyle'; document.head.appendChild(st); }
  let left = 0, css = '';
  for (const c of COLS.filter(c => c.stk && !hiddenCols.has(c.k))) {
    const th = document.querySelector('#headRow th.c-' + c.k);
    const w = th ? th.getBoundingClientRect().width : 0;
    if (!w) return;                                   // table not on screen (other tab): keep the last offsets
    css += '#taskTable .c-' + c.k + '{left:' + left.toFixed(1) + 'px}';
    left += w;
  }
  st.textContent = css;
}

function makeRow(t) {
  const tr = document.createElement('tr');
  const x = t.extra || {};
  tr.dataset.extra = JSON.stringify(x);
  tr.innerHTML = COLS.map(c => '<td class="c-' + c.k + (c.stk ? ' stk' : '') + (c.k === 'pri' ? ' pri-cell' : '') + '">' + cellHtml(c, t, x) + '</td>').join('');
  tr.querySelector('.x').addEventListener('click', () => { tr.remove(); recalc(); });
  tr.addEventListener('pointerdown', e => pressRow(tr, e));
  return tr;
}

/* ---------- drag rows to change priority (mouse and touch, no arrows) ----------
 * Mouse: press anywhere on the row (not in a box) and drag.
 * Touch: press and hold the row for a moment, then slide; or slide the ⋮⋮ handle right away.
 * A quick swipe on a phone still scrolls the page. */
let dragActive = false;
let pressPending = false;
const HOLD_MS = 350, SLOP = 8;

function pressRow(tr, e) {
  if (dragActive) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('input,textarea,select,button,a')) return;
  if (e.pointerType === 'mouse' || e.target.closest('.grip')) { e.preventDefault(); startDrag(tr, e); return; }
  const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
  pressPending = true;
  const done = () => {
    pressPending = false;
    clearTimeout(timer);
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', done);
    document.removeEventListener('pointercancel', done);
  };
  const mv = ev => { if (ev.pointerId === id && (Math.abs(ev.clientX - x0) > SLOP || Math.abs(ev.clientY - y0) > SLOP)) done(); };
  const timer = setTimeout(() => { done(); startDrag(tr, e); }, HOLD_MS);
  document.addEventListener('pointermove', mv);
  document.addEventListener('pointerup', done);
  document.addEventListener('pointercancel', done);
}

function startDrag(tr, e) {
  const id = e.pointerId;
  const before = Array.from(tr.parentNode.children);
  dragActive = true;
  tr.classList.add('dragging');
  document.body.classList.add('dragging-on');
  if (e.pointerType !== 'mouse' && navigator.vibrate) { try { navigator.vibrate(15); } catch (err) { /* no vibration */ } }
  const move = ev => {
    if (ev.pointerId !== id) return;
    ev.preventDefault();
    if (ev.clientY < 50) window.scrollBy(0, -12);
    else if (ev.clientY > window.innerHeight - 50) window.scrollBy(0, 12);
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const over = el && el.closest ? el.closest('#tbody tr') : null;
    if (over && over !== tr && over.parentNode === tr.parentNode) {
      const r = over.getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) over.parentNode.insertBefore(tr, over);
      else over.parentNode.insertBefore(tr, over.nextSibling);
      renumber();
    }
  };
  const up = ev => {
    if (ev.pointerId !== id) return;
    dragActive = false;
    tr.classList.remove('dragging');
    document.body.classList.remove('dragging-on');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    const after = Array.from(tr.parentNode.children);
    if (after.some((r, i) => r !== before[i])) recalc();   // only a real move changes priority and saves
  };
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

// While a row is being dragged with a finger, the page must not scroll.
// The empty non-passive touchstart makes the browser wait for us, so the touchmove can still be cancelled after the hold.
$('tbody').addEventListener('touchstart', () => {}, { passive: false });
$('tbody').addEventListener('touchmove', e => { if (dragActive && e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if ((dragActive || pressPending) && !e.target.closest('input,textarea')) e.preventDefault(); });

function nextId() {
  const used = new Set(Array.from(document.querySelectorAll('[data-f="id"]')).map(i => i.value.trim()));
  let n = 1;
  while (used.has('T' + n)) n++;
  return 'T' + n;
}

function loadSample() {
  $('tbody').innerHTML = '';
  SAMPLE.forEach(t => $('tbody').appendChild(makeRow(t)));
  renumber();
}

// Raw values from the table rows, including the Excel columns the scheduler does not use
function rowsRaw() {
  return Array.from(document.querySelectorAll('#tbody tr')).map(tr => {
    const v = n => tr.querySelector('[data-f="' + n + '"]').value.trim();
    return {
      id: v('id'), name: v('name'), res: v('res'), dur: v('dur'), due: v('due'), preds: v('preds'), fixed: v('fixed'),
      extra: Object.assign(JSON.parse(tr.dataset.extra || '{}'),
        Object.fromEntries(Array.from(tr.querySelectorAll('[data-x]')).map(i => [i.dataset.x, i.value.trim()])))
    };
  });
}

function readTasks() {
  return rowsRaw().map((r, i) => ({
    id: r.id || '?',
    name: r.name || '(unnamed)',
    res: r.res || 'Team',
    dur: Math.max(0, parseFloat(r.dur) || 0),
    due: parseDate(r.due),
    pri: i + 1,
    preds: r.preds.split(/[,;\s]+/).filter(Boolean),
    fixed: parseDate(r.fixed),
    projectNo: String((r.extra && r.extra.project_no) || '').slice(0, 20),
    idx: i
  }));
}

/* ---------- scheduler ---------- */
function schedule(list, over, startDate) {
  const dayIndex = dt => Math.round((dt - startDate) / 86400000);
  const dayWin = d => {
    const dt = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + d);
    const k = fmtKey(dt);
    if (over.has(k)) return over.get(k);
    return week[(dt.getDay() + 6) % 7];
  };

  const T = list.map((t, i) => ({
    ...t, idx: i, rem: t.dur, fin: null, first: null, ready: null, wait: 0, segs: [],
    fixedAbs: t.fixed ? Math.max(0, dayIndex(t.fixed)) * 24 : -Infinity,
    dueAbs: t.due ? (dayIndex(t.due) + 1) * 24 : null
  }));
  const byId = new Map(T.map(t => [t.id, t]));
  T.forEach(t => {
    t.predT = t.preds.map(p => byId.get(p)).filter(Boolean);
    t.missing = t.preds.filter(p => !byId.has(p));
  });
  const EPS = 1e-9;
  let open = T.length;

  for (let d = 0; d < MAXD && open > 0; d++) {
    const w = dayWin(d);
    if (!w) continue;
    const n = Math.round((w.e - w.s) / SLOT);
    for (let k = 0; k < n && open > 0; k++) {
      const now = d * 24 + w.s + k * SLOT;
      const isReady = x => x.fin === null && x.missing.length === 0 &&
                           x.predT.every(p => p.fin !== null && p.fin <= now) && now >= x.fixedAbs;

      T.forEach(x => { if (x.fin === null && x.dur <= EPS && isReady(x)) { x.fin = now; x.ready = x.ready ?? now; open--; } });

      const readyNow = T.filter(x => x.fin === null && x.rem > EPS && isReady(x));
      readyNow.forEach(x => { if (x.ready === null) x.ready = now; });

      // leveling: per resource, the most important ready task (lowest priority number) gets the slot
      const best = new Map();
      readyNow.forEach(x => {
        const cur = best.get(x.res);
        if (!cur) { best.set(x.res, x); return; }
        const dueA = x.dueAbs ?? Infinity, dueB = cur.dueAbs ?? Infinity;
        if (x.pri < cur.pri || (x.pri === cur.pri && (dueA < dueB || (dueA === dueB && x.idx < cur.idx)))) best.set(x.res, x);
      });
      const chosen = new Set(best.values());
      readyNow.forEach(x => { if (!chosen.has(x)) x.wait += SLOT; });

      best.forEach(x => {
        const use = Math.min(SLOT, x.rem);
        if (x.first === null) x.first = now;
        const last = x.segs[x.segs.length - 1];
        if (last && Math.abs(last.e - now) < EPS) last.e = now + use;
        else x.segs.push({ s: now, e: now + use });
        x.rem -= use;
        if (x.rem <= EPS) { x.fin = now + use; open--; }
      });
    }
  }
  return { T: T, dayWin: dayWin };
}

// The project starts on the earliest fixed start, or today, moved forward to the first working day.
function anchorDate(list, over) {
  const fixed = list.map(t => t.fixed).filter(Boolean);
  let base = fixed.length ? new Date(Math.min(...fixed.map(d => d.getTime()))) : new Date();
  base = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const winOn = dt => { const k = fmtKey(dt); return over.has(k) ? over.get(k) : week[(dt.getDay() + 6) % 7]; };
  for (let i = 0; i < 60 && !winOn(base); i++) base = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  return base;
}

/* ---------- formatting ---------- */
function fmtAbs(h, startDate) {
  const d = Math.floor(h / 24), hr = h - d * 24;
  const dt = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + d);
  const hh = Math.floor(hr + 1e-9), mm = Math.round((hr - hh) * 60);
  return DN[dt.getDay()] + ' ' + dt.getDate() + ' ' + MN[dt.getMonth()] + ' ' + pad(hh) + ':' + pad(mm);
}
function fmtDay(dt) { return DN[dt.getDay()] + ' ' + dt.getDate() + ' ' + MN[dt.getMonth()]; }

/* ---------- render ---------- */
function recalc() {
  renumber();
  const over = readCalendar();
  const list = readTasks();
  const startDate = anchorDate(list, over);
  const res = schedule(list, over, startDate);
  const T = res.T;

  let late = 0, unsched = 0, totalWait = 0, finishMax = 0;
  T.forEach(x => {
    x.isLate = x.fin !== null && x.dueAbs !== null && x.fin > x.dueAbs + 1e-9;
    if (x.fin === null) unsched++;
    else { finishMax = Math.max(finishMax, x.fin); if (x.isLate) late++; }
    totalWait += x.wait;
  });

  const finishTxt = finishMax ? fmtAbs(finishMax, startDate) : 'n/a';
  $('summary').innerHTML =
    '<div class="kpi"><b>' + esc(finishTxt) + '</b><span>Project finish</span></div>' +
    '<div class="kpi"><b class="' + (late ? 'late' : 'ok') + '">' + late + ' of ' + T.length + '</b><span>Tasks late</span></div>' +
    '<div class="kpi"><b>' + totalWait.toFixed(2) + ' h</b><span>Total resource waiting</span></div>' +
    (unsched ? '<div class="kpi"><b class="late">' + unsched + '</b><span>Not scheduled (cycle, missing predecessor, or beyond cap)</span></div>' : '');

  const trs = Array.from(document.querySelectorAll('#tbody tr'));
  T.forEach((x, i) => {
    const tr = trs[i];
    if (!tr) return;
    const ok = x.fin !== null;
    const set = (k, h) => { const td = tr.querySelector('td.c-' + k); if (td) td.innerHTML = h; };
    const why = !ok && x.missing.length ? ' (missing: ' + esc(x.missing.join(', ')) + ')' : '';
    set('start', x.first !== null ? fmtAbs(x.first, startDate) : '–');
    set('finish', ok ? fmtAbs(x.fin, startDate) : '–');
    set('wait', x.wait.toFixed(2));
    set('margin', (ok && x.dueAbs !== null) ? ((x.dueAbs - x.fin) / 24).toFixed(2) : '–');
    set('sched', (!ok ? '<span class="late">Not scheduled</span>' : x.isLate ? '<span class="late">Late</span>' : '<span class="ok">On time</span>') + why);
  });

  lastRender = { T: T, startDate: startDate, dayWin: res.dayWin };
  drawGantt(T, startDate, res.dayWin);
  applySticky();
  queueSave();
}

// Zoom levels. "hours" draws only working time. The other levels draw calendar time, with non-working days shaded.
const ZOOM = { hours: { pxHour: 50 }, day: { pxDay: PXD }, week: { pxDay: 16 }, month: { pxDay: 5 } };

function drawGantt(T, startDate, dayWin) {
  let maxH = 0;
  T.forEach(x => { if (x.fin !== null) maxH = Math.max(maxH, x.fin); if (x.dueAbs !== null) maxH = Math.max(maxH, x.dueAbs); });
  const D = Math.max(7, Math.ceil(maxH / 24) + 2);
  const dayDate = i => new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
  const wins = [];
  for (let i = 0; i < D; i++) wins.push(dayWin(i));

  let xOf, W = 0, head = '', grid = '';
  if (zoom === 'hours') {
    const P = ZOOM.hours.pxHour;
    const cum = [0];
    for (let i = 0; i < D; i++) cum.push(cum[i] + (wins[i] ? wins[i].e - wins[i].s : 0));
    xOf = abs => {
      const d = Math.min(D - 1, Math.max(0, Math.floor(abs / 24)));
      const w = wins[d];
      if (!w) return cum[d] * P;
      const rel = abs - d * 24;
      return (cum[d] + Math.min(w.e - w.s, Math.max(0, rel - w.s))) * P;
    };
    W = cum[D] * P;
    for (let i = 0; i < D; i++) {
      const w = wins[i];
      if (!w) continue;
      const dt = dayDate(i);
      head += '<div class="day head" style="left:' + (cum[i] * P).toFixed(1) + 'px;width:' + ((w.e - w.s) * P).toFixed(1) + 'px">' +
              DN[dt.getDay()] + '<br>' + dt.getDate() + ' ' + MN[dt.getMonth()] + '</div>';
      grid += '<div class="sep" style="left:' + (cum[i] * P).toFixed(1) + 'px"></div>';
    }
  } else {
    const P = ZOOM[zoom].pxDay;
    xOf = abs => (abs / 24) * P;
    W = D * P;
    if (zoom === 'day') {
      for (let i = 0; i < D; i++) {
        const dt = dayDate(i);
        head += '<div class="day head" style="left:' + (i * P) + 'px;width:' + P + 'px">' + DN[dt.getDay()] + '<br>' + dt.getDate() + ' ' + MN[dt.getMonth()] + '</div>';
      }
    } else if (zoom === 'week') {
      for (let i = 0; i < D; i += 7) {
        const dt = dayDate(i);
        head += '<div class="day head" style="left:' + (i * P) + 'px;width:' + (7 * P) + 'px">Wk ' + dt.getDate() + ' ' + MN[dt.getMonth()] + '</div>';
      }
    } else {
      let i = 0;
      while (i < D) {
        const dt = dayDate(i);
        let j = i;
        while (j < D && dayDate(j).getMonth() === dt.getMonth()) j++;
        head += '<div class="day head" style="left:' + (i * P) + 'px;width:' + ((j - i) * P) + 'px">' + MN[dt.getMonth()] + ' ' + dt.getFullYear() + '</div>';
        i = j;
      }
    }
    for (let i = 0; i < D; i++) {
      if (!wins[i]) grid += '<div class="nw" style="left:' + (i * P) + 'px;width:' + P + 'px"></div>';
    }
  }

  const th = document.querySelector('#headRow th.c-gantt');
  if (th) th.innerHTML = '<div class="g-track" style="width:' + W + 'px">' + head + '</div>';
  const trs = Array.from(document.querySelectorAll('#tbody tr'));
  T.forEach((x, i) => {
    const td = trs[i] && trs[i].querySelector('td.c-gantt');
    if (!td) return;
    let html = '<div class="g-track" style="width:' + W + 'px">' + grid;
    x.segs.forEach(s => {
      const left = xOf(s.s), width = Math.max(2, xOf(s.e) - xOf(s.s));
      html += '<div class="bar-s' + (x.isLate ? ' late' : '') + '" style="left:' + left.toFixed(2) + 'px;width:' + width.toFixed(2) + 'px" title="' +
              esc(x.id) + ': ' + fmtAbs(s.s, startDate) + ' to ' + fmtAbs(s.e, startDate) + '"></div>';
    });
    if (x.dueAbs !== null) {
      html += '<div class="due" style="left:' + xOf(x.dueAbs).toFixed(2) + 'px" title="Due ' + (x.due ? fmtDay(x.due) : '') + '"></div>';
    }
    td.innerHTML = html + '</div>';
  });
}

/* ---------- paste from Excel ---------- */
// 0-based positions in the 15-column Excel layout
const COL = { id_label: 0, item: 1, status: 2, project_no: 3, phase: 4, task_date: 5, name: 6, other: 7, description: 8, res: 9, dur: 10, due: 11, preds: 13, id: 14 };

function parseFlexDate(s) {
  s = String(s || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);       // day/month/year
  if (m) return ymd(+m[3], +m[2], +m[1]);
  if (/^\d{5}$/.test(s)) {                                         // Excel serial date
    const dt = new Date(1899, 11, 30 + (+s));
    return ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return '';
}

function parsePaste(text) {
  const out = [];
  text.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const c = line.split('\t');
    const g = i => (c[i] === undefined ? '' : c[i]).trim();
    const id = g(COL.id);
    if (!id || /^(ID|ID_Item)$/i.test(id)) return;                 // skip header row
    out.push({
      id: id, name: g(COL.name) || '(unnamed)', res: g(COL.res) || 'Team',
      dur: g(COL.dur), due: parseFlexDate(g(COL.due)), preds: g(COL.preds), fixed: '',
      extra: {
        id_label: g(COL.id_label), item: g(COL.item), status: g(COL.status), project_no: g(COL.project_no),
        phase: g(COL.phase), task_date: g(COL.task_date), other: g(COL.other), description: g(COL.description)
      }
    });
  });
  return out;
}

function addPasted(replace) {
  const rows = parsePaste($('paste').value);
  if (!rows.length) { setStatus('Nothing to add: no rows with an ID were found.', true); return; }
  if (replace) $('tbody').innerHTML = '';
  rows.forEach(r => $('tbody').appendChild(makeRow(r)));
  $('paste').value = '';
  recalc();
}

/* ---------- log in, register, log out ---------- */
function showLoginTab(login) {
  $('loginForm').hidden = !login;
  $('registerForm').hidden = login;
  $('showLogin').classList.toggle('on', login);
  $('showRegister').classList.toggle('on', !login);
  $('authMsg').textContent = '';
}

async function boot() {
  buildHead();
  buildColMenu();
  applyCols();
  buildWeekRow();
  loadSample();
  renumber();
  try {
    const me = await api('me');
    if (me.user) await enterApp(me.user);
    else showAuth('');
  } catch (e) {
    showAuth('Could not reach the server: ' + e.message);
  }
}

/* ---------- wiring ---------- */
$('showLogin').addEventListener('click', () => showLoginTab(true));
$('showRegister').addEventListener('click', () => showLoginTab(false));

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } });
    await enterApp(r.user);
  } catch (err) { $('authMsg').textContent = err.message; }
});

$('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('register', { method: 'POST', body: { company: f.get('company'), name: f.get('name'), email: f.get('email'), password: f.get('password') } });
    await enterApp(r.user);
  } catch (err) { $('authMsg').textContent = err.message; }
});

$('logoutBtn').addEventListener('click', async () => {
  try { await api('logout', { method: 'POST', body: {} }); } catch (e) { /* ignore: we reload anyway */ }
  location.reload();
});

$('addUserForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api('users', { method: 'POST', body: { name: f.get('name'), email: f.get('email'), password: f.get('password'), role: f.get('role') } });
    $('teamMsg').textContent = 'User added. Give them the temporary password and ask them to change it.';
    e.target.reset();
    loadTeam();
  } catch (err) { $('teamMsg').textContent = err.message; }
});

$('pasteAppend').addEventListener('click', () => addPasted(false));
$('pasteReplace').addEventListener('click', () => addPasted(true));

document.querySelectorAll('.tabbtn[data-tab]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabbtn[data-tab]').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === b.dataset.tab));
  applySticky();
}));
window.addEventListener('resize', applySticky);

document.querySelectorAll('.zbtn').forEach(b => b.addEventListener('click', () => {
  zoom = b.dataset.z;
  document.querySelectorAll('.zbtn').forEach(x => x.classList.toggle('on', x === b));
  if (lastRender) { drawGantt(lastRender.T, lastRender.startDate, lastRender.dayWin); applySticky(); }
}));

$('addBtn').addEventListener('click', () => {
  $('tbody').appendChild(makeRow({ id: nextId(), name: 'New task', res: 'Eng A', dur: 4, due: '', preds: '', fixed: '', extra: {} }));
  recalc();
});

$('resetBtn').addEventListener('click', () => {
  if (!confirm('Replace the current table with the sample tasks?')) return;
  loadSample();
  recalc();
});

$('appBox').addEventListener('input', recalc);
$('appBox').addEventListener('change', recalc);

boot();
})();
