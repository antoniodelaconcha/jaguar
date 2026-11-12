# Jaguar field map

Table `tasks` (one row per task, per tenant and user). Keep this file in step with every database change.

| Table header (v3.1) | Front-end key | API JSON | DB column | Type / notes |
|---|---|---|---|---|
| (row order) / Priority | position | (array order) | `position` | Row order = priority, top = 1 |
| Task, line 1 | id | `id` | `id_item` | ID_Item: [JournalID]_[ItemNo] global task ID |
| Task, line 1 | name | `name` | `task` | Task description |
| Task, line 2 | res | `res` | `owner` | Owner / resource |
| Task, line 2 | project_no | `extra.project_no` | `project_no` | Project No |
| Task, line 2 | dur | `dur` | `duration_h` | Dur, working hours |
| Pdd | due | `due` | `due_date` + `due_time` | Pdd = probable due date. Time NULL = noon (12:00) |
| Predecessors | preds | `preds` | `predecessor` | Comma-separated ID_Item values (p) |
| Fixed start | fixed | `fixed` | `fixed_start` + `fixed_time` | Time NULL = p finish that day (after leveling), else start of that working day |
| ID | id_label | `extra.id_label` | `id_label` | Excel column |
| Item | item | `extra.item` | `item` | Excel column |
| Status | status | `extra.status` | `status` | Excel column |
| Phase | phase | `extra.phase` | `phase` | Excel column |
| Date | task_date | `extra.task_date` | `task_date` | Excel column, free text |
| Other | other | `extra.other` | `other` | Excel column |
| Description | description | `extra.description` | `description` | Excel column |
| Start | (computed) | – | – | Leveled start; not CPM ES yet |
| Finish | (computed) | – | – | Leveled finish; not CPM EF yet |
| Project finish | (computed) | – | – | Not CPM F yet |
| Waiting (h), Margin, Schedule | (computed) | – | – | Not stored |

API dates: `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` (24-hour). Display: yymmmdd HH:MM (26Nov20 14:30).
Header names stay as above until slack/CPM is handled; then they change to the Terminology codes (ES, EF, F, ...).
