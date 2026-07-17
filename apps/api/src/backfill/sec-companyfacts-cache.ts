import type { DataAvailability, SourceLink, StockCompanyMetric } from '@stock-insight/contracts';

export type SecMomentumSnapshotCompany = {
  ticker?: unknown;
  cik?: unknown;
  entity?: unknown;
  revenue_yoy_pct?: unknown;
  revenue_yoy_prev_pct?: unknown;
  revenue_accel_pct?: unknown;
  net_income_yoy_pct?: unknown;
  gross_margin_pct?: unknown;
  latest_period?: unknown;
  latest_form?: unknown;
  latest_revenue_usd?: unknown;
};

export type SecMomentumSnapshot = {
  source?: unknown;
  generated_at_kst?: unknown;
  n_universe?: unknown;
  n_collected?: unknown;
  companies?: unknown;
  errors?: unknown;
};

export type SecMomentumSeed = {
  entityKey: string;
  fiscalYear: number;
  fiscalPeriod: 'latest';
  metricGroup: 'sec_companyfacts_momentum';
  currency: 'USD';
  metrics: StockCompanyMetric[];
  sources: SourceLink[];
  availability: DataAvailability;
  reportedAt?: string;
  sourceGeneratedAt?: string;
};

export type SecMomentumWriteExecutor = {
  execute: (sql: string, params?: readonly unknown[]) => Promise<{ rowCount?: number | null }>;
};

const DEFAULT_MAX_CACHE_AGE_MS = 48 * 60 * 60 * 1000;

const UPSERT_SEC_MOMENTUM_SQL = `
INSERT INTO public.company_financials (
  entity_key, fiscal_year, fiscal_period, metric_group, currency,
  metrics_json, source_refs_json, availability, reported_at
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::timestamptz)
ON CONFLICT (entity_key, fiscal_year, fiscal_period, metric_group) DO UPDATE SET
  currency = EXCLUDED.currency,
  metrics_json = EXCLUDED.metrics_json,
  source_refs_json = EXCLUDED.source_refs_json,
  availability = EXCLUDED.availability,
  reported_at = EXCLUDED.reported_at,
  updated_at = now()
WHERE public.company_financials.reported_at IS NULL
   OR public.company_financials.reported_at <= EXCLUDED.reported_at
`;

const INSERT_SEC_CACHE_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'sec-edgar-cache', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function assertSecMomentumSnapshotFresh(
  snapshot: SecMomentumSnapshot,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_CACHE_AGE_MS,
): string {
  const raw = text(snapshot.generated_at_kst);
  const generatedAt = raw ? new Date(raw) : undefined;
  if (!generatedAt || Number.isNaN(generatedAt.getTime())) {
    throw new Error('SEC cache generated_at_kst is missing or invalid');
  }
  const ageMs = now.getTime() - generatedAt.getTime();
  if (ageMs < -5 * 60 * 1000) throw new Error('SEC cache generated_at_kst is in the future');
  if (ageMs > maxAgeMs) {
    throw new Error(`SEC cache snapshot is stale (${Math.round(ageMs / 3_600_000)}h)`);
  }
  return generatedAt.toISOString();
}

function metric(key: string, label: string, value: unknown, unit: string): StockCompanyMetric[] {
  const parsed = numberValue(value);
  return parsed === undefined ? [] : [{ key, label, value: parsed, unit }];
}

export function buildSecMomentumSeeds(snapshot: SecMomentumSnapshot): SecMomentumSeed[] {
  if (snapshot.source !== 'sec_companyfacts' || !Array.isArray(snapshot.companies)) return [];
  const generatedAtRaw = text(snapshot.generated_at_kst);
  const generatedAtDate = generatedAtRaw ? new Date(generatedAtRaw) : undefined;
  const sourceGeneratedAt =
    generatedAtDate && !Number.isNaN(generatedAtDate.getTime())
      ? generatedAtDate.toISOString()
      : undefined;
  const seeds: SecMomentumSeed[] = [];
  const seen = new Set<string>();

  for (const raw of snapshot.companies) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as SecMomentumSnapshotCompany;
    const ticker = text(row.ticker)?.toUpperCase();
    const cik = numberValue(row.cik);
    const latestPeriod = text(row.latest_period);
    const fiscalYear = latestPeriod ? Number(latestPeriod.slice(0, 4)) : Number.NaN;
    if (!ticker || !cik || !Number.isInteger(fiscalYear) || seen.has(ticker)) continue;
    const metrics: StockCompanyMetric[] = [
      ...metric('revenueGrowthYoYPct', '매출 YoY', row.revenue_yoy_pct, 'percent'),
      ...metric(
        'revenueGrowthPreviousYoYPct',
        '직전 매출 YoY',
        row.revenue_yoy_prev_pct,
        'percent',
      ),
      ...metric('revenueAccelerationPct', '매출 성장 가속도', row.revenue_accel_pct, 'percent'),
      ...metric('netIncomeGrowthYoYPct', '순이익 YoY', row.net_income_yoy_pct, 'percent'),
      ...metric('grossMarginPct', '매출총이익률', row.gross_margin_pct, 'percent'),
      ...metric('latestRevenue', '최근 보고 매출', row.latest_revenue_usd, 'currency'),
    ];
    if (metrics.length === 0) continue;
    const cik10 = String(Math.trunc(cik)).padStart(10, '0');
    seeds.push({
      entityKey: `US:${ticker}`,
      fiscalYear,
      fiscalPeriod: 'latest',
      metricGroup: 'sec_companyfacts_momentum',
      currency: 'USD',
      metrics,
      sources: [
        {
          label: `SEC EDGAR companyfacts (${text(row.latest_form) ?? 'filing'})`,
          url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`,
        },
      ],
      availability: 'available',
      ...(sourceGeneratedAt ? { reportedAt: sourceGeneratedAt } : {}),
      ...(sourceGeneratedAt ? { sourceGeneratedAt } : {}),
    });
    seen.add(ticker);
  }
  return seeds;
}

export async function applySecMomentumSeeds(
  snapshot: SecMomentumSnapshot,
  seeds: readonly SecMomentumSeed[],
  executor: SecMomentumWriteExecutor,
  options: { runId: string; jobName: string; startedAt: Date; finishedAt: Date; liveError: string },
): Promise<{ rowsWritten: number; rowsSkipped: number }> {
  assertSecMomentumSnapshotFresh(snapshot, options.finishedAt);
  let rowsWritten = 0;
  for (const seed of seeds) {
    const result = await executor.execute(UPSERT_SEC_MOMENTUM_SQL, [
      seed.entityKey,
      seed.fiscalYear,
      seed.fiscalPeriod,
      seed.metricGroup,
      seed.currency,
      JSON.stringify({
        metrics: seed.metrics,
        sourceSystem: 'sec-companyfacts-cache',
        sourceGeneratedAt: seed.sourceGeneratedAt ?? null,
      }),
      JSON.stringify(seed.sources),
      seed.availability,
      seed.reportedAt ?? null,
    ]);
    if ((result.rowCount ?? 0) > 0) rowsWritten += 1;
  }
  const sourceRows = Array.isArray(snapshot.companies) ? snapshot.companies.length : 0;
  const rowsSkipped = Math.max(0, sourceRows - rowsWritten);
  await executor.execute(INSERT_SEC_CACHE_RUN_SQL, [
    options.runId,
    options.jobName,
    options.startedAt.toISOString(),
    options.finishedAt.toISOString(),
    sourceRows,
    rowsWritten,
    rowsSkipped,
    JSON.stringify({
      fallbackReason: options.liveError,
      snapshotGeneratedAt: text(snapshot.generated_at_kst) ?? null,
      snapshotUniverse: numberValue(snapshot.n_universe) ?? null,
      snapshotCollected: numberValue(snapshot.n_collected) ?? null,
      rowsWritten,
      rowsSkipped,
    }),
  ]);
  return { rowsWritten, rowsSkipped };
}
