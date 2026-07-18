import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET E / E-2 (v2): split adjustment as a FACTOR TABLE, not in-place updates.
// market_ts.ohlcv is a compressed hypertable (183/262 chunks compressed) — bulk
// UPDATE would decompress ~1.5GB. Instead we materialize piecewise-constant
// cumulative split factors per security and join at read time
// (serving.price_series_adjusted_v1). adj_close = close / factor.

const JOB_NAME = 'stock-insight-split-factors';

const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS market.split_adjustment_factor (
    security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    effective_from     DATE NOT NULL,      -- bars with ts::date >= effective_from use this factor
    effective_to       DATE,               -- NULL = open interval (factor 1 for latest)
    cumulative_ratio   NUMERIC NOT NULL CHECK (cumulative_ratio > 0),
    adjustment_version TEXT NOT NULL DEFAULT 'split-v1',
    computed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (security_entity_id, effective_from)
)
`;

const ENSURE_VIEW_SQL = `
CREATE OR REPLACE VIEW serving.latest_split_factor_v1 AS
SELECT universe.market, universe.ticker, factor.security_entity_id,
       factor.effective_from, factor.effective_to, factor.cumulative_ratio
FROM market.split_adjustment_factor factor
JOIN core.v_security_universe universe
  ON universe.security_entity_id = factor.security_entity_id
`;

const GRANT_SQL = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON market.split_adjustment_factor TO stock_insight_app_reader;
    GRANT SELECT ON serving.latest_split_factor_v1 TO stock_insight_app_reader;
  END IF;
END $$
`;

const SPLITS_SQL = `
SELECT action.security_entity_id, action.effective_date, action.ratio
FROM market.corporate_action action
WHERE action.action_type = 'split' AND action.ratio IS NOT NULL AND action.ratio > 0
ORDER BY action.security_entity_id, action.effective_date
`;

const CLEAR_SQL = `DELETE FROM market.split_adjustment_factor WHERE security_entity_id = ANY($1::bigint[])`;

const INSERT_FACTOR_SQL = `
INSERT INTO market.split_adjustment_factor (
  security_entity_id, effective_from, effective_to, cumulative_ratio
) VALUES ($1, $2, $3, $4)
ON CONFLICT (security_entity_id, effective_from) DO UPDATE
SET effective_to = EXCLUDED.effective_to, cumulative_ratio = EXCLUDED.cumulative_ratio,
    computed_at = now()
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'derived', 'completed', $3, $4, $5, $6, 0, NULL, $7::jsonb)
`;

type SplitRow = QueryResultRow & {
  security_entity_id: string | number;
  effective_date: string | Date;
  ratio: string | number;
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

function toDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const splits = await client.query<SplitRow>(SPLITS_SQL);
    await client.query('COMMIT');

    // Build piecewise intervals per security. Bars BEFORE the earliest split
    // carry the largest divisor; bars after the last split carry factor 1.
    const bySecurity = new Map<number, Array<{ date: string; ratio: number }>>();
    for (const split of splits.rows) {
      const id = Number(split.security_entity_id);
      if (!bySecurity.has(id)) bySecurity.set(id, []);
      bySecurity.get(id)!.push({ date: toDateString(split.effective_date), ratio: Number(split.ratio) });
    }

    type Interval = { from: string; to: string | null; factor: number };
    const intervals = new Map<number, Interval[]>();
    for (const [securityId, securitySplits] of bySecurity) {
      securitySplits.sort((a, b) => a.date.localeCompare(b.date));
      const rows: Interval[] = [];
      // Walk from the oldest era forward: factor for an era = product of ratios
      // of all splits strictly AFTER that era.
      for (let index = 0; index <= securitySplits.length; index += 1) {
        const from = index === 0 ? '1900-01-01' : securitySplits[index - 1]!.date;
        const to = index === securitySplits.length ? null : securitySplits[index]!.date;
        let factor = 1;
        for (let later = index; later < securitySplits.length; later += 1) {
          factor *= securitySplits[later]!.ratio;
        }
        rows.push({ from, to, factor });
      }
      intervals.set(securityId, rows);
    }

    const summary = {
      securities: bySecurity.size,
      splits: splits.rows.length,
      intervals: [...intervals.values()].reduce((sum, rows) => sum + rows.length, 0),
    };

    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }

    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', '120s', true)");
    await client.query(ENSURE_TABLE_SQL);
    await client.query(ENSURE_VIEW_SQL);
    await client.query(GRANT_SQL);
    await client.query(CLEAR_SQL, [[...intervals.keys()]]);
    let written = 0;
    for (const [securityId, rows] of intervals) {
      for (const interval of rows) {
        await client.query(INSERT_FACTOR_SQL, [securityId, interval.from, interval.to, interval.factor]);
        written += 1;
      }
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `split-factors-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      splits.rows.length,
      written,
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: { ...summary, written } }, null, 2));
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
