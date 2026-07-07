import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  applySecEdgarBackfillPlan,
  collectSecEdgarDryRunPlan,
  SEC_APP_SURFACE_US_TICKER_ROWS_SQL,
  summarizeSecEdgarDryRunAudit,
  type SecEdgarFetcher,
  type SecEdgarWriteExecutor,
  type SecTickerEntityRow,
} from './sec-edgar.ts';

const JOB_NAME = 'stock-insight-sec-edgar-backfill';
const DEFAULT_SEC_USER_AGENT =
  'stock-insight-sec-edgar-dry-run/0.0 local-research contact-not-configured';

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for SEC EDGAR dry-run');
  return url;
}

function getSecUserAgent(): string {
  return process.env.SEC_USER_AGENT?.trim() || DEFAULT_SEC_USER_AGENT;
}

function makeRunId(now = new Date()): string {
  return `sec-edgar-${now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}`;
}

async function loadRows(client: PoolClient): Promise<SecTickerEntityRow[]> {
  const result = await client.query<SecTickerEntityRow & QueryResultRow>(
    SEC_APP_SURFACE_US_TICKER_ROWS_SQL,
  );
  return result.rows;
}

function createSecFetcher(userAgent: string): SecEdgarFetcher {
  return {
    async fetchJson<T>(url: string): Promise<T> {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
      });
      if (!response.ok) {
        throw new Error(`SEC request failed: ${response.status} ${response.statusText} ${url}`);
      }
      return (await response.json()) as T;
    },
  };
}

function createWriteExecutor(client: PoolClient): SecEdgarWriteExecutor {
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
  const userAgent = getSecUserAgent();

  try {
    await client.query('BEGIN READ ONLY');
    const rows = await loadRows(client);
    await client.query('COMMIT');

    const plan = await collectSecEdgarDryRunPlan(rows, createSecFetcher(userAgent));
    const audit = summarizeSecEdgarDryRunAudit(plan);

    if (apply) {
      await client.query('BEGIN');
      const result = await applySecEdgarBackfillPlan(plan, createWriteExecutor(client), {
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
            secUserAgentConfigured: userAgent !== DEFAULT_SEC_USER_AGENT,
            audit: result.audit,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          jobName: JOB_NAME,
          readOnly: true,
          secUserAgentConfigured: userAgent !== DEFAULT_SEC_USER_AGENT,
          audit,
          metricGroups: plan.metricGroups,
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
