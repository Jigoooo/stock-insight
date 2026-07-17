import { readFile } from 'node:fs/promises';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  applySecMomentumSeeds,
  buildSecMomentumSeeds,
  type SecMomentumSnapshot,
} from './sec-companyfacts-cache.ts';
import {
  applySecEdgarBackfillPlan,
  buildSecEdgarDryRunPlan,
  collectSecEdgarDryRunPlan,
  SEC_APP_SURFACE_US_TICKER_ROWS_SQL,
  summarizeSecEdgarDryRunAudit,
  type SecEdgarFetcher,
  type SecEdgarDryRunPlan,
  type SecCompanyTickerIndex,
  type SecEdgarWriteExecutor,
  type SecTickerEntityRow,
} from './sec-edgar.ts';

const JOB_NAME = 'stock-insight-sec-edgar-backfill';
const DEFAULT_SEC_USER_AGENT =
  'stock-insight/0.0 research https://github.com/Jigoooo/stock-insight';
const SEC_TICKER_CACHE =
  '/home/jigoo/.hermes/workspace/research-common/state/stock/sec-company-tickers.json';
const SEC_FACTS_CACHE =
  '/home/jigoo/.hermes/workspace/research-common/state/stock/sec-companyfacts-latest.json';

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
  let lastRequestAt = 0;
  return {
    async fetchJson<T>(url: string): Promise<T> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const wait = Math.max(0, 125 - (Date.now() - lastRequestAt));
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          lastRequestAt = Date.now();
          const response = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': userAgent },
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) {
            throw new Error(`SEC request failed: HTTP ${response.status}`);
          }
          return (await response.json()) as T;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        }
      }
      throw lastError;
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

    let plan: SecEdgarDryRunPlan;
    let cacheSnapshot: SecMomentumSnapshot | undefined;
    let cacheSeeds = [] as ReturnType<typeof buildSecMomentumSeeds>;
    let liveError: string | undefined;
    try {
      plan = await collectSecEdgarDryRunPlan(rows, createSecFetcher(userAgent));
    } catch (error) {
      liveError = error instanceof Error ? error.message : String(error);
      if (!/SEC request failed: HTTP 403/.test(liveError)) throw error;
      const tickerIndex = JSON.parse(
        await readFile(SEC_TICKER_CACHE, 'utf8'),
      ) as SecCompanyTickerIndex;
      cacheSnapshot = JSON.parse(await readFile(SEC_FACTS_CACHE, 'utf8')) as SecMomentumSnapshot;
      plan = buildSecEdgarDryRunPlan(rows, tickerIndex, {});
      const canonicalEntityKeys = new Set(
        rows.flatMap((row) => (row.entity_key?.trim() ? [row.entity_key.trim()] : [])),
      );
      cacheSeeds = buildSecMomentumSeeds(cacheSnapshot).filter((seed) =>
        canonicalEntityKeys.has(seed.entityKey),
      );
    }
    const audit = summarizeSecEdgarDryRunAudit(plan);

    if (apply) {
      await client.query('BEGIN');
      const result = await applySecEdgarBackfillPlan(plan, createWriteExecutor(client), {
        runId: makeRunId(startedAt),
        jobName: JOB_NAME,
        startedAt,
        finishedAt: new Date(),
      });
      const cacheResult = cacheSnapshot
        ? await applySecMomentumSeeds(cacheSnapshot, cacheSeeds, createWriteExecutor(client), {
            runId: `${makeRunId(startedAt)}-cache`,
            jobName: `${JOB_NAME}-cache-fallback`,
            startedAt,
            finishedAt: new Date(),
            liveError: liveError ?? 'SEC live endpoint unavailable',
          })
        : undefined;
      await client.query('COMMIT');

      console.log(
        JSON.stringify(
          {
            mode: 'apply',
            jobName: JOB_NAME,
            secUserAgentConfigured: userAgent !== DEFAULT_SEC_USER_AGENT,
            liveStatus: liveError ? 'blocked_403_cache_fallback' : 'available',
            audit: result.audit,
            cacheFallback: cacheResult,
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
          liveStatus: liveError ? 'blocked_403_cache_fallback' : 'available',
          liveError: liveError ?? null,
          audit,
          cacheFallback: cacheSnapshot
            ? {
                snapshotGeneratedAt: cacheSnapshot.generated_at_kst ?? null,
                sourceRows: Array.isArray(cacheSnapshot.companies)
                  ? cacheSnapshot.companies.length
                  : 0,
                metricGroups: cacheSeeds.length,
              }
            : null,
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
