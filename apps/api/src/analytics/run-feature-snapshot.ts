import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET E / E-3: feature snapshot calculator (fs_v1) + market-confirmation axes.
// PIT: uses only bars with ts <= as_of and facts with available_at <= as_of.
// Missing inputs stay null (data_unavailable) — never imputed (Baseline §10.2).

const JOB_NAME = 'stock-insight-feature-snapshot';
const FEATURE_SET_VERSION = 'fs_v1';

const BARS_SQL = `
SELECT universe.security_entity_id,
       universe.market,
       regexp_replace(upper(ohlcv.symbol), '\\.(KS|KQ)$', '') AS ticker,
       ohlcv.ts,
       -- yfinance bars are ALREADY split-adjusted (verified: NVDA 2021 bar = 18.78,
       -- post-split scale). Do NOT divide by split factors — that double-adjusts
       -- and fabricates discontinuities for recent splitters (KLAC/NFLX/207940...).
       -- market.split_adjustment_factor is for UNADJUSTED sources (e.g. KRX raw).
       ohlcv.close::float8 AS adj_close,
       ohlcv.volume_base::float8 AS volume
FROM market_ts.ohlcv ohlcv
JOIN core.v_security_universe universe
  ON universe.ticker = regexp_replace(upper(ohlcv.symbol), '\\.(KS|KQ)$', '')
 AND universe.market = CASE WHEN ohlcv.exchange IN ('KOSPI','KOSDAQ') THEN 'KR' ELSE 'US' END
WHERE ohlcv.domain = 'stock' AND ohlcv.timeframe = '1D'
  AND ohlcv.ts <= $1::timestamptz
  AND ohlcv.ts >= $1::timestamptz - interval '400 days'
ORDER BY universe.security_entity_id, ohlcv.ts
`;

const SHORT_VOL_SQL = `
SELECT universe.security_entity_id,
       avg(short.short_volume / nullif(short.total_volume, 0))::float8 AS short_ratio_5d
FROM market.short_volume_daily short
JOIN core.v_security_universe universe
  ON universe.market = 'US' AND universe.ticker = short.symbol
WHERE short.trade_date <= $1::date AND short.trade_date > $1::date - 7
GROUP BY 1
`;

const EVENT_COUNT_SQL = `
SELECT target_entity_id AS security_entity_id, count(*)::int AS event_count_7d
FROM knowledge.event
WHERE target_entity_id IS NOT NULL
  AND coalesce(occurred_at, created_at) <= $1::timestamptz
  AND coalesce(occurred_at, created_at) > $1::timestamptz - interval '7 days'
GROUP BY 1
`;

const REVENUE_SQL = `
SELECT DISTINCT ON (fact.issuer_entity_id)
       fact.issuer_entity_id, fact.value::float8 AS revenue, fact.period_end, fact.fiscal_period
FROM market.financial_fact fact
WHERE fact.concept = 'Revenues' AND fact.available_at <= $1::timestamptz
ORDER BY fact.issuer_entity_id, fact.period_end DESC, fact.filed_at DESC
`;

// Company issuer -> Stock security mapping via shared INTERNAL_KEY suffix.
const ISSUER_TO_SECURITY_SQL = `
SELECT company_ident.entity_id AS issuer_entity_id, stock_ident.entity_id AS security_entity_id
FROM core.entity_identifier company_ident
JOIN core.entity_identifier stock_ident
  ON stock_ident.identifier_type = 'INTERNAL_KEY'
 AND company_ident.identifier_value = 'COMPANY:' || stock_ident.identifier_value
WHERE company_ident.identifier_type = 'INTERNAL_KEY'
`;

const UPSERT_SNAPSHOT_SQL = `
INSERT INTO analytics.asset_feature_snapshot (
  asset_entity_id, as_of, feature_set_version, features, completeness_score, input_watermark
) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)
ON CONFLICT (asset_entity_id, as_of, feature_set_version) DO NOTHING
RETURNING snapshot_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'derived', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type BarRow = QueryResultRow & {
  security_entity_id: string | number;
  market: 'KR' | 'US';
  ticker: string;
  ts: Date;
  adj_close: number;
  volume: number | null;
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

function logReturn(current: number, previous: number): number | null {
  if (current <= 0 || previous <= 0) return null;
  return Math.log(current / previous);
}

function round(value: number | null, places = 6): number | null {
  return value === null ? null : Number(value.toFixed(places));
}

function computeFeatures(closes: number[], volumes: Array<number | null>) {
  const last = closes.length - 1;
  const price = closes[last]!;
  const ret = (days: number): number | null =>
    last - days >= 0 ? logReturn(price, closes[last - days]!) : null;

  // 20d volatility (annualized) from daily log returns.
  let vol20: number | null = null;
  if (last >= 20) {
    const returns: number[] = [];
    for (let index = last - 19; index <= last; index += 1) {
      const value = logReturn(closes[index]!, closes[index - 1]!);
      if (value !== null) returns.push(value);
    }
    if (returns.length >= 15) {
      const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
      const variance =
        returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
      vol20 = Math.sqrt(variance) * Math.sqrt(252);
    }
  }

  const sma = (days: number): number | null => {
    if (last + 1 < days) return null;
    let sum = 0;
    for (let index = last - days + 1; index <= last; index += 1) sum += closes[index]!;
    return sum / days;
  };
  const sma20 = sma(20);
  const sma50 = sma(50);

  // RSI(14) — Wilder smoothing.
  let rsi14: number | null = null;
  if (last >= 14) {
    let gains = 0;
    let losses = 0;
    for (let index = last - 13; index <= last; index += 1) {
      const change = closes[index]! - closes[index - 1]!;
      if (change >= 0) gains += change;
      else losses -= change;
    }
    rsi14 = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  }

  // volume z-score vs trailing 20d.
  let volumeZ: number | null = null;
  const recentVolumes = volumes.slice(Math.max(0, last - 19), last + 1).filter(
    (value): value is number => value !== null && value > 0,
  );
  const todayVolume = volumes[last];
  if (recentVolumes.length >= 15 && todayVolume !== null && todayVolume! > 0) {
    const mean = recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length;
    const std = Math.sqrt(
      recentVolumes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / recentVolumes.length,
    );
    volumeZ = std > 0 ? (todayVolume! - mean) / std : null;
  }

  return {
    price: round(price),
    ret_1d: round(ret(1)),
    ret_5d: round(ret(5)),
    ret_20d: round(ret(20)),
    ret_60d: round(ret(60)),
    vol_20d: round(vol20),
    ma20_gap: sma20 !== null && sma20 > 0 ? round(price / sma20 - 1) : null,
    ma50_gap: sma50 !== null && sma50 > 0 ? round(price / sma50 - 1) : null,
    rsi_14: round(rsi14, 2),
    volume_z_20d: round(volumeZ, 3),
  };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const asOf = new Date();
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const bars = await client.query<BarRow>(BARS_SQL, [asOf.toISOString()]);
    const shorts = await client.query<QueryResultRow & { security_entity_id: string | number; short_ratio_5d: number }>(
      SHORT_VOL_SQL, [asOf.toISOString().slice(0, 10)]);
    const events = await client.query<QueryResultRow & { security_entity_id: string | number; event_count_7d: number }>(
      EVENT_COUNT_SQL, [asOf.toISOString()]);
    const revenues = await client.query<QueryResultRow & { issuer_entity_id: string | number; revenue: number; period_end: Date; fiscal_period: string }>(
      REVENUE_SQL, [asOf.toISOString()]);
    const issuerMap = await client.query<QueryResultRow & { issuer_entity_id: string | number; security_entity_id: string | number }>(
      ISSUER_TO_SECURITY_SQL);
    await client.query('COMMIT');

    const shortBySecurity = new Map(shorts.rows.map((row) => [Number(row.security_entity_id), row.short_ratio_5d]));
    const eventsBySecurity = new Map(events.rows.map((row) => [Number(row.security_entity_id), row.event_count_7d]));
    const securityByIssuer = new Map(issuerMap.rows.map((row) => [Number(row.issuer_entity_id), Number(row.security_entity_id)]));
    const revenueBySecurity = new Map<number, { revenue: number; period_end: string; fiscal_period: string }>();
    for (const row of revenues.rows) {
      const securityId = securityByIssuer.get(Number(row.issuer_entity_id));
      if (securityId !== undefined) {
        revenueBySecurity.set(securityId, {
          revenue: row.revenue,
          period_end: row.period_end.toISOString().slice(0, 10),
          fiscal_period: row.fiscal_period,
        });
      }
    }

    // Group bars per security (already ordered by ts).
    const barsBySecurity = new Map<number, { market: string; closes: number[]; volumes: Array<number | null> }>();
    for (const bar of bars.rows) {
      const id = Number(bar.security_entity_id);
      if (!barsBySecurity.has(id)) barsBySecurity.set(id, { market: bar.market, closes: [], volumes: [] });
      const group = barsBySecurity.get(id)!;
      group.closes.push(bar.adj_close);
      group.volumes.push(bar.volume);
    }

    const totalFeatureKeys = 13;
    let written = 0;
    let skippedShortHistory = 0;
    const inputWatermark = {
      ohlcv_max_ts: bars.rows.at(-1)?.ts?.toISOString() ?? null,
      short_volume_days: shorts.rows.length,
      events_window: '7d',
      revenue_facts: revenues.rows.length,
      adjustment: 'source-preadjusted-v2',
    };

    if (apply) {
      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '300s', true)");
    }
    for (const [securityId, group] of barsBySecurity) {
      if (group.closes.length < 30) {
        skippedShortHistory += 1;
        continue;
      }
      const priceFeatures = computeFeatures(group.closes, group.volumes);
      const features = {
        ...priceFeatures,
        short_vol_ratio_5d: round(shortBySecurity.get(securityId) ?? null, 4),
        event_count_7d: eventsBySecurity.get(securityId) ?? 0,
        latest_revenue: revenueBySecurity.get(securityId) ?? null,
      };
      const nonNull = Object.values(features).filter((value) => value !== null).length;
      const completeness = Number((nonNull / totalFeatureKeys).toFixed(3));
      if (apply) {
        const result = await client.query(UPSERT_SNAPSHOT_SQL, [
          securityId,
          asOf.toISOString(),
          FEATURE_SET_VERSION,
          JSON.stringify(features),
          completeness,
          JSON.stringify(inputWatermark),
        ]);
        if ((result.rowCount ?? 0) > 0) written += 1;
      }
    }

    const summary = {
      asOf: asOf.toISOString(),
      securities: barsBySecurity.size,
      written,
      skippedShortHistory,
      shortVolCoverage: shorts.rows.length,
      eventCoverage: events.rows.length,
      revenueCoverage: revenueBySecurity.size,
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `features-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      barsBySecurity.size,
      written,
      skippedShortHistory,
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
    client.release();
    await pool.end();
  }
}

await run();
