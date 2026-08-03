import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// Closes pipeline runs that were killed before they could record an outcome.
//
// A wrapper writes its audit row at start with status 'running' and rewrites it
// on completion or via its EXIT trap on failure. When the process dies without
// running that trap — SIGKILL, OOM, host restart — the row stays 'running' with
// finished_at NULL forever. It counts as neither a success nor a failure, so
// every "runs since last success" metric steps over it and the job looks idle
// rather than broken.
//
// Two such rows have been sitting in the table since 2026-07-26
// (stock-insight-knowledge-wrapper) and 2026-07-27 (sync_daily_to_postgres) with
// nothing anywhere noticing.
//
// Why this is a periodic job and not systemd OnFailure=:
//   - sync_daily_to_postgres is a cron entry, not a systemd unit, so no
//     OnFailure= can ever reach it.
//   - An OnFailure= handler receives the unit name, not the wrapper's attempt id,
//     so it cannot tell which row to close.
//   - On an OOM kill or host restart the handler may not run at all.
// One periodic sweep covers all three cases without a unit-to-job mapping.
//
// Threshold: the longest run ever recorded is 6m30s over 3,727 completed runs,
// but the ceiling that matters is the largest unit TimeoutStartSec (90 minutes,
// stock-insight-market-enrichment). A job may legitimately still be running right
// up to that limit, so the default sits above it. Closing a live run's row would
// make the audit trail lie in the other direction.

const JOB_NAME = 'stock-insight-pipeline-run-reconcile';
const APPLY = process.argv.includes('--apply');
const DEFAULT_STALE_AFTER_HOURS = 2;

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

function staleAfterHours(): number {
  const index = process.argv.indexOf('--stale-after-hours');
  if (index < 0) return DEFAULT_STALE_AFTER_HOURS;
  const value = Number(process.argv[index + 1]);
  // Below the 90-minute unit ceiling this would start closing rows for runs that
  // are still allowed to be running.
  if (!Number.isFinite(value) || value < 2) {
    throw new Error('--stale-after-hours must be at least 2 (largest unit timeout is 90 minutes)');
  }
  return value;
}

// 'killed' rather than 'failed': the run did not fail, it was cut off before it
// could say anything. Recording it as a plain failure would put a defect where
// there may not have been one, and would be indistinguishable from a wrapper that
// ran its trap and reported honestly.
const RECONCILE_SQL = `
UPDATE public.migration_runs
   SET status = 'killed',
       finished_at = now(),
       error = coalesce(nullif(btrim(error), '') || ' | ', '')
               || 'reconciled by ' || $2::text
               || ': no completion recorded within ' || $1::text || ' hours'
 WHERE status = 'running'
   AND finished_at IS NULL
   AND started_at < now() - ($1::text || ' hours')::interval
RETURNING job_name, started_at
`;

const PREVIEW_SQL = `
-- Rendered in SQL: node-postgres hands intervals back as an object, and letting
-- one reach a template string prints "[object Object]".
SELECT job_name, started_at, (now() - started_at)::text AS stalled_for
  FROM public.migration_runs
 WHERE status = 'running'
   AND finished_at IS NULL
   AND started_at < now() - ($1::text || ' hours')::interval
 ORDER BY started_at
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

async function main(): Promise<void> {
  const hours = staleAfterHours();
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client: PoolClient = await pool.connect();

  try {
    if (!APPLY) {
      const preview = await client.query<QueryResultRow>(PREVIEW_SQL, [String(hours)]);
      console.log(
        JSON.stringify(
          {
            job: JOB_NAME,
            mode: 'dry-run',
            hint: 'rerun with --apply',
            staleAfterHours: hours,
            wouldClose: preview.rows.map((row) => ({
              jobName: row.job_name,
              startedAt: row.started_at,
              stalledFor: String(row.stalled_for),
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query('BEGIN');
    const closed = await client.query<QueryResultRow>(RECONCILE_SQL, [String(hours), JOB_NAME]);
    await client.query('COMMIT');

    const summary = {
      job: JOB_NAME,
      mode: 'apply',
      staleAfterHours: hours,
      closed: closed.rowCount ?? 0,
      jobs: closed.rows.map((row) => row.job_name),
    };
    console.log(JSON.stringify(summary, null, 2));

    // Only leave a trace when something was actually reconciled: this runs every
    // 30 minutes and a row per quiet sweep would bury the signal it exists for.
    if ((closed.rowCount ?? 0) > 0) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        `${JOB_NAME}-${randomUUID()}`,
        JOB_NAME,
        'completed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-pipeline-run-reconcile.ts')) {
  await main();
}
