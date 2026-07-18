import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET C / C-5: FINRA consolidated (CNMS) daily short sale volume.
// NOT short interest — stored with venue-coverage caveat (see table COMMENT).
// Only symbols in our US universe are kept to bound row growth.

const JOB_NAME = 'stock-insight-finra-short-volume';
const FINRA_CDN = 'https://cdn.finra.org/equity/regsho/daily';

const US_UNIVERSE_SQL = `
SELECT ticker FROM core.v_security_universe WHERE market = 'US'
`;

const UPSERT_SHORT_SQL = `
INSERT INTO market.short_volume_daily (
  trade_date, symbol, short_volume, short_exempt_volume, total_volume, market_codes, available_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (trade_date, symbol) DO NOTHING
RETURNING symbol
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'finra-cnms', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

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

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const raw = index < 0 ? undefined : process.argv[index + 1];
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 60) {
    throw new Error(`${name} must be an integer between 1 and 60`);
  }
  return value;
}

function tradingDatesBack(days: number): string[] {
  // Candidate dates only (weekends skipped); holidays return 404 and are skipped.
  const dates: string[] = [];
  const cursor = new Date();
  while (dates.length < days) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cursor.getUTCDate()).padStart(2, '0');
    dates.push(`${y}${m}${d}`);
  }
  return dates;
}

async function fetchDay(yyyymmdd: string): Promise<string | null> {
  const response = await fetch(`${FINRA_CDN}/CNMSshvol${yyyymmdd}.txt`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404 || response.status === 403) return null; // holiday/half-day or not published (CDN answers 403 for absent keys too)
  if (!response.ok) throw new Error(`FINRA CNMS ${yyyymmdd} failed with HTTP ${response.status}`);
  return response.text();
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const days = option('--days', 10);
  const startedAt = new Date();

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const universe = await client.query<QueryResultRow & { ticker: string }>(US_UNIVERSE_SQL);
    await client.query('COMMIT');
    const wanted = new Set(universe.rows.map((row) => row.ticker.toUpperCase()));

    let daysFetched = 0;
    let daysMissing = 0;
    let rowsRead = 0;
    let rowsMatched = 0;
    let rowsInserted = 0;

    for (const yyyymmdd of tradingDatesBack(days)) {
      const body = await fetchDay(yyyymmdd);
      if (body === null) {
        daysMissing += 1;
        continue;
      }
      daysFetched += 1;
      const lines = body.split('\n');
      const matched: Array<[string, string, number, number | null, number, string]> = [];
      for (const line of lines.slice(1)) {
        const parts = line.trim().split('|');
        if (parts.length < 6) continue;
        rowsRead += 1;
        const [date, symbol, shortVol, shortExempt, totalVol, marketCodes] = parts;
        const upper = symbol!.toUpperCase();
        if (!wanted.has(upper)) continue;
        const tradeDate = `${date!.slice(0, 4)}-${date!.slice(4, 6)}-${date!.slice(6, 8)}`;
        const short = Number(shortVol);
        const total = Number(totalVol);
        if (!Number.isFinite(short) || !Number.isFinite(total) || total <= 0) continue;
        const exempt = Number(shortExempt);
        matched.push([
          tradeDate,
          upper,
          short,
          Number.isFinite(exempt) ? exempt : null,
          total,
          marketCodes ?? '',
        ]);
        rowsMatched += 1;
      }
      if (apply && matched.length > 0) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('statement_timeout', '120s', true)");
        for (const row of matched) {
          const result = await client.query(UPSERT_SHORT_SQL, [...row, startedAt.toISOString()]);
          if ((result.rowCount ?? 0) > 0) rowsInserted += 1;
        }
        await client.query('COMMIT');
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const summary = {
      requestedDays: days,
      daysFetched,
      daysMissing,
      universe: wanted.size,
      rowsRead,
      rowsMatched,
      rowsInserted,
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `finra-short-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      rowsRead,
      rowsInserted,
      rowsMatched - rowsInserted,
      JSON.stringify(summary),
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
