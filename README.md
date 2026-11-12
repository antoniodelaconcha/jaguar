# Jaguar Task Scheduler

PHP + MySQL, multi-tenant task scheduler with a Gantt chart. Hosted on HostPapa (cPanel).

Live: https://nahuatl.greenpointengineering.ca/azteca/jaguar/

## Where each folder goes on the server

| Repo folder | Server folder |
|---|---|
| `public/`  | `public_html/nahuatl/azteca/jaguar/` |
| `private/` | `nahuatl-private/jaguar/` |

`private/config.php` is not in the repo (it holds the database password).
Copy `private/config.example.php` to `config.php` on the server and fill in the values.

Not yet in the repo: `database/schema.sql` and `DEPLOY.md`. Database changes per version are in `database/migrations/`.
Field names (table header / code / database column): see `FIELDS.md`.

## Versions

See `CHANGELOG.md`. Each version is a commit titled with its number. The live files from before v3.0 are the Baseline commit.
