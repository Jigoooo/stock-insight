import type { DataAvailability, SourceLink, StockCompanyMetric } from '@stock-insight/contracts';

export type SecTickerEntityRow = {
  entity_key: string | null;
  symbol: string | null;
  market: string | null;
  name: string | null;
};

export type SecCompanyTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

export type SecCompanyTickerIndex = Record<string, SecCompanyTickerEntry>;

export type SecCompanyFactUnit = {
  accn?: string;
  end?: string;
  filed?: string;
  form?: string;
  fp?: string;
  fy?: number;
  frame?: string;
  val?: number;
};

export type SecCompanyFacts = {
  cik?: number;
  entityName?: string;
  facts?: Record<
    string,
    Record<
      string,
      {
        label?: string;
        description?: string;
        units?: Record<string, SecCompanyFactUnit[]>;
      }
    >
  >;
};

export type SecEdgarFetcher = {
  fetchJson: <T>(url: string) => Promise<T>;
};

export type SecEdgarMetricGroupCandidate = {
  entityKey: string;
  symbol: string;
  name?: string;
  cik: string;
  secTitle: string;
  metricGroup: 'sec_annual_facts';
  fiscalYear: number;
  fiscalPeriod: 'FY';
  currency: 'USD';
  availability: DataAvailability;
  reportedAt?: string;
  sources: SourceLink[];
  metrics: StockCompanyMetric[];
  warnings: string[];
};

export type SecEdgarTickerAudit = {
  entityKey: string;
  symbol: string;
  status:
    | 'ready'
    | 'unsupported_market'
    | 'missing_symbol'
    | 'missing_cik'
    | 'facts_missing'
    | 'no_annual_revenue'
    | 'no_eligible_metrics';
  cik?: string;
  secTitle?: string;
  fiscalYear?: number;
  metricCount: number;
  warnings: string[];
};

export type SecEdgarDryRunPlan = {
  sourceRows: number;
  usTickerRows: number;
  matchedTickers: number;
  companyFactsAvailable: number;
  metricGroups: SecEdgarMetricGroupCandidate[];
  tickerAudits: SecEdgarTickerAudit[];
};

export type SecEdgarDryRunAudit = {
  sourceRows: number;
  usTickerRows: number;
  matchedTickers: number;
  companyFactsAvailable: number;
  metricGroups: number;
  availableMetricGroups: number;
  skippedRows: number;
  warnings: string[];
  tickers: SecEdgarTickerAudit[];
};

export type SecEdgarWriteExecutor = {
  execute: (sql: string, params?: readonly unknown[]) => Promise<{ rowCount?: number | null }>;
};

export type SecEdgarApplyOptions = {
  runId: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
};

export type SecEdgarApplyResult = {
  audit: {
    rowsRead: number;
    rowsWritten: number;
    rowsSkipped: number;
    summary: SecEdgarDryRunAudit;
  };
};

export const SEC_APP_SURFACE_US_TICKER_ROWS_SQL = `
SELECT
  entity.entity_key,
  upper(entity.symbol) AS symbol,
  upper(entity.market) AS market,
  nullif(entity.name, '') AS name
FROM public.entities entity
WHERE upper(entity.market) = 'US'
  AND coalesce(entity.symbol, '') <> ''
ORDER BY upper(entity.symbol)
`;

export const SEC_COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

const SEC_COMPANYFACTS_URL_PREFIX = 'https://data.sec.gov/api/xbrl/companyfacts/CIK';

const UPSERT_SEC_COMPANY_FINANCIAL_SQL = `
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

const UPSERT_SEC_COMPANY_PROFILE_SQL = `
INSERT INTO public.company_profiles (
  entity_key, symbol, market, name, sector, industry, summary_text,
  profile_json, source_refs_json, availability, captured_at
) VALUES (
  $1, $2, 'US', $3, NULL, NULL, $4, $5::jsonb, $6::jsonb, 'text_only', $7::timestamptz
)
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

const INSERT_SEC_MIGRATION_RUN_SQL = `
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
  $1, $2, 'sec-edgar', 'completed', $3::timestamptz, $4::timestamptz, $5, $6, $7, NULL, $8::jsonb
)
`;

const SEC_ANNUAL_CONCEPTS = [
  {
    key: 'revenue',
    label: '매출',
    concepts: [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
    ],
  },
  { key: 'grossProfit', label: '매출총이익', concepts: ['GrossProfit'] },
  { key: 'operatingIncome', label: '영업이익', concepts: ['OperatingIncomeLoss'] },
  { key: 'netIncome', label: '순이익', concepts: ['NetIncomeLoss'] },
  { key: 'assets', label: '자산총계', concepts: ['Assets'] },
  { key: 'liabilities', label: '부채총계', concepts: ['Liabilities'] },
  {
    key: 'equity',
    label: '자본총계',
    concepts: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
  },
] as const;

type SecConceptKey = (typeof SEC_ANNUAL_CONCEPTS)[number]['key'];

type SelectedFact = {
  concept: string;
  fact: SecCompanyFactUnit;
};

function normalizeTicker(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

export function cik10(value: number | string): string {
  const numeric = String(value).replace(/\D/g, '');
  return numeric.padStart(10, '0');
}

export function secCompanyFactsUrl(cik: string): string {
  return `${SEC_COMPANYFACTS_URL_PREFIX}${cik}.json`;
}

export function buildSecCompanyTickerMap(
  index: SecCompanyTickerIndex,
): Map<string, SecCompanyTickerEntry> {
  const map = new Map<string, SecCompanyTickerEntry>();
  for (const entry of Object.values(index)) {
    const ticker = normalizeTicker(entry.ticker);
    if (ticker && Number.isInteger(entry.cik_str)) map.set(ticker, entry);
  }
  return map;
}

function isAnnualUsdFact(fact: SecCompanyFactUnit): boolean {
  const form = fact.form?.toUpperCase() ?? '';
  return (
    typeof fact.val === 'number' &&
    Number.isFinite(fact.val) &&
    Number.isInteger(fact.fy) &&
    (fact.fy ?? 0) >= 1900 &&
    fact.fp === 'FY' &&
    (form === '10-K' || form === '10-K/A')
  );
}

function dateSortValue(value: string | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortAnnualFacts(a: SecCompanyFactUnit, b: SecCompanyFactUnit): number {
  return (
    (b.fy ?? 0) - (a.fy ?? 0) ||
    dateSortValue(b.filed) - dateSortValue(a.filed) ||
    dateSortValue(b.end) - dateSortValue(a.end)
  );
}

function selectAnnualUsdFact(
  facts: SecCompanyFacts,
  concepts: readonly string[],
  fiscalYear?: number,
): SelectedFact | undefined {
  const usGaap = facts.facts?.['us-gaap'];
  if (!usGaap) return undefined;

  for (const concept of concepts) {
    const units = usGaap[concept]?.units?.USD ?? [];
    const candidates = units
      .filter(
        (fact) => isAnnualUsdFact(fact) && (fiscalYear === undefined || fact.fy === fiscalYear),
      )
      .sort(sortAnnualFacts);
    const selected = candidates[0];
    if (selected) return { concept, fact: selected };
  }

  return undefined;
}

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function metric(
  key: string,
  label: string,
  value: number | undefined,
  unit: string,
): StockCompanyMetric[] {
  if (value === undefined || !Number.isFinite(value)) return [];
  return [{ key, label, value, unit }];
}

function addMarginMetric(
  metrics: StockCompanyMetric[],
  warnings: string[],
  key: string,
  label: string,
  numerator: number | undefined,
  revenue: number,
  symbol: string,
  policy: { min: number; max: number; warnMin?: number; warnMax?: number },
) {
  if (numerator === undefined) return;
  const margin = (numerator / revenue) * 100;
  if (margin < policy.min || margin > policy.max) {
    warnings.push(
      `${symbol} ${label} ${margin.toFixed(1)}% is outside the guarded range; skipped.`,
    );
    return;
  }
  if (
    (policy.warnMin !== undefined && margin < policy.warnMin) ||
    (policy.warnMax !== undefined && margin > policy.warnMax)
  ) {
    warnings.push(`${symbol} ${label} ${margin.toFixed(1)}% is extreme; kept for review.`);
  }
  metrics.push({ key, label, value: Number(margin.toFixed(2)), unit: 'percent' });
}

function buildSourceRefs(cik: string, accn?: string): SourceLink[] {
  const sources: SourceLink[] = [
    {
      label: 'SEC EDGAR companyfacts',
      url: secCompanyFactsUrl(cik),
    },
  ];
  if (accn) {
    sources.push({
      label: 'SEC EDGAR accession',
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, '')}/`,
    });
  }
  return sources;
}

function buildMetricGroup(
  row: SecTickerEntityRow,
  tickerEntry: SecCompanyTickerEntry,
  facts: SecCompanyFacts,
): SecEdgarMetricGroupCandidate | SecEdgarTickerAudit {
  const symbol = normalizeTicker(row.symbol);
  const entityKey = row.entity_key?.trim() || `US:${symbol}`;
  const cik = cik10(tickerEntry.cik_str);
  const warnings: string[] = [];
  const selected = new Map<SecConceptKey, SelectedFact>();
  const revenue = selectAnnualUsdFact(
    facts,
    SEC_ANNUAL_CONCEPTS.find((concept) => concept.key === 'revenue')?.concepts ?? [],
  );

  if (!revenue || !revenue.fact.fy || revenue.fact.val === undefined || revenue.fact.val <= 0) {
    return {
      entityKey,
      symbol,
      status: 'no_annual_revenue',
      cik,
      secTitle: tickerEntry.title,
      metricCount: 0,
      warnings: [`${symbol} has no positive FY revenue fact from SEC 10-K USD units.`],
    };
  }

  selected.set('revenue', revenue);
  const fiscalYear = revenue.fact.fy;
  for (const concept of SEC_ANNUAL_CONCEPTS) {
    if (concept.key === 'revenue') continue;
    const fact = selectAnnualUsdFact(facts, concept.concepts, fiscalYear);
    if (fact) selected.set(concept.key, fact);
  }

  const valueFor = (key: SecConceptKey) => selected.get(key)?.fact.val;
  const metrics: StockCompanyMetric[] = [
    ...metric('revenue', '매출', valueFor('revenue'), 'currency'),
    ...metric('grossProfit', '매출총이익', valueFor('grossProfit'), 'currency'),
    ...metric('operatingIncome', '영업이익', valueFor('operatingIncome'), 'currency'),
    ...metric('netIncome', '순이익', valueFor('netIncome'), 'currency'),
    ...metric('assets', '자산총계', valueFor('assets'), 'currency'),
    ...metric('liabilities', '부채총계', valueFor('liabilities'), 'currency'),
    ...metric('equity', '자본총계', valueFor('equity'), 'currency'),
  ];

  addMarginMetric(
    metrics,
    warnings,
    'grossMarginPct',
    '매출총이익률',
    valueFor('grossProfit'),
    revenue.fact.val,
    symbol,
    { min: -100, max: 100 },
  );
  addMarginMetric(
    metrics,
    warnings,
    'operatingMarginPct',
    '영업이익률',
    valueFor('operatingIncome'),
    revenue.fact.val,
    symbol,
    { min: -500, max: 500, warnMin: -100, warnMax: 100 },
  );
  addMarginMetric(
    metrics,
    warnings,
    'netMarginPct',
    '순이익률',
    valueFor('netIncome'),
    revenue.fact.val,
    symbol,
    { min: -500, max: 500, warnMin: -100, warnMax: 100 },
  );

  if (metrics.length === 0) {
    return {
      entityKey,
      symbol,
      status: 'no_eligible_metrics',
      cik,
      secTitle: tickerEntry.title,
      fiscalYear,
      metricCount: 0,
      warnings: [`${symbol} had SEC facts but no metrics passed sanity gates.`],
    };
  }

  const reportedAt = toIsoDate(revenue.fact.filed ?? revenue.fact.end);
  return {
    entityKey,
    symbol,
    ...(row.name?.trim() ? { name: row.name.trim() } : {}),
    cik,
    secTitle: tickerEntry.title,
    metricGroup: 'sec_annual_facts',
    fiscalYear,
    fiscalPeriod: 'FY',
    currency: 'USD',
    availability: 'available',
    ...(reportedAt ? { reportedAt } : {}),
    sources: buildSourceRefs(cik, revenue.fact.accn),
    metrics,
    warnings,
  };
}

function isMetricGroup(
  value: SecEdgarMetricGroupCandidate | SecEdgarTickerAudit,
): value is SecEdgarMetricGroupCandidate {
  return 'metricGroup' in value;
}

export function buildSecEdgarDryRunPlan(
  rows: SecTickerEntityRow[],
  tickerIndex: SecCompanyTickerIndex,
  factsByCik: Record<string, SecCompanyFacts | undefined>,
): SecEdgarDryRunPlan {
  const tickerMap = buildSecCompanyTickerMap(tickerIndex);
  const tickerAudits: SecEdgarTickerAudit[] = [];
  const metricGroups: SecEdgarMetricGroupCandidate[] = [];
  let matchedTickers = 0;
  let companyFactsAvailable = 0;

  for (const row of rows) {
    const symbol = normalizeTicker(row.symbol);
    const market = normalizeTicker(row.market);
    const entityKey =
      row.entity_key?.trim() || (symbol ? `${market || 'US'}:${symbol}` : '(missing)');

    if (!symbol) {
      tickerAudits.push({
        entityKey,
        symbol,
        status: 'missing_symbol',
        metricCount: 0,
        warnings: ['Missing ticker symbol.'],
      });
      continue;
    }
    if (market !== 'US') {
      tickerAudits.push({
        entityKey,
        symbol,
        status: 'unsupported_market',
        metricCount: 0,
        warnings: [`${market || '(missing market)'} is not supported by SEC EDGAR.`],
      });
      continue;
    }

    const tickerEntry = tickerMap.get(symbol);
    if (!tickerEntry) {
      tickerAudits.push({
        entityKey,
        symbol,
        status: 'missing_cik',
        metricCount: 0,
        warnings: [`${symbol} was not found in SEC company_tickers.json.`],
      });
      continue;
    }

    matchedTickers += 1;
    const cik = cik10(tickerEntry.cik_str);
    const facts = factsByCik[cik];
    if (!facts) {
      tickerAudits.push({
        entityKey,
        symbol,
        status: 'facts_missing',
        cik,
        secTitle: tickerEntry.title,
        metricCount: 0,
        warnings: [`${symbol} companyfacts JSON was not available for CIK ${cik}.`],
      });
      continue;
    }

    companyFactsAvailable += 1;
    const candidate = buildMetricGroup(row, tickerEntry, facts);
    if (isMetricGroup(candidate)) {
      metricGroups.push(candidate);
      tickerAudits.push({
        entityKey: candidate.entityKey,
        symbol,
        status: 'ready',
        cik,
        secTitle: tickerEntry.title,
        fiscalYear: candidate.fiscalYear,
        metricCount: candidate.metrics.length,
        warnings: candidate.warnings,
      });
    } else {
      tickerAudits.push(candidate);
    }
  }

  return {
    sourceRows: rows.length,
    usTickerRows: rows.filter((row) => normalizeTicker(row.market) === 'US').length,
    matchedTickers,
    companyFactsAvailable,
    metricGroups,
    tickerAudits,
  };
}

export function summarizeSecEdgarDryRunAudit(plan: SecEdgarDryRunPlan): SecEdgarDryRunAudit {
  const skippedRows = plan.sourceRows - plan.metricGroups.length;
  const warnings = plan.tickerAudits.flatMap((ticker) => ticker.warnings);
  return {
    sourceRows: plan.sourceRows,
    usTickerRows: plan.usTickerRows,
    matchedTickers: plan.matchedTickers,
    companyFactsAvailable: plan.companyFactsAvailable,
    metricGroups: plan.metricGroups.length,
    availableMetricGroups: plan.metricGroups.filter((group) => group.availability === 'available')
      .length,
    skippedRows,
    warnings,
    tickers: plan.tickerAudits,
  };
}

export async function applySecEdgarBackfillPlan(
  plan: SecEdgarDryRunPlan,
  executor: SecEdgarWriteExecutor,
  options: SecEdgarApplyOptions,
): Promise<SecEdgarApplyResult> {
  const profiles = plan.tickerAudits.filter(
    (ticker) => ticker.cik && ticker.secTitle && ticker.symbol && ticker.entityKey,
  );
  for (const profile of profiles) {
    await executor.execute(UPSERT_SEC_COMPANY_PROFILE_SQL, [
      profile.entityKey,
      profile.symbol,
      profile.secTitle,
      `${profile.secTitle} SEC EDGAR 기업 프로필 (CIK ${profile.cik})`,
      JSON.stringify({ sourceSystem: 'sec-edgar', cik: profile.cik, secTitle: profile.secTitle }),
      JSON.stringify(buildSourceRefs(profile.cik ?? '')),
      options.finishedAt.toISOString(),
    ]);
  }
  for (const group of plan.metricGroups) {
    await executor.execute(UPSERT_SEC_COMPANY_FINANCIAL_SQL, [
      group.entityKey,
      group.fiscalYear,
      group.fiscalPeriod,
      group.metricGroup,
      group.currency,
      JSON.stringify({
        metrics: group.metrics,
        sourceSystem: 'sec-edgar-companyfacts',
        cik: group.cik,
        secTitle: group.secTitle,
        warnings: group.warnings,
      }),
      JSON.stringify(group.sources),
      group.availability,
      group.reportedAt ?? null,
    ]);
  }

  const summary = summarizeSecEdgarDryRunAudit(plan);
  const rowsWritten = profiles.length + plan.metricGroups.length;
  await executor.execute(INSERT_SEC_MIGRATION_RUN_SQL, [
    options.runId,
    options.jobName,
    options.startedAt.toISOString(),
    options.finishedAt.toISOString(),
    plan.sourceRows,
    rowsWritten,
    summary.skippedRows,
    JSON.stringify(summary),
  ]);

  return {
    audit: {
      rowsRead: plan.sourceRows,
      rowsWritten,
      rowsSkipped: summary.skippedRows,
      summary,
    },
  };
}

export async function collectSecEdgarDryRunPlan(
  rows: SecTickerEntityRow[],
  fetcher: SecEdgarFetcher,
): Promise<SecEdgarDryRunPlan> {
  const tickerIndex = await fetcher.fetchJson<SecCompanyTickerIndex>(SEC_COMPANY_TICKERS_URL);
  const tickerMap = buildSecCompanyTickerMap(tickerIndex);
  const factsByCik: Record<string, SecCompanyFacts | undefined> = {};

  for (const row of rows) {
    const symbol = normalizeTicker(row.symbol);
    if (normalizeTicker(row.market) !== 'US' || !symbol) continue;
    const tickerEntry = tickerMap.get(symbol);
    if (!tickerEntry) continue;
    const cik = cik10(tickerEntry.cik_str);
    if (Object.hasOwn(factsByCik, cik)) continue;
    try {
      factsByCik[cik] = await fetcher.fetchJson<SecCompanyFacts>(secCompanyFactsUrl(cik));
    } catch {
      factsByCik[cik] = undefined;
    }
  }

  return buildSecEdgarDryRunPlan(rows, tickerIndex, factsByCik);
}
