# PostGIS Runtime Prerequisite — Rehearsal & Rollback Runbook (P1-W4, Task 5)

> Status: image compatibility **verified in an isolated probe container**. The
> production container `research-app-postgres` was NOT changed. Operational image
> swap remains a separate, explicitly-approved step (plan Task 10).

## Frozen baseline (measured 2026-07-21)

| Property | Production (current) | Candidate (PostGIS) |
|---|---|---|
| Image | `timescale/timescaledb:latest-pg16` (ID `ba149561ad4d`, Alpine/musl) | `timescale/timescaledb-ha:pg16` (digest `sha256:b8891426a9a877bcc29f85572134ec66d258aebd6bdcf84ddb853d73a6ccf29a`, Ubuntu 22.04/glibc) |
| PostgreSQL | 16.14 | 16.14 |
| TimescaleDB | 2.28.2 | 2.28.3 |
| pgvector | 0.8.1 | 0.8.5 |
| pgcrypto / pg_trgm / dblink | 1.3 / 1.6 / 1.2 | 1.3 / 1.6 / 1.2 |
| PostGIS | **not available** (`pg_available_extensions` absent) | **3.6.4** (postgis, postgis_raster, postgis_topology) |
| Extras | — | timescaledb_toolkit 1.23.0 |

## Rehearsal performed (isolated, non-destructive)

Probe container: `p1w4-postgis-probe` (from the candidate image).

1. **Extension create** — timescaledb, postgis, vector, pgcrypto, pg_trgm, dblink all `CREATE EXTENSION` succeed.
2. **PostGIS smoke** — `ST_MakePoint` / `ST_SetSRID(...,4326)` / `ST_DistanceSphere` return correct values (Seoul↔Tokyo ≈ 1 150 316 m).
3. **Production clone restore ×2** — production schema (schema-only, timescale internals excluded) + core/knowledge/ingestion data streamed into the candidate image twice.
   - App roles (`si_*`, `stock_insight_*`) pre-created as NOLOGIN so RLS policies/grants restore cleanly.
   - Parity identical across both restores: `entities=1271`, `events=3041`, `src_rev=483`.
   - `postgis_version() = 3.6 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`.

Evidence logs: `/tmp/stock-insight-p1-w4-image-rehearsal/`.

## Compatibility notes / risks

- **Base OS change (Alpine→Ubuntu).** Both are official Timescale images; the
  restore parity check exercises the exact production schema + RLS, so the glibc
  base is validated against real objects, not just a smoke test.
- **Minor extension version bumps** (TimescaleDB 2.28.2→2.28.3, vector
  0.8.1→0.8.5) are forward within the same minor line; restore succeeded with no
  version conflict. A production swap must re-run this rehearsal against a fresh
  dump at swap time.
- **RLS role prerequisite.** A restore into any fresh container must pre-create
  the 10 app roles before loading the schema, or RLS policy DDL fails on a
  missing role. This is a restore-ordering requirement, not an image defect.

## Rollback (for the eventual, separately-approved operational swap)

1. Keep the current `timescale/timescaledb:latest-pg16` image (ID `ba149561ad4d`) pinned and untagged-for-delete as the rollback target.
2. Take a full `pg_dump` + volume snapshot immediately before any swap.
3. If the candidate container fails health/login/app-query readback, stop it and
   restart the pinned rollback image against the pre-swap volume/dump.
4. Record whether rollback was used.

## Not done here (requires separate approval)

- Replacing the running `research-app-postgres` container/image.
- Any change to the production database contents.
