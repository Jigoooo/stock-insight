import { createHash } from 'node:crypto';

import pg, { type PoolClient } from 'pg';

import { additiveAppMigrations, type AppMigration } from '@stock-insight/db-schema';

// Until now `additiveAppMigrations` was a list nobody applied: migrations were
// run by hand and nothing recorded which of the 54 had landed. "Is this schema
// up to date?" could only be answered by querying the live database and
// guessing. This runner gives that question a file-based answer.
//
// public.migration_runs is a PIPELINE JOB log despite the name — it records
// ingestion and analytics runs. The schema ledger is a separate table.
const JOB_NAME = 'stock-insight-schema-migrations';
const APPLY = process.argv.includes('--apply');
// The production database already has all 54 applied but no ledger. --baseline
// records them as applied WITHOUT executing them, so an existing deployment can
// adopt the ledger without replaying its own history.
const BASELINE = process.argv.includes('--baseline');

// `source` exists because this repository writes into two different migration
// series. 'db-schema' is our own additive registry, which this runner drives.
// 'ops/db/migrations' is the legacy research app's series (…220, 221, 222) —
// those files touch schema the legacy system owns, carry their own advisory
// locks and BEGIN/COMMIT, and are applied by hand with a rehearsal script. The
// runner does NOT manage them; recording them here only stops them from being
// invisible. Rows with a foreign source are ignored by the planner.
const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS public.schema_migration (
  migration_id text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user,
  duration_ms integer NOT NULL DEFAULT 0,
  baselined boolean NOT NULL DEFAULT false
)
`;

const LEDGER_SOURCE_SQL = `
ALTER TABLE public.schema_migration
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'db-schema'
`;

const REGISTRY_SOURCE = 'db-schema';
const MIGRATION_LOCK_SQL =
  "SELECT pg_advisory_lock(hashtextextended('stock-insight-schema-migrations', 0))";
const MIGRATION_UNLOCK_SQL =
  "SELECT pg_advisory_unlock(hashtextextended('stock-insight-schema-migrations', 0))";

const INSERT_LEDGER_SQL = `
INSERT INTO public.schema_migration (migration_id, checksum, duration_ms, baselined, source)
VALUES ($1, $2, $3, $4, $5)
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES (
  'schema-migrations-' || gen_random_uuid()::text,
  $1, 'db-schema', 'completed', $2, clock_timestamp(),
  $3, $4, $5, null, $6::jsonb
)
`;

type LedgerRow = { migration_id: string; checksum: string; baselined: boolean; source: string };

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => pg.Pool;
};

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

// The checksum is over the exact SQL we would run. It exists to catch a migration
// being edited after it was applied — the one failure a ledger alone cannot see,
// because the id would still match.
export function migrationChecksum(migration: AppMigration): string {
  return createHash('sha256').update(migration.sql, 'utf8').digest('hex');
}

export type MigrationPlanEntry = {
  id: string;
  action: 'apply' | 'skip' | 'baseline';
  checksum: string;
};

export type MigrationDrift = { id: string; recorded: string; current: string };

export type MigrationQueryClient = {
  query: (sql: string, params?: readonly unknown[]) => Promise<unknown>;
};

/**
 * Pure planner so the decision table is testable without a database.
 * Ordering follows the registry, which is the numeric migration order.
 */
export function planMigrations(
  migrations: readonly AppMigration[],
  ledger: readonly LedgerRow[],
  options: { baseline: boolean },
): { plan: MigrationPlanEntry[]; drift: MigrationDrift[] } {
  // Only our own series is planned. Rows recorded from another migration series
  // are informational and must not be mistaken for ours.
  const recorded = new Map(
    ledger
      .filter((row) => row.source === REGISTRY_SOURCE)
      .map((row) => [row.migration_id, row.checksum]),
  );
  const plan: MigrationPlanEntry[] = [];
  const drift: MigrationDrift[] = [];

  for (const migration of migrations) {
    const checksum = migrationChecksum(migration);
    const previous = recorded.get(migration.id);
    if (previous === undefined) {
      plan.push({ id: migration.id, action: options.baseline ? 'baseline' : 'apply', checksum });
      continue;
    }
    // An applied migration whose SQL no longer matches is a contract violation:
    // the database and the repository disagree about what was run. Refuse rather
    // than silently re-apply or silently ignore.
    if (previous !== checksum)
      drift.push({ id: migration.id, recorded: previous, current: checksum });
    plan.push({ id: migration.id, action: 'skip', checksum });
  }

  return { plan, drift };
}

export async function executeMigration(
  client: MigrationQueryClient,
  migration: AppMigration,
  entry: MigrationPlanEntry,
): Promise<void> {
  if (entry.action === 'skip') return;
  const began = Date.now();

  if (entry.action === 'apply' && migration.executionMode === 'non_transactional') {
    if (
      !/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\b/i.test(migration.sql)
    ) {
      throw new Error(
        `${migration.id}: non_transactional migrations must use CREATE INDEX CONCURRENTLY IF NOT EXISTS`,
      );
    }
    await client.query(migration.sql);
  }

  await client.query('BEGIN');
  try {
    if (entry.action === 'apply' && migration.executionMode === 'transactional') {
      await client.query(migration.sql);
    }
    await client.query(INSERT_LEDGER_SQL, [
      migration.id,
      entry.checksum,
      Date.now() - began,
      entry.action === 'baseline',
      REGISTRY_SOURCE,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the migration or ledger failure.
    }
    throw error;
  }
}

async function readLedger(client: PoolClient): Promise<LedgerRow[]> {
  const result = await client.query<LedgerRow>(
    'SELECT migration_id, checksum, baselined, source FROM public.schema_migration',
  );
  return result.rows;
}

async function run(): Promise<void> {
  if (BASELINE && !APPLY) {
    throw new Error('--baseline records ledger rows and therefore requires --apply');
  }
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    await client.query(LEDGER_SQL);
    await client.query(LEDGER_SOURCE_SQL);
    // One migrator at a time. Two concurrent runners would both see an empty
    // ledger and both try to apply. This must be a session lock because a
    // non-transactional migration cannot share the ledger transaction.
    await client.query(MIGRATION_LOCK_SQL);

    const ledger = await readLedger(client);
    const { plan, drift } = planMigrations(additiveAppMigrations, ledger, { baseline: BASELINE });

    if (drift.length > 0) {
      throw new Error(
        `schema migration drift: ${drift.map((entry) => entry.id).join(',')} — applied SQL no longer matches the repository`,
      );
    }

    const pending = plan.filter((entry) => entry.action !== 'skip');

    if (!APPLY) {
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            total: additiveAppMigrations.length,
            applied: plan.length - pending.length,
            pending: pending.map((entry) => entry.id),
            hint: pending.length === 0 ? 'schema is up to date' : 'rerun with --apply',
            // Surfaced, not managed — see the note on LEDGER_SQL.
            otherSeries: ledger
              .filter((row) => row.source !== REGISTRY_SOURCE)
              .map((row) => `${row.source}:${row.migration_id}`),
          },
          null,
          2,
        ),
      );
      return;
    }

    const byId = new Map(additiveAppMigrations.map((migration) => [migration.id, migration]));
    for (const entry of pending) {
      const migration = byId.get(entry.id);
      if (!migration) throw new Error(`unknown migration in plan: ${entry.id}`);
      await executeMigration(client, migration, entry);
    }

    const summary = {
      mode: BASELINE ? 'baseline' : 'apply',
      total: additiveAppMigrations.length,
      alreadyApplied: plan.length - pending.length,
      changed: pending.map((entry) => entry.id),
    };
    await client.query('BEGIN');
    try {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        JOB_NAME,
        startedAt,
        additiveAppMigrations.length,
        pending.length,
        plan.length - pending.length,
        JSON.stringify(summary),
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log(JSON.stringify({ jobName: JOB_NAME, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    try {
      await client.query(MIGRATION_UNLOCK_SQL);
    } catch {
      // Releasing the connection also releases the session lock.
    }
    client.release();
    await pool.end();
  }
}

// Importing this module for its pure planner must not open a connection.
if (process.argv[1]?.endsWith('run-schema-migrations.ts')) {
  await run();
}
