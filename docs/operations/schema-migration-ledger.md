# Schema migration ledger

`packages/db-schema` holds 54 additive migrations. Until 2026-08-02 nothing applied
them and nothing recorded which had landed — `listAppMigrations()` returned the array
and stopped there, so "is this schema up to date?" could only be answered by
querying the live database and guessing.

`public.migration_runs` does **not** answer it either: despite the name it is a
pipeline job log (ingestion, analytics, backfills).

## Usage

```bash
cd apps/api
DATABASE_URL=… pnpm schema:status     # dry run: what is pending
DATABASE_URL=… pnpm schema:apply      # apply pending migrations
DATABASE_URL=… pnpm schema:baseline   # record all as applied WITHOUT executing
```

`schema:status` is read-only and rolls back. `--baseline` requires `--apply`
because it writes ledger rows.

## Ledger

`public.schema_migration`:

| column | meaning |
| --- | --- |
| `migration_id` | registry id, e.g. `031_truth_kernel` |
| `checksum` | sha256 of the SQL that was run |
| `applied_at`, `applied_by`, `duration_ms` | provenance |
| `baselined` | `true` when recorded without executing |

The checksum catches the one failure an id-keyed ledger cannot see: a migration
**edited after it was applied**. The id still matches while the SQL the database
ran no longer exists in the repository. The runner refuses to proceed on drift
rather than re-applying or ignoring it.

The whole run is one transaction with an advisory lock, so a mid-run failure
leaves the ledger and the schema consistent, and two concurrent runners cannot
both decide the ledger is empty.

## Production was baselined, not replayed

Production already had all 54 applied. On 2026-08-02 it was baselined —
54 rows recorded, nothing executed — so `baselined = true` for all of them.
Any migration added from now on applies normally and records `baselined = false`.

## What this does NOT tell you

**The schema cannot be rebuilt from this repository.** The 54 migrations are
*additive on a base schema they do not own*. A fresh database fails immediately:

```
error: relation "public.entities" does not exist
```

Measured dependency: the migrations create ~306 objects and reference 33 they
never create. The clearly external ones:

| schema | objects that must pre-exist |
| --- | --- |
| `public` | `entities`, `user_positions`, `user_watchlist`, `source_documents`, `app_users`, `market_signals` |
| `ops` | `forecast_issuance_ledger`, `source_collection_policy`, `temporal_graph_edge`, `forecast_outcome_ledger`, … |
| `stock` | `candidates`, `macro_observations`, `market_snapshots` |
| `market_ts` | `ohlcv` |
| `watchlist` | `predictions` |
| `crypto` | `candidates` |

(plus the `pgcrypto` extension for `digest`)

That base belongs to the older research app that shares this database. So the
ledger answers **"which of our 54 migrations are applied"** — it does not answer
**"can we recreate this database"**. Disaster recovery still depends on
`ops/scripts/backup-research-app-*.sh` and the pgBackRest restore drill, not on
replaying migrations.

Closing that gap means either taking ownership of the base schema in this repo or
documenting it as an external contract with its own provenance. Neither is done.

## Two migration series, deliberately not merged

`ops/db/migrations/222_publication_record_revision.sql` is not a stray file with an
odd number. `220` and `221` exist too — as marker tables in the live database:

```
ops.stock_prediction_loop_migration_220
ops.stock_fixed_horizon_migration_221
```

each holding one row of `migration_id`, `migration_token`, `installed_at`. That is
the **legacy research app's** convention: a per-migration marker table rather than a
central ledger. `222` is a migration in *that* series which this repository happens
to author, and it operates on legacy-owned territory (`ops.*`,
`public.publication_records`, `public.analysis_run_record`). It is live — 6,478 rows
in `ops.publication_record_revision`.

It is not folded into `additiveAppMigrations`, for three reasons:

- Renumbering it to `055_` would claim ownership of schema this repository does not
  own, and would break the rehearsal script and test that refer to it as 222.
- The file carries its own `BEGIN;`/`COMMIT;` and advisory lock. Running it inside
  the runner's single transaction would nest transactions.
- It follows the legacy series' review and rehearsal path, not ours.

What *was* wrong is that it was recorded nowhere — not in our ledger, and (unlike
220 and 221) not by a marker table either. It is now recorded in
`public.schema_migration` with `source = 'ops/db/migrations'`.

The planner filters on `source = 'db-schema'`, so a foreign row can never be
mistaken for one of ours; `schema:status` reports them separately:

```json
"otherSeries": ["ops/db/migrations:222_publication_record_revision"]
```

**Convention**: a raw SQL migration added under `ops/db/migrations/` must be
recorded in `public.schema_migration` with its file's sha256 and
`source = 'ops/db/migrations'` when it is applied by hand.
