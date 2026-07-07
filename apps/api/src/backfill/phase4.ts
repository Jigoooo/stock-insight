import type { DataAvailability, SourceLink, StockCompanyMetric } from '@stock-insight/contracts';

export type Phase4MarketSnapshotRow = {
  entity_key: string | null;
  symbol: string | null;
  market: string | null;
  name: string | null;
  source: string | null;
  currency: string | null;
  latest_price: number | string | null;
  change_pct: number | string | null;
  payload_json: unknown;
  captured_at: string | Date | null;
};

export type Phase4CompanyMetricGroupSeed = {
  entityKey: string;
  metricGroup: string;
  fiscalYear: number;
  fiscalPeriod: string;
  currency: 'KRW' | 'USD';
  availability: DataAvailability;
  reportedAt?: string;
  sources: SourceLink[];
  metrics: StockCompanyMetric[];
};

export type Phase4CompanyMetricsPlan = {
  sourceRows: number;
  eligibleRows: number;
  metricGroups: Phase4CompanyMetricGroupSeed[];
};

export type Phase4CompanyMetricsAudit = {
  marketSnapshotRows: number;
  eligibleRows: number;
  metricGroups: number;
  availableMetricGroups: number;
  skippedRows: number;
  warnings: string[];
};

export type Phase4WriteExecutor = {
  execute: (sql: string, params?: readonly unknown[]) => Promise<{ rowCount?: number | null }>;
};

export type Phase4ApplyOptions = {
  runId: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
};

export type Phase4ApplyResult = {
  audit: {
    rowsRead: number;
    rowsWritten: number;
    rowsSkipped: number;
    summary: Phase4CompanyMetricsAudit;
  };
};

export const PHASE4_MARKET_SNAPSHOT_ROWS_SQL = `
WITH normalized_snapshots AS (
  SELECT
    concat(norm.market, ':', snapshot.symbol) AS entity_key,
    snapshot.symbol,
    norm.market,
    snapshot.name,
    snapshot.source,
    snapshot.currency,
    snapshot.value AS latest_price,
    snapshot.change_pct,
    snapshot.payload_json,
    coalesce(nullif(snapshot.collected_at, ''), snapshot.snapshot_date, '') AS captured_at,
    snapshot.id
  FROM stock.market_snapshots snapshot
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN upper(snapshot.region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(snapshot.region) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END AS market
  ) norm
  WHERE snapshot.symbol IS NOT NULL
), latest_snapshots AS (
  SELECT DISTINCT ON (normalized.entity_key)
    normalized.entity_key,
    normalized.symbol,
    normalized.market,
    normalized.name,
    normalized.source,
    normalized.currency,
    normalized.latest_price,
    normalized.change_pct,
    normalized.payload_json,
    normalized.captured_at,
    normalized.id
  FROM normalized_snapshots normalized
  WHERE normalized.entity_key IS NOT NULL
  ORDER BY normalized.entity_key, normalized.captured_at DESC NULLS LAST, normalized.id DESC
)
SELECT
  latest.entity_key,
  latest.symbol,
  latest.market,
  coalesce(nullif(entity.name, ''), latest.name) AS name,
  latest.source,
  latest.currency,
  latest.latest_price,
  latest.change_pct,
  latest.payload_json,
  latest.captured_at
FROM latest_snapshots latest
JOIN public.entities entity
  ON entity.entity_key = latest.entity_key
ORDER BY latest.entity_key
`;

const UPSERT_COMPANY_FINANCIAL_SQL = `
INSERT INTO public.company_financials (
  entity_key,
  fiscal_year,
  fiscal_period,
  metric_group,
  currency,
  metrics_json,
  source_refs_json,
  availability,
  reported_at
) VALUES (
  $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::timestamptz
)
ON CONFLICT (entity_key, fiscal_year, fiscal_period, metric_group) DO UPDATE SET
  currency = EXCLUDED.currency,
  metrics_json = EXCLUDED.metrics_json,
  source_refs_json = EXCLUDED.source_refs_json,
  availability = EXCLUDED.availability,
  reported_at = EXCLUDED.reported_at,
  updated_at = now()
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id,
  job_name,
  source_system,
  status,
  started_at,
  finished_at,
  rows_read,
  rows_written,
  rows_skipped,
  error,
  summary
) VALUES (
  $1, $2, 'stock-insight-app', 'completed', $3::timestamptz, $4::timestamptz, $5, $6, $7, NULL, $8::jsonb
)
`;

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function toFiniteNumber(value: number | string | null | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toIsoString(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function normalizeCurrency(value: string | null): 'KRW' | 'USD' | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'KRW' || normalized === 'USD') return normalized;
  return null;
}

function sourceRefsFor(source: string, symbol: string, market: string): SourceLink[] {
  const normalized = source.trim().toLowerCase();
  if (normalized === 'yfinance') {
    return [
      {
        label: 'Yahoo Finance',
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
      },
    ];
  }
  if (normalized === 'pykrx' || market === 'KR') {
    return [{ label: 'KRX', url: 'https://data.krx.co.kr/' }];
  }
  return [];
}

function payloadRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' || typeof value === 'string' ? toFiniteNumber(value) : undefined;
}

function metric(
  key: string,
  label: string,
  value: number | undefined,
  unit: string,
  predicate: (value: number) => boolean = () => true,
): StockCompanyMetric[] {
  if (value === undefined || !predicate(value)) return [];
  return [{ key, label, value, unit }];
}

function buildMetrics(row: Phase4MarketSnapshotRow): StockCompanyMetric[] {
  const payload = payloadRecord(row.payload_json);
  const latestPrice = toFiniteNumber(row.latest_price) ?? payloadNumber(payload, 'last');
  if (latestPrice === undefined || latestPrice <= 0) return [];
  const changePct = toFiniteNumber(row.change_pct);

  return [
    ...metric('latestPrice', '현재가', latestPrice, 'currency', (value) => value > 0),
    ...metric('changePct', '등락률', changePct, 'percent', (value) => Math.abs(value) <= 100),
    ...metric(
      'ma20',
      '20일 이동평균',
      payloadNumber(payload, 'ma20'),
      'currency',
      (value) => value > 0,
    ),
    ...metric(
      'ma50',
      '50일 이동평균',
      payloadNumber(payload, 'ma50'),
      'currency',
      (value) => value > 0,
    ),
    ...metric(
      'rsi14',
      'RSI(14)',
      payloadNumber(payload, 'rsi14'),
      'score',
      (value) => value >= 0 && value <= 100,
    ),
    ...metric('volume', '거래량', payloadNumber(payload, 'vol'), 'shares', (value) => value >= 0),
    ...metric(
      'pctFromMa20',
      '20일선 대비',
      payloadNumber(payload, 'pct_from_ma20'),
      'percent',
      (value) => Math.abs(value) <= 100,
    ),
  ];
}

function toMetricGroup(row: Phase4MarketSnapshotRow): Phase4CompanyMetricGroupSeed | null {
  const entityKey = row.entity_key?.trim();
  const symbol = row.symbol?.trim();
  const market = row.market?.trim().toUpperCase();
  const source = row.source?.trim();
  const currency = normalizeCurrency(row.currency);
  if (!entityKey || !symbol || !market || !source || !currency) return null;

  const sources = sourceRefsFor(source, symbol, market);
  const metrics = buildMetrics(row);
  if (sources.length === 0 || metrics.length === 0) return null;

  return {
    entityKey,
    metricGroup: 'market_snapshot',
    fiscalYear: 0,
    fiscalPeriod: 'latest',
    currency,
    availability: 'available',
    ...(toIsoString(row.captured_at) ? { reportedAt: toIsoString(row.captured_at) } : {}),
    sources,
    metrics,
  };
}

export function buildPhase4CompanyMetricsPlan(
  rows: Phase4MarketSnapshotRow[],
): Phase4CompanyMetricsPlan {
  const metricGroups = rows.flatMap((row) => {
    const group = toMetricGroup(row);
    return group ? [group] : [];
  });

  return {
    sourceRows: rows.length,
    eligibleRows: metricGroups.length,
    metricGroups,
  };
}

export function summarizePhase4CompanyMetricsAudit(
  plan: Phase4CompanyMetricsPlan,
): Phase4CompanyMetricsAudit {
  const skippedRows = plan.sourceRows - plan.eligibleRows;
  const warnings =
    skippedRows > 0
      ? [
          `${skippedRows} market snapshot row(s) were skipped because source/currency/range checks failed.`,
        ]
      : [];

  return {
    marketSnapshotRows: plan.sourceRows,
    eligibleRows: plan.eligibleRows,
    metricGroups: plan.metricGroups.length,
    availableMetricGroups: plan.metricGroups.filter((group) => group.availability === 'available')
      .length,
    skippedRows,
    warnings,
  };
}

export async function applyPhase4CompanyMetricsPlan(
  plan: Phase4CompanyMetricsPlan,
  executor: Phase4WriteExecutor,
  options: Phase4ApplyOptions,
): Promise<Phase4ApplyResult> {
  for (const group of plan.metricGroups) {
    await executor.execute(UPSERT_COMPANY_FINANCIAL_SQL, [
      group.entityKey,
      group.fiscalYear,
      group.fiscalPeriod,
      group.metricGroup,
      group.currency,
      JSON.stringify({ metrics: group.metrics, sourceSystem: 'stock.market_snapshots' }),
      JSON.stringify(group.sources),
      group.availability,
      group.reportedAt ?? null,
    ]);
  }

  const summary = summarizePhase4CompanyMetricsAudit(plan);
  await executor.execute(INSERT_MIGRATION_RUN_SQL, [
    options.runId,
    options.jobName,
    options.startedAt.toISOString(),
    options.finishedAt.toISOString(),
    plan.sourceRows,
    plan.metricGroups.length,
    summary.skippedRows,
    JSON.stringify(summary),
  ]);

  return {
    audit: {
      rowsRead: plan.sourceRows,
      rowsWritten: plan.metricGroups.length,
      rowsSkipped: summary.skippedRows,
      summary,
    },
  };
}
