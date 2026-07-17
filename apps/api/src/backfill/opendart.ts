import type { DataAvailability, SourceLink, StockCompanyMetric } from '@stock-insight/contracts';

export type DartEntityRow = {
  entity_key: string | null;
  symbol: string | null;
  market: string | null;
  name: string | null;
};

export type DartCompanyResponse = {
  status?: string;
  message?: string;
  corp_name?: string;
  corp_name_eng?: string;
  stock_name?: string;
  stock_code?: string;
  ceo_nm?: string;
  corp_cls?: string;
  adres?: string;
  hm_url?: string;
  ir_url?: string;
  phn_no?: string;
  induty_code?: string;
  est_dt?: string;
  acc_mt?: string;
};

export type DartFinancialRow = {
  rcept_no?: string;
  reprt_code?: string;
  bsns_year?: string;
  corp_code?: string;
  stock_code?: string;
  fs_div?: string;
  fs_nm?: string;
  sj_div?: string;
  sj_nm?: string;
  account_nm?: string;
  thstrm_nm?: string;
  thstrm_amount?: string;
  frmtrm_nm?: string;
  frmtrm_amount?: string;
};

export type DartFinancialResponse = {
  status?: string;
  message?: string;
  list?: DartFinancialRow[];
};

export type DartCompanyProfileSeed = {
  entityKey: string;
  symbol: string;
  name: string;
  summaryText: string;
  profile: Record<string, unknown>;
  sources: SourceLink[];
  availability: DataAvailability;
  capturedAt: string;
};

export type DartFinancialSeed = {
  entityKey: string;
  fiscalYear: number;
  fiscalPeriod: 'FY';
  metricGroup: 'dart_annual_facts';
  currency: 'KRW';
  metrics: StockCompanyMetric[];
  sources: SourceLink[];
  availability: DataAvailability;
  statementScope: 'CFS' | 'OFS';
  filingReceiptNo?: string;
  reportedAt?: string;
};

export type DartTickerAudit = {
  entityKey: string;
  symbol: string;
  corpCode?: string;
  status: 'ready' | 'missing_symbol' | 'missing_corp_code' | 'company_error' | 'financial_missing';
  profileReady: boolean;
  financialReady: boolean;
  message?: string;
};

export type DartBackfillPlan = {
  sourceRows: number;
  mappedRows: number;
  profiles: DartCompanyProfileSeed[];
  financials: DartFinancialSeed[];
  tickers: DartTickerAudit[];
};

export type DartWriteExecutor = {
  execute: (sql: string, params?: readonly unknown[]) => Promise<{ rowCount?: number | null }>;
};

export function assertDartApiSuccess(
  payload: { status?: string; message?: string },
  endpoint: string,
): void {
  if (payload.status === '000') return;
  throw new Error(
    `OpenDART status ${payload.status ?? '(missing)'} for ${endpoint}: ${payload.message ?? 'unknown error'}`,
  );
}

export function assertDartPlanUsable(plan: DartBackfillPlan): void {
  if (plan.mappedRows > 0 && plan.profiles.length === 0 && plan.financials.length === 0) {
    throw new Error(`OpenDART produced no usable data for ${plan.mappedRows} mapped rows`);
  }
}

export function assertDartEndpointCoverage(coverage: {
  mappedRows: number;
  companySuccesses: number;
  financialSuccesses: number;
}): void {
  if (coverage.mappedRows <= 0) return;
  if (coverage.companySuccesses === 0) {
    throw new Error(`OpenDART company endpoint failed for all ${coverage.mappedRows} mapped rows`);
  }
  if (coverage.financialSuccesses === 0) {
    throw new Error(
      `OpenDART financial endpoint failed for all ${coverage.mappedRows} mapped rows`,
    );
  }
}

export const DART_KR_ENTITY_ROWS_SQL = `
SELECT entity_key, symbol, market, name
FROM public.entities
WHERE upper(market) = 'KR'
  AND coalesce(symbol, '') ~ '^[0-9]{6}$'
ORDER BY symbol
`;

function profileSource(corpCode: string): SourceLink {
  return {
    label: 'OpenDART 기업개황',
    url: `https://dart.fss.or.kr/dsae001/selectPopup.ax?selectKey=${encodeURIComponent(corpCode)}`,
  };
}

function financialSource(receiptNo?: string): SourceLink {
  return receiptNo
    ? {
        label: `OpenDART 사업보고서 ${receiptNo}`,
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(receiptNo)}`,
      }
    : {
        label: 'OpenDART 단일회사 주요계정',
        url: 'https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019016',
      };
}

const UPSERT_DART_PROFILE_SQL = `
INSERT INTO public.company_profiles (
  entity_key, symbol, market, name, sector, industry, summary_text,
  profile_json, source_refs_json, availability, captured_at
) VALUES ($1, $2, 'KR', $3, NULL, NULL, $4, $5::jsonb, $6::jsonb, $7, $8::timestamptz)
ON CONFLICT (entity_key) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  market = EXCLUDED.market,
  name = EXCLUDED.name,
  summary_text = EXCLUDED.summary_text,
  profile_json = EXCLUDED.profile_json,
  source_refs_json = EXCLUDED.source_refs_json,
  availability = EXCLUDED.availability,
  captured_at = EXCLUDED.captured_at,
  updated_at = now()
`;

const UPSERT_DART_FINANCIAL_SQL = `
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
`;

const INSERT_DART_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'opendart', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

function text(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function parseDartAmount(value: string | null | undefined): number | undefined {
  const normalized = text(value)
    .replaceAll(',', '')
    .replace(/^\((.+)\)$/, '-$1');
  if (!normalized || normalized === '-') return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function preferredAccounts(rows: readonly DartFinancialRow[]): {
  scope: 'CFS' | 'OFS';
  selected: Map<string, DartFinancialRow>;
  receiptNo?: string;
} {
  const aliases = new Map([
    ['매출액', 'revenue'],
    ['영업수익', 'revenue'],
    ['수익(매출액)', 'revenue'],
    ['영업이익', 'operatingIncome'],
    ['영업이익(손실)', 'operatingIncome'],
    ['당기순이익', 'netIncome'],
    ['당기순이익(손실)', 'netIncome'],
    ['자산총계', 'assets'],
    ['부채총계', 'liabilities'],
    ['자본총계', 'equity'],
  ]);
  const eligible = rows.filter(
    (row) => aliases.has(text(row.account_nm)) && parseDartAmount(row.thstrm_amount) !== undefined,
  );
  const receiptNo = [...new Set(eligible.map((row) => text(row.rcept_no)).filter(Boolean))]
    .sort()
    .at(-1);
  const filingRows = receiptNo
    ? eligible.filter((row) => text(row.rcept_no) === receiptNo)
    : eligible;
  const scope: 'CFS' | 'OFS' = filingRows.some((row) => row.fs_div === 'CFS') ? 'CFS' : 'OFS';
  const selected = new Map<string, DartFinancialRow>();
  for (const row of filingRows) {
    if (row.fs_div !== scope) continue;
    const key = aliases.get(text(row.account_nm));
    if (key && !selected.has(key)) selected.set(key, row);
  }
  return { scope, selected, ...(receiptNo ? { receiptNo } : {}) };
}

function receiptReportedAt(receiptNo: string | undefined): string | undefined {
  if (!receiptNo || !/^\d{8}/.test(receiptNo)) return undefined;
  const date = new Date(
    `${receiptNo.slice(0, 4)}-${receiptNo.slice(4, 6)}-${receiptNo.slice(6, 8)}T00:00:00.000Z`,
  );
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function metric(
  key: string,
  label: string,
  value: number | undefined,
  unit: string,
): StockCompanyMetric[] {
  return value === undefined ? [] : [{ key, label, value, unit }];
}

export function buildDartFinancialSeed(
  entityKey: string,
  fiscalYear: number,
  response: DartFinancialResponse,
  expected?: { corpCode: string; symbol: string },
): DartFinancialSeed | undefined {
  if (response.status !== '000' || !Array.isArray(response.list)) return undefined;
  if (
    expected &&
    response.list.some((row) => {
      const corpCode = text(row.corp_code);
      const stockCode = text(row.stock_code);
      const businessYear = text(row.bsns_year);
      const reportCode = text(row.reprt_code);
      return (
        (corpCode && corpCode !== expected.corpCode) ||
        (stockCode && stockCode !== expected.symbol) ||
        (businessYear && businessYear !== String(fiscalYear)) ||
        (reportCode && reportCode !== '11011')
      );
    })
  ) {
    return undefined;
  }
  const preferred = preferredAccounts(response.list);
  const accounts = preferred.selected;
  const value = (key: string) => parseDartAmount(accounts.get(key)?.thstrm_amount);
  const revenue = value('revenue');
  const operatingIncome = value('operatingIncome');
  const netIncome = value('netIncome');
  const metrics: StockCompanyMetric[] = [
    ...metric('revenue', '매출', revenue, 'currency'),
    ...metric('operatingIncome', '영업이익', operatingIncome, 'currency'),
    ...metric('netIncome', '순이익', netIncome, 'currency'),
    ...metric('assets', '자산총계', value('assets'), 'currency'),
    ...metric('liabilities', '부채총계', value('liabilities'), 'currency'),
    ...metric('equity', '자본총계', value('equity'), 'currency'),
  ];
  if (revenue && revenue !== 0 && operatingIncome !== undefined) {
    const margin = (operatingIncome / revenue) * 100;
    if (Number.isFinite(margin) && margin >= -500 && margin <= 500) {
      metrics.push({
        key: 'operatingMarginPct',
        label: '영업이익률',
        value: Number(margin.toFixed(2)),
        unit: 'percent',
      });
    }
  }
  if (revenue && revenue !== 0 && netIncome !== undefined) {
    const margin = (netIncome / revenue) * 100;
    if (Number.isFinite(margin) && margin >= -500 && margin <= 500) {
      metrics.push({
        key: 'netMarginPct',
        label: '순이익률',
        value: Number(margin.toFixed(2)),
        unit: 'percent',
      });
    }
  }
  if (metrics.length === 0) return undefined;
  const reportedAt = receiptReportedAt(preferred.receiptNo);
  return {
    entityKey,
    fiscalYear,
    fiscalPeriod: 'FY',
    metricGroup: 'dart_annual_facts',
    currency: 'KRW',
    metrics,
    sources: [financialSource(preferred.receiptNo)],
    availability: 'available',
    statementScope: preferred.scope,
    ...(preferred.receiptNo ? { filingReceiptNo: preferred.receiptNo } : {}),
    ...(reportedAt ? { reportedAt } : {}),
  };
}

export function buildDartProfileSeed(
  row: DartEntityRow,
  corpCode: string,
  response: DartCompanyResponse,
  capturedAt: string,
): DartCompanyProfileSeed | undefined {
  const entityKey = text(row.entity_key);
  const symbol = text(row.symbol);
  const name = text(response.corp_name) || text(response.stock_name) || text(row.name);
  const responseSymbol = text(response.stock_code);
  if (
    response.status !== '000' ||
    !entityKey ||
    !symbol ||
    !name ||
    (responseSymbol && responseSymbol !== symbol)
  ) {
    return undefined;
  }
  const details = [
    text(response.ceo_nm) ? `대표 ${text(response.ceo_nm)}` : '',
    text(response.induty_code) ? `업종코드 ${text(response.induty_code)}` : '',
  ].filter(Boolean);
  return {
    entityKey,
    symbol,
    name,
    summaryText: `${name} 기업 개황${details.length ? ` (${details.join(', ')})` : ''}`,
    profile: {
      sourceSystem: 'opendart',
      corpCode,
      corpNameEnglish: text(response.corp_name_eng) || null,
      ceoName: text(response.ceo_nm) || null,
      corporationClass: text(response.corp_cls) || null,
      address: text(response.adres) || null,
      homepageUrl: text(response.hm_url) || null,
      irUrl: text(response.ir_url) || null,
      phone: text(response.phn_no) || null,
      industryCode: text(response.induty_code) || null,
      establishedDate: text(response.est_dt) || null,
      fiscalMonth: text(response.acc_mt) || null,
    },
    sources: [profileSource(corpCode)],
    availability: 'available',
    capturedAt,
  };
}

export async function applyDartBackfillPlan(
  plan: DartBackfillPlan,
  executor: DartWriteExecutor,
  options: { runId: string; jobName: string; startedAt: Date; finishedAt: Date },
): Promise<{ rowsWritten: number }> {
  for (const profile of plan.profiles) {
    await executor.execute(UPSERT_DART_PROFILE_SQL, [
      profile.entityKey,
      profile.symbol,
      profile.name,
      profile.summaryText,
      JSON.stringify(profile.profile),
      JSON.stringify(profile.sources),
      profile.availability,
      profile.capturedAt,
    ]);
  }
  for (const financial of plan.financials) {
    await executor.execute(UPSERT_DART_FINANCIAL_SQL, [
      financial.entityKey,
      financial.fiscalYear,
      financial.fiscalPeriod,
      financial.metricGroup,
      financial.currency,
      JSON.stringify({
        metrics: financial.metrics,
        sourceSystem: 'opendart-fnlttSinglAcnt',
        statementScope: financial.statementScope,
        filingReceiptNo: financial.filingReceiptNo ?? null,
      }),
      JSON.stringify(financial.sources),
      financial.availability,
      financial.reportedAt ?? null,
    ]);
  }
  const rowsWritten = plan.profiles.length + plan.financials.length;
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
  await executor.execute(INSERT_DART_MIGRATION_RUN_SQL, [
    options.runId,
    options.jobName,
    options.startedAt.toISOString(),
    options.finishedAt.toISOString(),
    plan.sourceRows,
    rowsWritten,
    plan.sourceRows - plan.financials.length,
    JSON.stringify(summary),
  ]);
  return { rowsWritten };
}
