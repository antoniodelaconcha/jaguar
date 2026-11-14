# Changelog

## v3.2 - 2026-11-14 - Fix: logged out too often
Files: private/src/lib.php (private/config.example.php updated for reference). No database change, no front-end change.
- Session files now kept in nahuatl-private/jaguar/sessions/ (created automatically), not the hosting's shared
  session folder, which the cPanel clean-up job and other apps on the account can empty.
- Stay logged in 12 hours after the last action, also after closing the browser (config key session_hours, optional).
- Every request extends the session (sliding expiry).
- Session cookie limited to /azteca/jaguar/ (config key cookie_path, optional) so other apps on the same host
  (Coyote) cannot clash with it.
- Everyone logs in once after deploying.

## v3.1 - 2026-11-12 - Excel-style table, Pdd, 24-hour date and time
Files: public/index.html, public/assets/app.js, public/assets/app.css, public/api/index.php, private/src/lib.php.
Database: database/migrations/v3.1.sql (adds tasks.due_time and tasks.fixed_time; run before the PHP files).
- Task cell grouped: line 1 ID_Item + Task, line 2 Owner · Project No · Dur h. Separate columns for these removed.
- Flat Excel-style cells (no input boxes); column widths set by dragging the header edge, kept per device.
- Entering a cell selects all its text so typing overwrites; arrow keys, Enter, Tab move between cells; F2 edits; Esc undoes.
- Due renamed Pdd (probable due date). Pdd without a time = noon (12:00), also for late/on-time.
- Dates shown as yymmmdd HH:MM, 24-hour. Pdd and Fixed start take an optional time (saved in new columns).
  Fixed start without a time shows (grey, not saved) the predecessor's finish that day, else the start of that working day.
- Date and time pop-up (calendar button or Alt+Down), weeks starting on Sunday, 15-minute steps.
- Theme colour #00B050. Asset links carry ?v=3.1 so browsers load the new files.
- FIELDS.md added: table header / code key / database column map.

## v3.0 - 2026-11-11 - single table with Gantt
Files: public/index.html, public/assets/app.js, public/assets/app.css. Back end unchanged.
- Tasks, schedule results and the Gantt chart are now one table: each task is one row with its bar.
  The separate Results table and Gantt panel are gone.
- Columns menu to hide or show columns, kept per device (browser storage). The Excel columns
  (ID, Item, Status, Phase, Date, Other, Description) are now visible, editable columns, hidden by default.
  Project No is a column (shown by default).
- Rows are reordered by dragging: mouse press-and-drag anywhere on the row; on a phone press and
  hold, then slide (or slide the handle right away). The up/down arrow buttons are removed.
  Order is saved only when a row actually moves.
- Priority, ID_Item and Task stay fixed on the left while the Gantt scrolls (screens wider than 700 px).
- Fix: the Tasks box no longer widens the page on phones.

## Baseline - 2026-11-11 - live files before v3.0
Files as they were live on HostPapa on 2026-11-11 (public and private folders, without config.php).
