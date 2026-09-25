# Applying trigger-bearing migrations

Use the explicitly targeted runner for production:

```sh
npm run db:migrate -- --remote --env production --account-id ACTUAL_ACCOUNT_ID --database-id ACTUAL_DATABASE_ID
```

This performs remote writes. Run it only after the account, production D1
binding and migration plan have been approved. Keep the service disabled while
bootstrapping. It does not deploy a Worker, configure secrets or enable cron.
Account and database IDs must match the production `DB` binding. The runner
pins that binding in a temporary configuration; concurrent edits to the main
Wrangler configuration cannot redirect the operation. No credentials are copied
into the temporary config, and it is removed when the process finishes.

The runner preserves the SQL migration files. It checks that `d1_migrations` is
an ordered prefix of the checked-in filenames, then imports each remaining file
**together with its migration-history INSERT in the same SQL file**. It uses
Wrangler `d1 execute --remote --file`, which selects D1's atomic `/import`
pipeline. It verifies history after each import and stops on any error.
An already-applied migration is not rewritten or replayed. An existing schema
without matching history is an error, not an invitation to fake a ledger row.
Schema definitions are compared with an in-memory SQLite replay of the recorded
migration prefix, before and after applying files. Missing/changed triggers,
unexpected tables or other schema drift stop the runner. This runner targets
the project's SQLite-compatible migrations; a future migration requiring
provider-specific SQL needs its own supported rehearsal rather than bypassing
these checks.

Wrangler 4.135 can print its import spinner before the JSON result even with
`--json`. The runner accepts only the known spinner lines followed by a complete,
nonempty success-result array. Nonzero exits, failed results, missing/truncated
JSON and unexpected output still fail visibly. A parsing failure can occur
**after a successful commit**: inspect schema/history before doing anything else.

Wrangler 4.135 `d1 migrations apply --remote` instead posts the combined SQL
string to `/query`, whose server-side statement splitting can reject valid
trigger bodies with `incomplete input: SQLITE_ERROR`. Local migrations use a
different client-side splitter and therefore do not prove remote compatibility.
Related reports: [workers-sdk #15314](https://github.com/cloudflare/workers-sdk/issues/15314)
and [#15178](https://github.com/cloudflare/workers-sdk/issues/15178).
Our initial SQL already uses uppercase `BEGIN` and LF; changing casing or
line endings would not explain the observed failure.

If an import response is lost, inspect the remote history and schema first.
The schema and ledger are in one atomic import: a completed import can be
recognized and skipped on retry, while a failed import rolls back both.
Concurrent attempts cannot both commit the same migration: the unique ledger
name makes the second import roll back. The losing runner fails visibly; inspect
history before retrying. Coordinate deployments rather than deliberately racing.
Do not separately import the schema and then manually insert a history row.
Do not drop tables, remove triggers or mark a failed migration as applied.

The file contains SQLite SQL, not a SQLite binary. Do not add explicit
`BEGIN TRANSACTION`/`COMMIT` wrappers: D1 supplies the transaction. No reserved
`_cf_KV` definition is included. This application's small schema is well below
the documented 5 GiB import limit; the runner does not split trigger bodies or
disable foreign keys. See Cloudflare's [import constraints](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Local-only rehearsal on isolated storage:

```sh
npm run db:migrate -- --local --persist-to .worker/migration-rehearsal
```

This verifies the runner and SQL locally, **not** D1's remote parser. Remote
success must still be verified by the authorized deployer, including all three
capacity/quota triggers and the expected history row.
