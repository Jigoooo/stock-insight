import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  applyPhase35BackfillPlan,
  buildPhase35BackfillPlan,
  loadPhase35DeepCacheRows,
  summarizePhase35Audit,
  type Phase35DeepCacheRow,
  type Phase35ReadExecutor,
  type Phase35WriteExecutor,
} from './phase35.ts';

const JOB_NAME = 'stock-insight-phase35-backfill';

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function makeRunId(now = new Date()): string {
  return `phase35-${now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}`;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for Phase 3.5 backfill');
  return url;
}

function createReadExecutor(client: PoolClient): Phase35ReadExecutor {
  return {
    async queryRows<TRow extends Phase35DeepCacheRow = Phase35DeepCacheRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const result = await client.query<TRow & QueryResultRow>(sql, [...params]);
      return result.rows;
    },
  };
}

function createWriteExecutor(client: PoolClient): Phase35WriteExecutor {
  return {
    async execute(sql, params = []) {
      const result = await client.query(sql, [...params]);
      return { rowCount: result.rowCount };
    },
  };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    const rows = await loadPhase35DeepCacheRows(createReadExecutor(client));
    const plan = buildPhase35BackfillPlan(rows);
    const dryRunAudit = summarizePhase35Audit(plan);

    if (!apply) {
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            jobName: JOB_NAME,
            audit: dryRunAudit,
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query('BEGIN');
    const result = await applyPhase35BackfillPlan(plan, createWriteExecutor(client), {
      runId: makeRunId(startedAt),
      jobName: JOB_NAME,
      startedAt,
      finishedAt: new Date(),
    });
    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          mode: 'apply',
          jobName: JOB_NAME,
          audit: result.audit,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (apply) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve original error.
      }
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
