import { randomUUID } from 'node:crypto';

import pg, { type PoolClient } from 'pg';

// SET C / C-4: FRED/ALFRED macro vintage collector.
// Stores every (observation_date, vintage_date) pair so past reports can be
// reconstructed with only what was known at the time (PIT).

const JOB_NAME = 'stock-insight-fred-vintage';
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// Core US series set (03-A §2.6). KR(ECOS) vintage stays a later tranche.
const CORE_SERIES = [
  'FEDFUNDS', // policy rate
  'DGS2', // 2y treasury
  'DGS10', // 10y treasury
  'CPIAUCSL', // CPI
  'PCEPI', // PCE prices
  'PAYEMS', // nonfarm payrolls
  'UNRATE', // unemployment
  'ICSA', // initial claims
  'RSAFS', // retail sales
  'INDPRO', // industrial production
  'UMCSENT', // consumer sentiment
  'WALCL', // Fed balance sheet
] as const;

const UPSERT_VINTAGE_SQL = `
INSERT INTO market.macro_vintage (
  series_key, observation_date, vintage_date, value, vintage_quality, available_at, metadata
) VALUES ($1, $2, $3, $4, 'realtime', $5, $6::jsonb)
ON CONFLICT (series_key, observation_date, vintage_date) DO NOTHING
RETURNING series_key
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'fred-alfred', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type FredObservation = {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string;
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback);
}

async function fetchWindow(
  series: string,
  apiKey: string,
  observationStart: string,
  realtimeStart: string,
  realtimeEnd: string,
): Promise<{ observations: FredObservation[]; vintageOverflow: boolean }> {
  const collected: FredObservation[] = [];
  let offset = 0;
  const limit = 10_000;
  for (let page = 0; page < 40; page += 1) {
    const url = new URL(FRED_BASE);
    url.searchParams.set('series_id', series);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('realtime_start', realtimeStart);
    url.searchParams.set('realtime_end', realtimeEnd);
    url.searchParams.set('observation_start', observationStart);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (response.status === 400) {
      const body = await response.text();
      // JSON file_type caps vintage dates at 2000 — signal the caller to split the window.
      if (body.includes('vintage dates')) return { observations: [], vintageOverflow: true };
      throw new Error(`FRED ${series} failed with HTTP 400: ${body.slice(0, 200)}`);
    }
    if (!response.ok) throw new Error(`FRED ${series} failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { observations?: FredObservation[] };
    const observations = payload.observations ?? [];
    collected.push(...observations);
    offset += observations.length;
    if (observations.length < limit) break;
  }
  return { observations: collected, vintageOverflow: false };
}

async function fetchSeriesVintages(
  series: string,
  apiKey: string,
  observationStart: string,
): Promise<FredObservation[]> {
  // Try the full realtime range first (fine for monthly/weekly revised series).
  const full = await fetchWindow(series, apiKey, observationStart, '2000-01-01', '9999-12-31');
  if (!full.vintageOverflow) return full.observations;

  // Daily series (DGS2/DGS10/ICSA/WALCL...) exceed the 2000-vintage JSON cap:
  // split the realtime axis into 2-year windows from observationStart forward.
  const collected: FredObservation[] = [];
  const startYear = Number(observationStart.slice(0, 4));
  const endYear = new Date().getUTCFullYear();
  for (let year = startYear; year <= endYear; year += 2) {
    const windowStart = `${year}-01-01`;
    const windowEnd = year + 2 > endYear ? '9999-12-31' : `${year + 1}-12-31`;
    const window = await fetchWindow(series, apiKey, observationStart, windowStart, windowEnd);
    if (window.vintageOverflow) {
      throw new Error(`FRED ${series}: 2-year realtime window still exceeds vintage cap`);
    }
    collected.push(...window.observations);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return collected;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const observationStart = option('--from', '2015-01-01');
  const startedAt = new Date();
  const apiKey = required('FRED_API_KEY');

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    const perSeries: Record<string, { observations: number; inserted: number }> = {};
    let totalObservations = 0;
    let totalInserted = 0;

    for (const series of CORE_SERIES) {
      const observations = await fetchSeriesVintages(series, apiKey, observationStart);
      perSeries[series] = { observations: observations.length, inserted: 0 };
      totalObservations += observations.length;

      if (!apply) continue;
      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '120s', true)");
      for (const observation of observations) {
        const numeric = observation.value === '.' ? null : Number(observation.value);
        const result = await client.query(UPSERT_VINTAGE_SQL, [
          `fred:${series}`,
          observation.date,
          observation.realtime_start,
          numeric !== null && Number.isFinite(numeric) ? numeric : null,
          startedAt.toISOString(),
          JSON.stringify({ realtime_end: observation.realtime_end }),
        ]);
        if ((result.rowCount ?? 0) > 0) {
          perSeries[series]!.inserted += 1;
          totalInserted += 1;
        }
      }
      await client.query('COMMIT');
      // FRED rate limit is generous but be polite.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const summary = {
      series: CORE_SERIES.length,
      observationStart,
      totalObservations,
      totalInserted,
      perSeries,
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `fred-vintage-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      totalObservations,
      totalInserted,
      totalObservations - totalInserted,
      JSON.stringify({ ...summary, perSeries: undefined }),
    ]);
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: summary }, null, 2));
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
