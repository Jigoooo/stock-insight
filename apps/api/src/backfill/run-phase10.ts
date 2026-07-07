import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  applyPhase10LearningPlan,
  buildPhase10LearningPlan,
  loadPhase10DeepCacheRows,
  summarizePhase10LearningAudit,
  type Phase10DeepCacheRow,
  type Phase10ReadExecutor,
  type Phase10WriteExecutor,
} from './phase10.ts';

const JOB_NAME = 'stock-insight-phase10-learning-pipeline';

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function makeRunId(now = new Date()): string {
  return `phase10-${now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}`;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for Phase 10 learning pipeline');
  return url;
}

function createReadExecutor(client: PoolClient): Phase10ReadExecutor {
  return {
    async queryRows<TRow extends Phase10DeepCacheRow = Phase10DeepCacheRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const result = await client.query<TRow & QueryResultRow>(sql, [...params]);
      return result.rows;
    },
  };
}

function createWriteExecutor(client: PoolClient): Phase10WriteExecutor {
  return {
    async queryRows<TRow extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const result = await client.query<TRow & QueryResultRow>(sql, [...params]);
      return result.rows;
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
    await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const rows = await loadPhase10DeepCacheRows(createReadExecutor(client));
    const plan = buildPhase10LearningPlan(rows);
    const dryRunAudit = summarizePhase10LearningAudit(plan);

    if (!apply) {
      await client.query('ROLLBACK');
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

    const result = await applyPhase10LearningPlan(plan, createWriteExecutor(client), {
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
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original error.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
