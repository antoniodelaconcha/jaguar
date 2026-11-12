# Changelog

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
