import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  applyDartBackfillPlan,
  assertDartApiSuccess,
  assertDartEndpointCoverage,
  assertDartPlanUsable,
  buildDartFinancialSeed,
  buildDartProfileSeed,
  DART_KR_ENTITY_ROWS_SQL,
  type DartBackfillPlan,
  type DartCompanyResponse,
  type DartEntityRow,
  type DartFinancialResponse,
  type DartTickerAudit,
  type DartWriteExecutor,
} from './opendart.ts';

const JOB_NAME = 'stock-insight-opendart-backfill';
const DEFAULT_CORP_MAP = join(
  homedir(),
  '.hermes/workspace/research-common/state/dart/corp_map.json',
);
const DEFAULT_FISCAL_YEAR = new Date().getUTCFullYear() - 1;
const MIN_INTERVAL_MS = 350;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

type CorpMap = Record<string, string>;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

function dartKey(): string {
  const value = process.env.OPENDART_API_KEY?.trim() || process.env.DART_API_KEY?.trim();
  if (!value) throw new Error('OPENDART_API_KEY or DART_API_KEY is required');
  return value;
}

function optionInt(name: string, fallback: number, min: number, max: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

async function loadCorpMap(): Promise<CorpMap> {
  const path = process.env.DART_CORP_MAP_PATH?.trim() || DEFAULT_CORP_MAP;
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid DART corp map: ${path}`);
  }
  return parsed as CorpMap;
}

let lastRequestAt = 0;
async function waitForRateLimit(): Promise<void> {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function dartFetch<T>(
  endpoint: string,
  params: Record<string, string>,
  key: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await waitForRateLimit();
      const url = new URL(`https://opendart.fss.or.kr/api/${endpoint}`);
      url.searchParams.set('crtfc_key', key);
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`OpenDART HTTP ${response.status} for ${endpoint}`);
      const payload = (await response.json()) as { status?: string; message?: string };
      assertDartApiSuccess(payload, endpoint);
      return payload as T;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function buildPlan(
  rows: DartEntityRow[],
  corpMap: CorpMap,
  key: string,
  fiscalYear: number,
): Promise<DartBackfillPlan> {
  const profiles: DartBackfillPlan['profiles'] = [];
  const financials: DartBackfillPlan['financials'] = [];
  const tickers: DartTickerAudit[] = [];
  const capturedAt = new Date().toISOString();
  let mappedRows = 0;
  let companySuccesses = 0;
  let financialSuccesses = 0;

  for (const row of rows) {
    const symbol = row.symbol?.trim().padStart(6, '0') ?? '';
    const entityKey = row.entity_key?.trim() ?? `KR:${symbol || '(missing)'}`;
    if (!symbol) {
      tickers.push({
        entityKey,
        symbol,
        status: 'missing_symbol',
        profileReady: false,
        financialReady: false,
      });
      continue;
    }
    const corpCode = corpMap[symbol];
    if (!corpCode) {
      tickers.push({
        entityKey,
        symbol,
        status: 'missing_corp_code',
        profileReady: false,
        financialReady: false,
      });
      continue;
    }
    mappedRows += 1;

    let company: DartCompanyResponse | undefined;
    let financial: DartFinancialResponse | undefined;
    let message: string | undefined;
    try {
      company = await dartFetch<DartCompanyResponse>('company.json', { corp_code: corpCode }, key);
      companySuccesses += 1;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    try {
      financial = await dartFetch<DartFinancialResponse>(
        'fnlttSinglAcnt.json',
        { corp_code: corpCode, bsns_year: String(fiscalYear), reprt_code: '11011' },
        key,
      );
      financialSuccesses += 1;
    } catch (error) {
      message = message ?? (error instanceof Error ? error.message : String(error));
    }

    const profile = company ? buildDartProfileSeed(row, corpCode, company, capturedAt) : undefined;
    const financialSeed = financial
      ? buildDartFinancialSeed(entityKey, fiscalYear, financial, { corpCode, symbol })
      : undefined;
    if (profile) profiles.push(profile);
    if (financialSeed) financials.push(financialSeed);
    tickers.push({
      entityKey,
      symbol,
      corpCode,
      status: !profile ? 'company_error' : financialSeed ? 'ready' : 'financial_missing',
      profileReady: Boolean(profile),
      financialReady: Boolean(financialSeed),
      ...(message ? { message: message.slice(0, 200) } : {}),
    });
  }

  assertDartEndpointCoverage({ mappedRows, companySuccesses, financialSuccesses });

  return { sourceRows: rows.length, mappedRows, profiles, financials, tickers };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const limit = optionInt('--limit', 500, 1, 500);
  const fiscalYear = optionInt('--fiscal-year', DEFAULT_FISCAL_YEAR, 2000, 2100);
  const startedAt = new Date();
  const key = dartKey();
  const corpMap = await loadCorpMap();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query<DartEntityRow & QueryResultRow>(
      `${DART_KR_ENTITY_ROWS_SQL}\nLIMIT $1`,
      [limit],
    );
    await client.query('COMMIT');
    const plan = await buildPlan(result.rows, corpMap, key, fiscalYear);
    assertDartPlanUsable(plan);
    const summary = {
      sourceRows: plan.sourceRows,
      mappedRows: plan.mappedRows,
      profiles: plan.profiles.length,
      financials: plan.financials.length,
      statusCounts: Object.fromEntries(
        [...new Set(plan.tickers.map((ticker) => ticker.status))].map((status) => [
          status,
          plan.tickers.filter((ticker) => ticker.status === status).length,
        ]),
      ),
    };

    if (!apply) {
      console.log(
        JSON.stringify({ mode: 'dry-run', readOnly: true, fiscalYear, audit: summary }, null, 2),
      );
      return;
    }

    const executor: DartWriteExecutor = {
      async execute(sql, params = []) {
        const write = await client.query(sql, [...params]);
        return { rowCount: write.rowCount };
      },
    };
    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', '180s', true)");
    await client.query("SELECT set_config('lock_timeout', '5s', true)");
    const applied = await applyDartBackfillPlan(plan, executor, {
      runId: `opendart-${randomUUID()}`,
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
          fiscalYear,
          rowsWritten: applied.rowsWritten,
          audit: summary,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
