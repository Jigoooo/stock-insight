import { randomUUID } from 'node:crypto';

import pg, { type PoolClient } from 'pg';

// SET C / C-4: FRED/ALFRED macro vintage collector.
// Stores every (observation_date, vintage_date) pair so past reports can be
// reconstructed with only what was known at the time (PIT).

import {
  CLOSE_FETCH_RUN_SQL,
  OPEN_FETCH_RUN_SQL,
  registerRawObjectWithRevision,
  writeRawObject,
} from './raw-object-store.ts';

const JOB_NAME = 'stock-insight-fred-vintage';
const PROVIDER_KEY = 'fred';
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
  series_key, observation_date, vintage_date, value, vintage_quality, available_at, metadata,
  source_revision_id
) VALUES ($1, $2, $3, $4, 'realtime', $5, $6::jsonb, $7)
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

/**
 * One entry per realtime window, which is the unit that gets its own source
 * revision.
 *
 * This differs from the DART collector, where one HTTP response is one filing and
 * therefore one record. FRED's window is itself assembled from up to 40 offset
 * pages, so a page is too fine to be a record and the whole series is too coarse
 * (a daily series splits into many windows). The window is the coherent
 * (series, realtime range) slice: its hash changes exactly when that slice's data
 * changes, which is what makes an unchanged refetch replay instead of appending.
 */
export type FredWindow = {
  recordKey: string;
  realtimeStart: string;
  realtimeEnd: string;
  observations: FredObservation[];
};

async function fetchSeriesVintages(
  series: string,
  apiKey: string,
  observationStart: string,
): Promise<FredWindow[]> {
  // Try the full realtime range first (fine for monthly/weekly revised series).
  const full = await fetchWindow(series, apiKey, observationStart, '2000-01-01', '9999-12-31');
  if (!full.vintageOverflow) {
    return [
      {
        recordKey: `${series}:2000-01-01:9999-12-31`,
        realtimeStart: '2000-01-01',
        realtimeEnd: '9999-12-31',
        observations: full.observations,
      },
    ];
  }

  // Daily series (DGS2/DGS10/ICSA/WALCL...) exceed the 2000-vintage JSON cap:
  // split the realtime axis into 2-year windows from observationStart forward.
  const windows: FredWindow[] = [];
  const startYear = Number(observationStart.slice(0, 4));
  const endYear = new Date().getUTCFullYear();
  for (let year = startYear; year <= endYear; year += 2) {
    const windowStart = `${year}-01-01`;
    const windowEnd = year + 2 > endYear ? '9999-12-31' : `${year + 1}-12-31`;
    const window = await fetchWindow(series, apiKey, observationStart, windowStart, windowEnd);
    if (window.vintageOverflow) {
      throw new Error(`FRED ${series}: 2-year realtime window still exceeds vintage cap`);
    }
    windows.push({
      recordKey: `${series}:${windowStart}:${windowEnd}`,
      realtimeStart: windowStart,
      realtimeEnd: windowEnd,
      observations: window.observations,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return windows;
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
    let revisionsRegistered = 0;
    let revisionsReplayed = 0;

    // The fred source is already registered with a contract (migration 020 seeded
    // one for every source); what was missing was anything writing revisions.
    const sourceRow = await client.query<{ source_id: number }>(
      `SELECT source_id FROM ingestion.source WHERE provider_key = $1`,
      [PROVIDER_KEY],
    );
    if (sourceRow.rows.length !== 1) {
      throw new Error(
        `expected exactly one ${PROVIDER_KEY} source, found ${sourceRow.rows.length}`,
      );
    }
    const sourceId = Number(sourceRow.rows[0]!.source_id);

    // One fetch_run per invocation; every revision registered below hangs off it.
    let fetchRunId: number | null = null;
    if (apply) {
      const runId = `${JOB_NAME}-${randomUUID()}`;
      await client.query('BEGIN');
      const opened = await client.query<{ fetch_run_id: string | number }>(OPEN_FETCH_RUN_SQL, [
        PROVIDER_KEY,
        runId,
        `${PROVIDER_KEY}:${runId}`,
        startedAt.toISOString(),
      ]);
      fetchRunId = Number(opened.rows[0]!.fetch_run_id);
      await client.query('COMMIT');
    }

    for (const series of CORE_SERIES) {
      const windows = await fetchSeriesVintages(series, apiKey, observationStart);
      const seriesObservations = windows.reduce(
        (total, window) => total + window.observations.length,
        0,
      );
      perSeries[series] = { observations: seriesObservations, inserted: 0 };
      totalObservations += seriesObservations;

      if (!apply) continue;
      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '120s', true)");
      for (const window of windows) {
        // Preserve the slice before it is flattened into rows, then register it.
        // A vintage that cannot be traced to the fetch that produced it makes the
        // PIT promise unauditable: the data can say what was known on a date, but
        // nothing can check that against what was actually retrieved.
        const fetchedAt = new Date().toISOString();
        const raw = await writeRawObject({
          providerKey: PROVIDER_KEY,
          content: JSON.stringify({
            series,
            realtime_start: window.realtimeStart,
            realtime_end: window.realtimeEnd,
            observations: window.observations,
          }),
          extension: 'json',
          fetchedAt: new Date(fetchedAt),
        });
        const registered = await registerRawObjectWithRevision(client, {
          fetchRunId: fetchRunId!,
          sourceId,
          providerRecordKey: window.recordKey,
          contentHash: raw.contentHash,
          objectUri: raw.objectUri,
          httpMeta: { endpoint: FRED_BASE, series, observation_start: observationStart },
          fetchedAt,
        });
        if (registered.replay) revisionsReplayed += 1;
        else revisionsRegistered += 1;

        for (const observation of window.observations) {
          const numeric = observation.value === '.' ? null : Number(observation.value);
          const result = await client.query(UPSERT_VINTAGE_SQL, [
            `fred:${series}`,
            observation.date,
            observation.realtime_start,
            numeric !== null && Number.isFinite(numeric) ? numeric : null,
            startedAt.toISOString(),
            JSON.stringify({ realtime_end: observation.realtime_end }),
            registered.sourceRevisionId,
          ]);
          if ((result.rowCount ?? 0) > 0) {
            perSeries[series]!.inserted += 1;
            totalInserted += 1;
          }
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
      revisionsRegistered,
      revisionsReplayed,
      perSeries,
    };
    if (apply && fetchRunId !== null) {
      await client.query(CLOSE_FETCH_RUN_SQL, [
        fetchRunId,
        new Date().toISOString(),
        'success',
        totalObservations,
        totalInserted,
        totalObservations - totalInserted,
        null,
        new Date().toISOString(),
        JSON.stringify(summary),
      ]);
    }
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
