import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  applyPhase11AlertLedgerPlan,
  buildPhase11AlertLedgerPlan,
  loadPhase11AlertRows,
  summarizePhase11AlertAudit,
  type Phase11AlertSourceRow,
  type Phase11ReadExecutor,
  type Phase11WriteExecutor,
} from './phase11.ts';

const JOB_NAME = 'stock-insight-phase11-alert-ledger';

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function makeRunId(now = new Date()): string {
  return `phase11-${now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}`;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for Phase 11 alert ledger');
  return url;
}

function createReadExecutor(client: PoolClient): Phase11ReadExecutor {
  return {
    async queryRows<TRow extends Phase11AlertSourceRow = Phase11AlertSourceRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const result = await client.query<TRow & QueryResultRow>(sql, [...params]);
      return result.rows;
    },
  };
}

function createWriteExecutor(client: PoolClient): Phase11WriteExecutor {
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
    const rows = await loadPhase11AlertRows(createReadExecutor(client));
    const plan = buildPhase11AlertLedgerPlan(rows);
    const dryRunAudit = summarizePhase11AlertAudit(plan);

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

    const result = await applyPhase11AlertLedgerPlan(plan, createWriteExecutor(client), {
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
