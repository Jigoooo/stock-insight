import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  applyPhase4CompanyMetricsPlan,
  buildPhase4CompanyMetricsPlan,
  PHASE4_MARKET_SNAPSHOT_ROWS_SQL,
  summarizePhase4CompanyMetricsAudit,
  type Phase4MarketSnapshotRow,
  type Phase4WriteExecutor,
} from './phase4.ts';

const JOB_NAME = 'stock-insight-phase4-company-metrics';

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function makeRunId(now = new Date()): string {
  return `phase4-${now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}`;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for Phase 4 company metrics backfill');
  return url;
}

async function loadRows(client: PoolClient): Promise<Phase4MarketSnapshotRow[]> {
  const result = await client.query<Phase4MarketSnapshotRow & QueryResultRow>(
    PHASE4_MARKET_SNAPSHOT_ROWS_SQL,
  );
  return result.rows;
}

function createWriteExecutor(client: PoolClient): Phase4WriteExecutor {
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
    const rows = await loadRows(client);
    const plan = buildPhase4CompanyMetricsPlan(rows);
    const dryRunAudit = summarizePhase4CompanyMetricsAudit(plan);

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
    const result = await applyPhase4CompanyMetricsPlan(plan, createWriteExecutor(client), {
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
