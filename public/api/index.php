<?php
declare(strict_types=1);

/*
 * JSON API. The front end calls  api/index.php?a=<action>
 * Actions: csrf, me, register, login, logout, tasks (GET/POST), calendar (GET/POST), users (GET/POST)
 * Every data query filters on tenant_id (the company) and user_id (the person) from the session.
 */

require __DIR__ . '/../../../../../nahuatl-private/jaguar/src/lib.php';

header('X-Content-Type-Options: nosniff');

try {
    start_session();
    $action = (string) ($_GET['a'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($action) {
        case 'csrf':
            json_out(['csrf' => csrf_token()]);

        case 'me':
            $u = current_user();
            json_out(['user' => $u ? public_user($u) : null, 'csrf' => csrf_token()]);

        case 'register':
            need_post();
            check_csrf();
            do_register();
            break;

        case 'login':
            need_post();
            check_csrf();
            do_login();
            break;

        case 'logout':
            need_post();
            check_csrf();
            end_session();
            json_out(['ok' => true]);

        case 'tasks':
            $u = require_user();
            if ($method === 'GET') {
                json_out(['tasks' => get_tasks($u)]);
            }
            need_post();
            check_csrf();
            save_tasks($u);
            break;

        case 'calendar':
            $u = require_user();
            if ($method === 'GET') {
                json_out(get_calendar($u));
            }
            need_post();
            check_csrf();
            save_calendar($u);
            break;

        case 'users':
            $u = require_user();
            require_admin($u);
            if ($method === 'GET') {
                json_out(['users' => list_users($u)]);
            }
            need_post();
            check_csrf();
            add_user($u);
            break;

        default:
            fail('Unknown request.', 404);
    }
} catch (Throwable $e) {
    error_log('Jaguar API error: ' . $e->getMessage());
    fail('Server error. Please try again.', 500);
}

/* ---------- accounts ---------- */

function do_register(): void
{
    if (!cfg()['allow_signup']) {
        fail('Sign-up is closed. Ask your administrator to add you.', 403);
    }
    $in = body();
    $company = clean_str($in['company'] ?? '', 120);
    $name = clean_str($in['name'] ?? '', 120);
    $email = mb_strtolower(clean_str($in['email'] ?? '', 190), 'UTF-8');
    $pass = (string) ($in['password'] ?? '');

    if ($company === '' || $name === '') {
        fail('Company and name are required.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Enter a valid email address.');
    }
    if (strlen($pass) < 10) {
        fail('Password must be at least 10 characters.');
    }
    if (email_taken($email)) {
        fail('That email already has an account.', 409);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO tenants (name) VALUES (?)')->execute([$company]);
        $tenantId = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO users (tenant_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
            ->execute([$tenantId, $email, $name, password_hash($pass, PASSWORD_DEFAULT), 'owner']);
        $userId = (int) $pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    start_user_session($userId);
}

function do_login(): void
{
    $in = body();
    $email = mb_strtolower(clean_str($in['email'] ?? '', 190), 'UTF-8');
    $pass = (string) ($in['password'] ?? '');

    $st = db()->prepare('SELECT id, password_hash FROM users WHERE email = ? AND active = 1');
    $st->execute([$email]);
    $row = $st->fetch();
    if (!$row || !password_verify($pass, $row['password_hash'])) {
        sleep(1); // slows down password guessing
        fail('Wrong email or password.', 401);
    }
    start_user_session((int) $row['id']);
}

function require_admin(array $u): void
{
    if (!in_array($u['role'], ['owner', 'admin'], true)) {
        fail('Only owners and admins can manage users.', 403);
    }
}

function list_users(array $u): array
{
    $st = db()->prepare('SELECT id, name, email, role, active FROM users WHERE tenant_id = ? ORDER BY name');
    $st->execute([$u['tenant_id']]);
    return $st->fetchAll();
}

function add_user(array $u): void
{
    $in = body();
    $name = clean_str($in['name'] ?? '', 120);
    $email = mb_strtolower(clean_str($in['email'] ?? '', 190), 'UTF-8');
    $pass = (string) ($in['password'] ?? '');
    $role = (string) ($in['role'] ?? 'member');

    if ($name === '') {
        fail('Name is required.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Enter a valid email address.');
    }
    if (strlen($pass) < 10) {
        fail('The temporary password must be at least 10 characters.');
    }
    if (!in_array($role, ['member', 'admin'], true)) {
        fail('Role must be member or admin.');
    }
    if (email_taken($email)) {
        fail('That email already has an account.', 409);
    }
    db()->prepare('INSERT INTO users (tenant_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        ->execute([$u['tenant_id'], $email, $name, password_hash($pass, PASSWORD_DEFAULT), $role]);
    json_out(['ok' => true]);
}

/* ---------- tasks ---------- */

function get_tasks(array $u): array
{
    $st = db()->prepare('SELECT * FROM tasks WHERE tenant_id = ? AND user_id = ? ORDER BY position');
    $st->execute([$u['tenant_id'], $u['id']]);
    return array_map(static fn(array $r): array => [
        'id' => (string) $r['id_item'],
        'name' => (string) $r['task'],
        'res' => (string) $r['owner'],
        'dur' => (float) $r['duration_h'],
        'due' => with_time($r['due_date'] ?? null, $r['due_time'] ?? null),
        'preds' => (string) $r['predecessor'],
        'fixed' => with_time($r['fixed_start'] ?? null, $r['fixed_time'] ?? null),
        'extra' => [
            'id_label' => (string) $r['id_label'],
            'item' => (string) $r['item'],
            'status' => (string) $r['status'],
            'project_no' => (string) $r['project_no'],
            'phase' => (string) $r['phase'],
            'task_date' => (string) $r['task_date'],
            'other' => (string) $r['other'],
            'description' => (string) $r['description'],
        ],
    ], $st->fetchAll());
}

/** 'YYYY-MM-DD' plus ' HH:MM' when a time was entered. */
function with_time($date, $time): string
{
    $d = (string) ($date ?? '');
    return ($d !== '' && $time !== null && $time !== '') ? $d . ' ' . substr((string) $time, 0, 5) : $d;
}

/** Replaces this user's whole task list in one transaction (the front end always sends the full list). */
function save_tasks(array $u): void
{
    $in = body();
    $rows = $in['tasks'] ?? null;
    if (!is_array($rows)) {
        fail('Missing task list.');
    }
    $rows = array_values($rows);
    if (count($rows) > 2000) {
        fail('Too many tasks (maximum 2000 per list).');
    }

    $errors = [];
    $seen = [];
    $values = [];
    foreach ($rows as $i => $r) {
        $n = $i + 1;
        if (!is_array($r)) {
            $errors[] = "Row $n: invalid data.";
            continue;
        }
        $id = clean_str($r['id'] ?? '', 60);
        if ($id === '') {
            $errors[] = "Row $n: ID is required.";
            continue;
        }
        if (isset($seen[$id])) {
            $errors[] = "Row $n: ID $id is used more than once.";
            continue;
        }
        $seen[$id] = true;

        $dur = (float) str_replace(',', '.', (string) ($r['dur'] ?? '0'));
        if ($dur < 0 || $dur > 100000) {
            $errors[] = "Row $n: duration must be between 0 and 100000 hours.";
            continue;
        }
        $due = norm_datetime($r['due'] ?? '');
        $fixed = norm_datetime($r['fixed'] ?? '');
        if ($due === false || $fixed === false) {
            $errors[] = "Row $n: dates must look like YYYY-MM-DD or YYYY-MM-DD HH:MM.";
            continue;
        }
        $x = is_array($r['extra'] ?? null) ? $r['extra'] : [];

        $values[] = [
            $u['tenant_id'],
            $u['id'],
            $n,
            $id,
            clean_str($x['id_label'] ?? '', 60),
            clean_str($x['item'] ?? '', 255),
            clean_str($x['status'] ?? '', 60),
            clean_str($x['project_no'] ?? '', 60),
            clean_str($x['phase'] ?? '', 120),
            clean_str($x['task_date'] ?? '', 30),
            clean_str($r['name'] ?? '', 255) ?: '(unnamed)',
            clean_str($x['other'] ?? '', 255),
            clean_str($x['description'] ?? '', 2000),
            clean_str($r['res'] ?? '', 120) ?: 'Team',
            $dur,
            $due[0],
            $due[1],
            clean_str($r['preds'] ?? '', 255),
            $fixed[0],
            $fixed[1],
        ];
    }

    if ($errors) {
        fail('Some rows need fixing before they can be saved.', 422, ['details' => array_slice($errors, 0, 20)]);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM tasks WHERE tenant_id = ? AND user_id = ?')
            ->execute([$u['tenant_id'], $u['id']]);
        $ins = $pdo->prepare(
            'INSERT INTO tasks (tenant_id, user_id, position, id_item, id_label, item, status, project_no, phase,
                                task_date, task, other, description, owner, duration_h, due_date, due_time, predecessor,
                                fixed_start, fixed_time)
             VALUES (' . implode(',', array_fill(0, 20, '?')) . ')'
        );
        foreach ($values as $v) {
            $ins->execute($v);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    json_out(['ok' => true, 'count' => count($values)]);
}

/* ---------- calendar ---------- */

function get_calendar(array $u): array
{
    $st = db()->prepare('SELECT week_json, overrides_text FROM calendars WHERE user_id = ? AND tenant_id = ?');
    $st->execute([$u['id'], $u['tenant_id']]);
    $row = $st->fetch();
    if (!$row) {
        return ['week' => DEFAULT_WEEK, 'overrides' => ''];
    }
    $week = json_decode((string) $row['week_json'], true);
    return [
        'week' => is_array($week) && count($week) === 7 ? $week : DEFAULT_WEEK,
        'overrides' => (string) $row['overrides_text'],
    ];
}

function save_calendar(array $u): void
{
    $in = body();
    $week = $in['week'] ?? null;
    if (!is_array($week) || count($week) !== 7) {
        fail('The calendar needs exactly 7 days, Monday to Sunday.');
    }
    $clean = [];
    foreach (array_values($week) as $pair) {
        if (!is_array($pair) || count($pair) !== 2) {
            fail('Each day needs a start and an end time.');
        }
        $s = norm_time($pair[0]);
        $e = norm_time($pair[1]);
        if ($s === false || $e === false) {
            fail('Times must look like HH:MM.');
        }
        $clean[] = ($s === '' || $e === '') ? ['', ''] : [$s, $e];
    }
    $overrides = clean_str($in['overrides'] ?? '', 5000);

    db()->prepare(
        'INSERT INTO calendars (user_id, tenant_id, week_json, overrides_text) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE week_json = VALUES(week_json), overrides_text = VALUES(overrides_text)'
    )->execute([$u['id'], $u['tenant_id'], json_encode($clean), $overrides]);
    json_out(['ok' => true]);
}
