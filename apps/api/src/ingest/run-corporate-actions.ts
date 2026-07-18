import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

const JOB_NAME = 'stock-insight-corporate-actions';
const DEFAULT_PYTHON = '/home/jigoo/.hermes/hermes-agent/venv/bin/python3';
const FETCH_SCRIPT = new URL('../../scripts/fetch_corporate_actions.py', import.meta.url).pathname;

const UNIVERSE_SQL = `
SELECT universe.market, universe.ticker AS symbol, universe.security_entity_id,
       CASE universe.exchange_internal_key
         WHEN 'EXCHANGE:KOSPI' THEN 'KOSPI'
         WHEN 'EXCHANGE:KOSDAQ' THEN 'KOSDAQ'
         ELSE 'US'
       END AS exchange
FROM core.v_security_universe universe
ORDER BY universe.market, universe.ticker
`;

const UPSERT_ACTION_SQL = `
INSERT INTO market.corporate_action (
  security_entity_id, action_type, effective_date, ratio, amount, currency,
  source_provider, available_at, metadata
) VALUES ($1, $2, $3, $4, $5, $6, 'yfinance', $7, $8::jsonb)
ON CONFLICT (security_entity_id, action_type, effective_date) DO UPDATE SET
  ratio = EXCLUDED.ratio,
  amount = EXCLUDED.amount,
  metadata = market.corporate_action.metadata || EXCLUDED.metadata
RETURNING (xmax = 0) AS inserted
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
  security_entity_id: string | number;
  exchange: 'KOSPI' | 'KOSDAQ' | 'US';
};

type ActionLine = {
  market: string;
  symbol: string;
  action_type: 'dividend' | 'split';
  effective_date: string;
  amount: number | null;
  ratio: number | null;
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

function runPython(inputPath: string, outputPath: string): Promise<string> {
  const python = process.env.YFINANCE_PYTHON?.trim() || DEFAULT_PYTHON;
  return new Promise((resolve, reject) => {
    const child = spawn(python, [FETCH_SCRIPT, '--input', inputPath, '--output', outputPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 2_000_000) stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`corporate-actions collector failed (${code}): ${stderr.slice(-1000)}`));
        return;
      }
      resolve(stderr);
    });
  });
}

function parseLines(raw: string): { actions: ActionLine[]; invalid: number } {
  const actions: ActionLine[] = [];
  let invalid = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as ActionLine;
      const validType = parsed.action_type === 'dividend' || parsed.action_type === 'split';
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.effective_date ?? '');
      const validValue =
        (parsed.action_type === 'dividend' && typeof parsed.amount === 'number' && parsed.amount > 0) ||
        (parsed.action_type === 'split' && typeof parsed.ratio === 'number' && parsed.ratio > 0);
      if (validType && validDate && validValue) actions.push(parsed);
      else invalid += 1;
    } catch {
      invalid += 1;
    }
  }
  return { actions, invalid };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  const temporary = await mkdtemp(join(tmpdir(), 'stock-insight-ca-'));
  try {
    await client.query('BEGIN READ ONLY');
    const universe = await client.query<UniverseRow>(UNIVERSE_SQL);
    await client.query('COMMIT');

    const entityBySymbol = new Map(
      universe.rows.map((row) => [`${row.market}:${row.symbol}`, Number(row.security_entity_id)]),
    );

    const inputPath = join(temporary, 'universe.json');
    const outputPath = join(temporary, 'actions.ndjson');
    await writeFile(inputPath, JSON.stringify(universe.rows), 'utf8');
    const collectorLog = await runPython(inputPath, outputPath);
    const parsed = parseLines(await readFile(outputPath, 'utf8'));

    const summaryBase = {
      universe: universe.rows.length,
      actions: parsed.actions.length,
      invalid: parsed.invalid,
      collector: collectorLog.trim().split('\n').slice(-1)[0] ?? '',
    };

    if (!apply) {
      console.log(
        JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summaryBase }, null, 2),
      );
      return;
    }
    if (parsed.actions.length === 0)
      throw new Error('No corporate actions collected; refusing empty apply');

    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', '180s', true)");
    await client.query("SELECT set_config('lock_timeout', '5s', true)");
    let inserted = 0;
    let updated = 0;
    let unmatched = 0;
    for (const action of parsed.actions) {
      const entityId = entityBySymbol.get(`${action.market}:${action.symbol}`);
      if (entityId === undefined) {
        unmatched += 1;
        continue;
      }
      const result = await client.query<QueryResultRow & { inserted: boolean }>(UPSERT_ACTION_SQL, [
        entityId,
        action.action_type,
        action.effective_date,
        action.ratio,
        action.amount,
        action.market === 'KR' ? 'KRW' : 'USD',
        startedAt.toISOString(),
        JSON.stringify({ collected_run: startedAt.toISOString() }),
      ]);
      if (result.rows[0]?.inserted === true) inserted += 1;
      else updated += 1;
    }
    const summary = { ...summaryBase, inserted, updated, unmatched };
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `corporate-actions-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      parsed.actions.length,
      inserted + updated,
      unmatched + parsed.invalid,
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
