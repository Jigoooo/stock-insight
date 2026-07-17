import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import { parseOhlcvBar, type OhlcvBar } from './ohlcv.ts';

const JOB_NAME = 'stock-insight-yfinance-ohlcv';
const DEFAULT_PYTHON = '/home/jigoo/.hermes/hermes-agent/venv/bin/python3';
const FETCH_SCRIPT = new URL('../../scripts/fetch_ohlcv.py', import.meta.url).pathname;
const BATCH_INSERT_SIZE = 500;

const UNIVERSE_SQL = `
SELECT
  upper(entity.market) AS market,
  upper(entity.symbol) AS symbol,
  CASE
    WHEN upper(entity.market) = 'US' THEN 'US'
    WHEN profile.profile_json ->> 'corporationClass' = 'Y' THEN 'KOSPI'
    WHEN profile.profile_json ->> 'corporationClass' = 'K' THEN 'KOSDAQ'
  END AS exchange
FROM public.entities entity
LEFT JOIN public.company_profiles profile ON profile.entity_key = entity.entity_key
WHERE (
    upper(entity.market) = 'US' AND coalesce(entity.symbol, '') <> ''
  ) OR (
    upper(entity.market) = 'KR'
    AND coalesce(entity.symbol, '') ~ '^[0-9]{6}$'
    AND profile.profile_json ->> 'corporationClass' IN ('Y', 'K')
  )
ORDER BY upper(entity.market), upper(entity.symbol)
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'yfinance', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type UniverseRow = QueryResultRow & {
  market: 'KR' | 'US';
  symbol: string;
  exchange: 'KOSPI' | 'KOSDAQ' | 'US';
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function period(): '7d' | '1mo' | '1y' {
  const value = option('--period') ?? '1y';
  if (value !== '7d' && value !== '1mo' && value !== '1y') {
    throw new Error('--period must be 7d, 1mo, or 1y');
  }
  return value;
}

function limit(): number | undefined {
  const raw = option('--limit');
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error('--limit must be an integer between 1 and 500');
  }
  return value;
}

function runPython(inputPath: string, outputPath: string, selectedPeriod: string): Promise<string> {
  const python = process.env.YFINANCE_PYTHON?.trim() || DEFAULT_PYTHON;
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [FETCH_SCRIPT, '--input', inputPath, '--output', outputPath, '--period', selectedPeriod],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 2_000_000) stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yfinance collector failed (${code}): ${stderr.slice(-1000)}`));
        return;
      }
      resolve(stderr);
    });
  });
}

function parseBars(raw: string): { bars: OhlcvBar[]; invalid: number } {
  const bars: OhlcvBar[] = [];
  let invalid = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const bar = parseOhlcvBar(JSON.parse(line) as unknown);
      if (bar) bars.push(bar);
      else invalid += 1;
    } catch {
      invalid += 1;
    }
  }
  return { bars, invalid };
}

async function upsertBatch(client: PoolClient, batch: readonly OhlcvBar[]): Promise<void> {
  const params: unknown[] = [];
  const values = batch.map((bar, index) => {
    const offset = index * 12;
    params.push(
      bar.exchange,
      bar.symbol,
      bar.timeframe,
      bar.ts,
      bar.open,
      bar.high,
      bar.low,
      bar.close,
      bar.volumeBase,
      bar.volumeQuote,
      bar.domain,
      bar.sourceId,
    );
    return `(${Array.from({ length: 12 }, (_, i) => `$${offset + i + 1}`).join(',')})`;
  });
  await client.query(
    `INSERT INTO market_ts.ohlcv (
       exchange, symbol, timeframe, ts, open, high, low, close,
       volume_base, volume_quote, domain, source_id
     ) VALUES ${values.join(',')}
     ON CONFLICT (exchange, symbol, timeframe, ts) DO UPDATE SET
       open = EXCLUDED.open,
       high = EXCLUDED.high,
       low = EXCLUDED.low,
       close = EXCLUDED.close,
       volume_base = EXCLUDED.volume_base,
       volume_quote = EXCLUDED.volume_quote,
       domain = EXCLUDED.domain,
       source_id = EXCLUDED.source_id,
       collected_at = now()`,
    params,
  );
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const selectedPeriod = period();
  const selectedLimit = limit();
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  const temporary = await mkdtemp(join(tmpdir(), 'stock-insight-ohlcv-'));
  try {
    await client.query('BEGIN READ ONLY');
    const query = selectedLimit ? `${UNIVERSE_SQL}\nLIMIT $1` : UNIVERSE_SQL;
    const result = await client.query<UniverseRow>(query, selectedLimit ? [selectedLimit] : []);
    await client.query('COMMIT');

    const inputPath = join(temporary, 'universe.json');
    const outputPath = join(temporary, 'ohlcv.ndjson');
    await writeFile(inputPath, JSON.stringify(result.rows), 'utf8');
    const collectorLog = await runPython(inputPath, outputPath, selectedPeriod);
    const parsed = parseBars(await readFile(outputPath, 'utf8'));
    const tickerKeys = new Set(parsed.bars.map((bar) => `${bar.market}:${bar.symbol}`));
    const missingTickerKeys = result.rows
      .map((row) => `${row.market}:${row.symbol}`)
      .filter((key) => !tickerKeys.has(key));
    const summary = {
      universe: result.rows.length,
      tickersWithData: tickerKeys.size,
      missingTickers: missingTickerKeys.length,
      missingTickerKeys,
      bars: parsed.bars.length,
      invalidBars: parsed.invalid,
      period: selectedPeriod,
      collector: collectorLog.trim().split('\n').slice(-1)[0] ?? '',
    };

    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    if (parsed.bars.length === 0)
      throw new Error('No valid OHLCV bars collected; refusing empty apply');

    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', '180s', true)");
    await client.query("SELECT set_config('lock_timeout', '5s', true)");
    for (let start = 0; start < parsed.bars.length; start += BATCH_INSERT_SIZE) {
      await upsertBatch(client, parsed.bars.slice(start, start + BATCH_INSERT_SIZE));
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `yfinance-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      result.rows.length,
      parsed.bars.length,
      summary.missingTickers,
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
    client.release();
    await pool.end();
  }
}

await run();
