import {
  stockDetailResponseSchema,
  stockListQuerySchema,
  stockListResponseSchema,
  type AnalysisJobStatus,
  type DashboardInsight,
  type DataAvailability,
  type EntityGlossaryTerm,
  type StockDetail,
  type StockAnalysisJob,
  type StockCompanyMetric,
  type StockCompanyMetricGroup,
  type StockCompanyProfile,
  type StockLearningCard,
  type StockAnalysisStatus,
  type StockDetailResponse,
  type StockListItem,
  type StockListQuery,
  type StockListResponse,
  type ResponseMeta,
} from '@stock-insight/contracts';

export type StockDatabaseRow = {
  entity_key: string | null;
  ticker: string | null;
  market: string | null;
  name: string | null;
  latest_price: number | string | null;
  currency: string | null;
  change_pct: number | string | null;
  primary_thesis: string | null;
  confidence: string | null;
  is_watched: boolean | string | number | null;
  is_holding: boolean | string | number | null;
  deep_report_length: number | string | null;
  last_analyzed_at: string | Date | null;
  snapshot_captured_at?: string | Date | null;
  deep_report?: string | null;
  deep_report_sources?: unknown;
  risks_text?: string | null;
  checkpoints_text?: string | null;
  source_urls?: unknown;
  related_news?: unknown;
  company_profile?: unknown;
  company_metrics?: unknown;
  learning_cards?: unknown;
  glossary_terms?: unknown;
  analysis_job_id?: number | string | null;
  analysis_job_status?: string | null;
  analysis_progress_pct?: number | string | null;
  analysis_queued_at?: string | Date | null;
  analysis_started_at?: string | Date | null;
  analysis_completed_at?: string | Date | null;
  analysis_error_message?: string | null;
};

export type StockRowQueryExecutor = (
  sql: string,
  params: readonly unknown[],
) => Promise<StockDatabaseRow[]>;

const STOCK_LIST_SQL = `
WITH normalized_candidates AS (
  SELECT
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END AS market,
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(ticker, '\\.(KS|KQ)$', '', 'i')
      ELSE ticker
    END AS ticker,
    name,
    thesis,
    confidence,
    coalesce(nullif(created_at, ''), run_date, '') AS created_sort,
    id
  FROM stock.candidates
  WHERE ticker IS NOT NULL
    AND name IS NOT NULL
    AND coalesce(market, '') <> ''
), latest_candidates AS (
  SELECT DISTINCT ON (market, ticker)
    concat(market, ':', ticker) AS entity_key,
    ticker,
    market,
    name,
    thesis AS primary_thesis,
    confidence,
    created_sort,
    id
  FROM normalized_candidates
  WHERE market IN ('KR', 'US')
  ORDER BY market, ticker, created_sort DESC, id DESC
), latest_snapshots AS (
  SELECT DISTINCT ON (
    CASE
      WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(region) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END,
    CASE
      WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(symbol, '\\.(KS|KQ)$', '', 'i')
      ELSE symbol
    END
  )
    CASE
      WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(region) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END AS market,
    CASE
      WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(symbol, '\\.(KS|KQ)$', '', 'i')
      ELSE symbol
    END AS ticker,
    value AS latest_price,
    currency,
    change_pct,
    coalesce(nullif(collected_at, ''), snapshot_date, '') AS collected_sort,
    id
  FROM stock.market_snapshots
  WHERE symbol IS NOT NULL
  ORDER BY
    CASE
      WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(region) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END,
    CASE
      WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(symbol, '\\.(KS|KQ)$', '', 'i')
      ELSE symbol
    END,
    coalesce(nullif(collected_at, ''), snapshot_date, '') DESC,
    id DESC
), active_watchlist AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    true AS is_watched
  FROM public.user_watchlist
  WHERE active IS TRUE
    AND removed_at IS NULL
    AND entity_key IS NOT NULL
    AND split_part(entity_key, ':', 1) IN ('KR', 'US')
  ORDER BY entity_key, added_at DESC, id DESC
), open_positions AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    true AS is_holding
  FROM public.user_positions
  WHERE closed_at IS NULL
    AND status = 'open'
    AND entity_key IS NOT NULL
    AND split_part(entity_key, ':', 1) IN ('KR', 'US')
  ORDER BY entity_key, opened_at DESC, id DESC
), deep_reports AS (
  SELECT DISTINCT ON (
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END,
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(ticker, '\\.(KS|KQ)$', '', 'i')
      ELSE ticker
    END
  )
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END AS market,
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(ticker, '\\.(KS|KQ)$', '', 'i')
      ELSE ticker
    END AS ticker,
    length(coalesce(report, '')) AS deep_report_length,
    researched_at
  FROM watchlist.deep_cache
  WHERE ticker IS NOT NULL
  ORDER BY
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END,
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(ticker, '\\.(KS|KQ)$', '', 'i')
      ELSE ticker
    END,
    researched_at DESC
)
SELECT
  candidate.entity_key,
  candidate.ticker,
  candidate.market,
  candidate.name,
  snapshot.latest_price,
  snapshot.currency,
  snapshot.change_pct,
  candidate.primary_thesis,
  candidate.confidence,
  coalesce(watchlist.is_watched, false) AS is_watched,
  coalesce(position.is_holding, false) AS is_holding,
  deep.deep_report_length,
  deep.researched_at AS last_analyzed_at
FROM latest_candidates candidate
LEFT JOIN latest_snapshots snapshot
  ON snapshot.market = candidate.market
 AND snapshot.ticker = candidate.ticker
LEFT JOIN active_watchlist watchlist
  ON watchlist.entity_key = candidate.entity_key
LEFT JOIN open_positions position
  ON position.entity_key = candidate.entity_key
LEFT JOIN deep_reports deep
  ON deep.market = candidate.market
 AND deep.ticker = candidate.ticker
WHERE ($1::text IS NULL OR candidate.market = $1::text)
  AND (
    $2::text IN ('all', '')
    OR ($2::text = 'watchlist' AND coalesce(watchlist.is_watched, false) IS TRUE)
    OR ($2::text = 'holding' AND coalesce(position.is_holding, false) IS TRUE)
    OR (
      $2::text = 'discover'
      AND coalesce(watchlist.is_watched, false) IS FALSE
      AND coalesce(position.is_holding, false) IS FALSE
    )
  )
  AND (
    $3::text IS NULL
    OR candidate.ticker ILIKE $3::text
    OR candidate.name ILIKE $3::text
    OR candidate.primary_thesis ILIKE $3::text
  )
ORDER BY
  coalesce(watchlist.is_watched, false) DESC,
  coalesce(position.is_holding, false) DESC,
  candidate.created_sort DESC,
  candidate.name ASC
LIMIT 100
`;

const STOCK_DETAIL_SQL = `
WITH parsed_entity AS (
  SELECT
    split_part($1::text, ':', 1) AS market,
    CASE
      WHEN split_part($1::text, ':', 1) = 'KR' THEN regexp_replace(split_part($1::text, ':', 2), '\\.(KS|KQ)$', '', 'i')
      ELSE split_part($1::text, ':', 2)
    END AS ticker,
    concat(
      split_part($1::text, ':', 1),
      ':',
      CASE
        WHEN split_part($1::text, ':', 1) = 'KR' THEN regexp_replace(split_part($1::text, ':', 2), '\\.(KS|KQ)$', '', 'i')
        ELSE split_part($1::text, ':', 2)
      END
    ) AS entity_key
), normalized_candidates AS (
  SELECT
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE NULL
    END AS market,
    CASE
      WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(ticker, '\\.(KS|KQ)$', '', 'i')
      ELSE ticker
    END AS ticker,
    name,
    thesis,
    confidence,
    risks,
    check_indicators,
    source_urls,
    coalesce(nullif(created_at, ''), run_date, '') AS created_sort,
    id
  FROM stock.candidates
  WHERE ticker IS NOT NULL
    AND name IS NOT NULL
    AND coalesce(market, '') <> ''
), latest_candidate AS (
  SELECT DISTINCT ON (candidate.market, candidate.ticker)
    concat(candidate.market, ':', candidate.ticker) AS entity_key,
    candidate.ticker,
    candidate.market,
    candidate.name,
    candidate.thesis AS primary_thesis,
    candidate.confidence,
    candidate.risks AS risks_text,
    candidate.check_indicators AS checkpoints_text,
    candidate.source_urls,
    candidate.created_sort,
    candidate.id
  FROM normalized_candidates candidate
  JOIN parsed_entity entity
    ON entity.market = candidate.market
   AND entity.ticker = candidate.ticker
  WHERE candidate.market IN ('KR', 'US')
  ORDER BY candidate.market, candidate.ticker, candidate.created_sort DESC, candidate.id DESC
), entity_row AS (
  SELECT
    entity.entity_key,
    entity.symbol AS ticker,
    CASE
      WHEN upper(entity.market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(entity.market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
      ELSE parsed.market
    END AS market,
    entity.name
  FROM public.entities entity
  JOIN parsed_entity parsed
    ON entity.entity_key = parsed.entity_key
  WHERE entity.entity_type = 'ticker'
    AND entity.symbol IS NOT NULL
    AND entity.name IS NOT NULL
  LIMIT 1
), detail_anchor AS (
  SELECT
    coalesce(candidate.entity_key, entity_row.entity_key) AS entity_key,
    coalesce(candidate.ticker, entity_row.ticker) AS ticker,
    coalesce(candidate.market, entity_row.market) AS market,
    coalesce(candidate.name, entity_row.name) AS name,
    candidate.primary_thesis,
    candidate.confidence,
    candidate.risks_text,
    candidate.checkpoints_text,
    candidate.source_urls
  FROM parsed_entity parsed
  LEFT JOIN latest_candidate candidate
    ON true
  LEFT JOIN entity_row entity_row
    ON true
  WHERE coalesce(candidate.entity_key, entity_row.entity_key) IS NOT NULL
    AND coalesce(candidate.market, entity_row.market) IN ('KR', 'US')
), latest_snapshot AS (
  SELECT DISTINCT ON (snapshot.market, snapshot.ticker)
    snapshot.market,
    snapshot.ticker,
    snapshot.latest_price,
    snapshot.currency,
    snapshot.change_pct,
    snapshot.collected_sort AS snapshot_captured_at,
    snapshot.id
  FROM (
    SELECT
      CASE
        WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
        WHEN upper(region) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
        ELSE NULL
      END AS market,
      CASE
        WHEN upper(region) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(symbol, '\\.(KS|KQ)$', '', 'i')
        ELSE symbol
      END AS ticker,
      value AS latest_price,
      currency,
      change_pct,
      coalesce(nullif(collected_at, ''), snapshot_date, '') AS collected_sort,
      id
    FROM stock.market_snapshots
    WHERE symbol IS NOT NULL
  ) snapshot
  JOIN parsed_entity entity
    ON entity.market = snapshot.market
   AND entity.ticker = snapshot.ticker
  ORDER BY snapshot.market, snapshot.ticker, snapshot.collected_sort DESC, snapshot.id DESC
), active_watchlist AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    true AS is_watched
  FROM public.user_watchlist
  WHERE active IS TRUE
    AND removed_at IS NULL
    AND entity_key = (SELECT entity_key FROM parsed_entity)
  ORDER BY entity_key, added_at DESC, id DESC
), open_positions AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    true AS is_holding
  FROM public.user_positions
  WHERE closed_at IS NULL
    AND status = 'open'
    AND entity_key = (SELECT entity_key FROM parsed_entity)
  ORDER BY entity_key, opened_at DESC, id DESC
), deep_report AS (
  SELECT DISTINCT ON (deep.market, deep.ticker)
    deep.market,
    deep.ticker,
    deep.report AS deep_report,
    deep.sources AS deep_report_sources,
    length(coalesce(deep.report, '')) AS deep_report_length,
    deep.researched_at
  FROM (
    SELECT
      CASE
        WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
        WHEN upper(market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX') THEN 'US'
        ELSE NULL
      END AS market,
      CASE
        WHEN upper(market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN regexp_replace(ticker, '\\.(KS|KQ)$', '', 'i')
        ELSE ticker
      END AS ticker,
      report,
      sources,
      researched_at
    FROM watchlist.deep_cache
    WHERE ticker IS NOT NULL
  ) deep
  JOIN parsed_entity entity
    ON entity.market = deep.market
   AND entity.ticker = deep.ticker
  ORDER BY deep.market, deep.ticker, deep.researched_at DESC
), related_news AS (
  SELECT coalesce(json_agg(news_item ORDER BY news_sort DESC NULLS LAST), '[]'::json) AS items
  FROM (
    SELECT
      json_build_object(
        'id', concat('feed:', record_id::text),
        'title', coalesce(nullif(title, ''), record_entity_key),
        'context', coalesce(nullif(summary_text, ''), nullif(title, ''), record_entity_key),
        'impact', CASE
          WHEN coalesce(relevance_score, 0) >= 0.7 THEN '높음'
          WHEN coalesce(relevance_score, 0) >= 0.4 THEN '중간'
          ELSE '낮음'
        END,
        'icon', 'newspaper'
      ) AS news_item,
      coalesce(published_at, effective_date) AS news_sort,
      record_id
    FROM public.v_user_feed_dedup
    WHERE domain = 'stock'
      AND record_entity_key = (SELECT entity_key FROM parsed_entity)
      AND coalesce(title, '') <> ''
    ORDER BY coalesce(published_at, effective_date) DESC NULLS LAST, record_id DESC
    LIMIT 5
  ) feed
), learning_cards AS (
  SELECT coalesce(json_agg(card_item ORDER BY card_sort DESC NULLS LAST, card_id DESC), '[]'::json) AS items
  FROM (
    SELECT
      json_build_object(
        'cardKey', card.card_key,
        'section', card.section,
        'title', card.title,
        'bodyMarkdown', card.body_markdown,
        'bullets', coalesce(card.bullets_json, '[]'::jsonb),
        'availability', card.availability,
        'sources', coalesce(card.source_refs_json, '[]'::jsonb),
        'updatedAt', card.updated_at
      ) AS card_item,
      card.updated_at AS card_sort,
      card.id AS card_id
    FROM public.stock_learning_cards card
    WHERE card.entity_key = (SELECT entity_key FROM parsed_entity)
    ORDER BY card.updated_at DESC NULLS LAST, card.id DESC
    LIMIT 8
  ) cards
), glossary_terms AS (
  SELECT coalesce(json_agg(term_item ORDER BY term), '[]'::json) AS items
  FROM (
    SELECT
      term.term,
      json_build_object(
        'term', term.term,
        'definition', term.definition,
        'sources', coalesce(term.source_refs_json, '[]'::jsonb)
      ) AS term_item
    FROM public.entity_glossary_terms term
    WHERE term.entity_key = (SELECT entity_key FROM parsed_entity) OR term.entity_key IS NULL
    ORDER BY term.term ASC
    LIMIT 12
  ) terms
), company_profile AS (
  SELECT (
    SELECT json_build_object(
      'status', profile.availability,
      'symbol', profile.symbol,
      'market', profile.market,
      'name', profile.name,
      'sector', profile.sector,
      'industry', profile.industry,
      'summaryText', profile.summary_text,
      'sources', coalesce(profile.source_refs_json, '[]'::jsonb),
      'capturedAt', profile.captured_at
    )
    FROM public.company_profiles profile
    WHERE profile.entity_key = (SELECT entity_key FROM parsed_entity)
    ORDER BY profile.updated_at DESC NULLS LAST, profile.id DESC
    LIMIT 1
  ) AS item
), company_metrics AS (
  SELECT coalesce(json_agg(metric_item ORDER BY metric_sort DESC NULLS LAST, metric_group), '[]'::json) AS items
  FROM (
    SELECT
      json_build_object(
        'metricGroup', financial.metric_group,
        'fiscalYear', financial.fiscal_year,
        'fiscalPeriod', financial.fiscal_period,
        'currency', financial.currency,
        'availability', financial.availability,
        'reportedAt', financial.reported_at,
        'sources', coalesce(financial.source_refs_json, '[]'::jsonb),
        'metrics', coalesce(financial.metrics_json->'metrics', '[]'::jsonb)
      ) AS metric_item,
      financial.reported_at AS metric_sort,
      financial.metric_group
    FROM public.company_financials financial
    WHERE financial.entity_key = (SELECT entity_key FROM parsed_entity)
    ORDER BY financial.reported_at DESC NULLS LAST, financial.id DESC
    LIMIT 8
  ) metrics
), learning_status AS (
  SELECT
    analysis_job_id,
    analysis_status AS analysis_job_status,
    progress_pct AS analysis_progress_pct,
    queued_at AS analysis_queued_at,
    started_at AS analysis_started_at,
    completed_at AS analysis_completed_at,
    error_message AS analysis_error_message
  FROM public.v_stock_learning_status
  WHERE entity_key = (SELECT entity_key FROM parsed_entity)
  LIMIT 1
)
SELECT
  candidate.entity_key,
  candidate.ticker,
  candidate.market,
  candidate.name,
  snapshot.latest_price,
  snapshot.currency,
  snapshot.change_pct,
  snapshot.snapshot_captured_at,
  candidate.primary_thesis,
  candidate.confidence,
  coalesce(watchlist.is_watched, false) AS is_watched,
  coalesce(position.is_holding, false) AS is_holding,
  deep.deep_report_length,
  deep.researched_at AS last_analyzed_at,
  deep.deep_report,
  deep.deep_report_sources,
  candidate.risks_text,
  candidate.checkpoints_text,
  candidate.source_urls,
  news.items AS related_news,
  company_profile.item AS company_profile,
  company_metrics.items AS company_metrics,
  learning_cards.items AS learning_cards,
  glossary_terms.items AS glossary_terms,
  learning_status.analysis_job_id,
  learning_status.analysis_job_status,
  learning_status.analysis_progress_pct,
  learning_status.analysis_queued_at,
  learning_status.analysis_started_at,
  learning_status.analysis_completed_at,
  learning_status.analysis_error_message
FROM detail_anchor candidate
LEFT JOIN latest_snapshot snapshot
  ON snapshot.market = candidate.market
 AND snapshot.ticker = candidate.ticker
LEFT JOIN active_watchlist watchlist
  ON watchlist.entity_key = candidate.entity_key
LEFT JOIN open_positions position
  ON position.entity_key = candidate.entity_key
LEFT JOIN deep_report deep
  ON deep.market = candidate.market
 AND deep.ticker = candidate.ticker
CROSS JOIN related_news news
CROSS JOIN company_profile company_profile
CROSS JOIN company_metrics company_metrics
CROSS JOIN learning_cards learning_cards
CROSS JOIN glossary_terms glossary_terms
LEFT JOIN learning_status learning_status
  ON true
LIMIT 1
`;

function normalizeApiMarket(value: string | null): 'KR' | 'US' | null {
  const normalized = value?.toUpperCase();
  if (normalized === 'KR' || normalized === 'US') return normalized;
  return null;
}

function toFiniteNumber(value: number | string | null): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toBoolean(value: boolean | string | number | null): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string')
    return ['1', 't', 'true', 'y', 'yes'].includes(value.toLowerCase());
  return false;
}

function toIsoString(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function normalizeConfidence(value: string | null): 'low' | 'medium' | 'high' | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized;
  return undefined;
}

function normalizeAnalysisJobStatus(value: unknown): AnalysisJobStatus | null {
  const normalized = typeof value === 'string' ? value.toLowerCase() : null;
  if (
    normalized === 'queued' ||
    normalized === 'running' ||
    normalized === 'completed' ||
    normalized === 'failed' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }
  return null;
}

function normalizeDataAvailability(value: unknown): DataAvailability {
  const normalized = typeof value === 'string' ? value.toLowerCase() : null;
  if (
    normalized === 'available' ||
    normalized === 'missing' ||
    normalized === 'collecting' ||
    normalized === 'stale' ||
    normalized === 'text_only' ||
    normalized === 'unsupported' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  return 'missing';
}

function deriveStockAnalysisStatus(
  row: StockDatabaseRow,
  lastAnalyzedAt: string | undefined,
  deepReportLength: number,
): StockAnalysisStatus {
  const jobStatus = normalizeAnalysisJobStatus(row.analysis_job_status);
  if (jobStatus === 'queued' || jobStatus === 'running') return jobStatus;
  if (jobStatus === 'failed' || jobStatus === 'cancelled') return 'failed';
  if (jobStatus === 'completed' || lastAnalyzedAt || deepReportLength > 0) return 'cached';
  return 'none';
}

function mapStockDatabaseRow(row: StockDatabaseRow): StockListItem | null {
  const market = normalizeApiMarket(row.market);
  const ticker = row.ticker?.trim();
  const name = row.name?.trim();
  if (!market || !ticker || !name) return null;

  const latestPrice = toFiniteNumber(row.latest_price);
  const changePct = toFiniteNumber(row.change_pct);
  const deepReportLength = toFiniteNumber(row.deep_report_length) ?? 0;
  const lastAnalyzedAt = toIsoString(row.last_analyzed_at);
  const currency = latestPrice === undefined ? undefined : row.currency === 'USD' ? 'USD' : 'KRW';

  return {
    entityKey: row.entity_key?.trim() || `${market}:${ticker}`,
    ticker,
    market,
    name,
    displayName: `${name} · ${ticker}`,
    isWatched: toBoolean(row.is_watched),
    isHolding: toBoolean(row.is_holding),
    ...(latestPrice === undefined ? {} : { latestPrice }),
    ...(currency ? { currency } : {}),
    ...(changePct === undefined ? {} : { changePct }),
    ...(row.primary_thesis?.trim() ? { primaryThesis: row.primary_thesis.trim() } : {}),
    ...(normalizeConfidence(row.confidence)
      ? { confidence: normalizeConfidence(row.confidence) }
      : {}),
    analysisStatus: deriveStockAnalysisStatus(row, lastAnalyzedAt, deepReportLength),
    ...(lastAnalyzedAt ? { lastAnalyzedAt } : {}),
  };
}

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

function parseDelimitedText(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toSourceUrl(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value === 'object' && 'url' in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  }
  return null;
}

function toSourceLabel(value: unknown, url: string): string {
  if (value && typeof value === 'object' && 'label' in value) {
    const label = (value as { label?: unknown }).label;
    if (typeof label === 'string' && label.trim()) return label.trim();
  }
  return new URL(url).hostname;
}

function parseSourceUrls(...values: unknown[]): Array<{ label: string; url: string }> {
  const sources: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const parsed = parseJsonValue(rawValue);
    const candidates = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'string'
        ? parsed.split(/[;\n,]+/)
        : [];

    for (const candidate of candidates) {
      const url = toSourceUrl(candidate);
      if (!url || seen.has(url)) continue;
      try {
        const source = { label: toSourceLabel(candidate, url), url };
        new URL(source.url);
        seen.add(source.url);
        sources.push(source);
      } catch {
        // Ignore malformed source text from migrated legacy rows.
      }
    }
  }

  return sources;
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => {
      if (typeof item !== 'string') return [];
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    });
  }
  if (typeof parsed === 'string') return parseDelimitedText(parsed);
  return [];
}

function isoFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string' || value instanceof Date) return toIsoString(value);
  return undefined;
}

function parseLearningCards(value: unknown): StockLearningCard[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const cardKey = typeof record.cardKey === 'string' ? record.cardKey.trim() : '';
    const section = typeof record.section === 'string' ? record.section.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!cardKey || !section || !title) return [];

    const bodyMarkdown =
      typeof record.bodyMarkdown === 'string' && record.bodyMarkdown.trim()
        ? record.bodyMarkdown.trim()
        : undefined;
    const updatedAt = isoFromUnknown(record.updatedAt);

    return [
      {
        cardKey,
        section,
        title,
        ...(bodyMarkdown ? { bodyMarkdown } : {}),
        bullets: parseStringArray(record.bullets),
        availability: normalizeDataAvailability(record.availability),
        sources: parseSourceUrls(record.sources),
        ...(updatedAt ? { updatedAt } : {}),
      },
    ];
  });
}

function parseGlossaryTerms(value: unknown): EntityGlossaryTerm[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const term = typeof record.term === 'string' ? record.term.trim() : '';
    const definition = typeof record.definition === 'string' ? record.definition.trim() : '';
    if (!term || !definition) return [];

    return [
      {
        term,
        definition,
        sources: parseSourceUrls(record.sources),
      },
    ];
  });
}

function mapStockAnalysisJob(row: StockDatabaseRow): StockAnalysisJob | undefined {
  const status = normalizeAnalysisJobStatus(row.analysis_job_status);
  const id = row.analysis_job_id?.toString().trim();
  if (!status || !id) return undefined;

  const progressPct = toFiniteNumber(row.analysis_progress_pct ?? null);
  const queuedAt = toIsoString(row.analysis_queued_at ?? null);
  const startedAt = toIsoString(row.analysis_started_at ?? null);
  const completedAt = toIsoString(row.analysis_completed_at ?? null);
  const errorMessage = row.analysis_error_message?.trim();

  return {
    id,
    status,
    ...(progressPct === undefined ? {} : { progressPct }),
    ...(queuedAt ? { queuedAt } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function parseMetricItems(value: unknown): StockCompanyMetric[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.trim() : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const valueNumber = toFiniteNumber(
      typeof record.value === 'number' || typeof record.value === 'string' ? record.value : null,
    );
    if (!key || !label || valueNumber === undefined) return [];
    const unit = typeof record.unit === 'string' && record.unit.trim() ? record.unit.trim() : undefined;
    return [{ key, label, value: valueNumber, ...(unit ? { unit } : {}) }];
  });
}

function parseCompanyProfile(value: unknown): StockCompanyProfile | undefined {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const status = normalizeDataAvailability(record.status);
  const symbol = typeof record.symbol === 'string' && record.symbol.trim() ? record.symbol.trim() : undefined;
  const market = record.market === 'KR' || record.market === 'US' ? record.market : undefined;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined;
  const sector = typeof record.sector === 'string' && record.sector.trim() ? record.sector.trim() : undefined;
  const industry =
    typeof record.industry === 'string' && record.industry.trim() ? record.industry.trim() : undefined;
  const summaryText =
    typeof record.summaryText === 'string' && record.summaryText.trim()
      ? record.summaryText.trim()
      : undefined;
  const sources = parseSourceUrls(record.sources);
  const capturedAt = isoFromUnknown(record.capturedAt);

  if (!symbol && !name && !summaryText && sources.length === 0) return undefined;

  return {
    status,
    ...(symbol ? { symbol } : {}),
    ...(market ? { market } : {}),
    ...(name ? { name } : {}),
    ...(sector ? { sector } : {}),
    ...(industry ? { industry } : {}),
    ...(summaryText ? { summaryText } : {}),
    sources,
    ...(capturedAt ? { capturedAt } : {}),
  };
}

function parseCompanyMetrics(value: unknown): StockCompanyMetricGroup[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const metricGroup =
      typeof record.metricGroup === 'string' && record.metricGroup.trim()
        ? record.metricGroup.trim()
        : '';
    if (!metricGroup) return [];

    const metrics = parseMetricItems(record.metrics);
    if (metrics.length === 0) return [];

    const availability = normalizeDataAvailability(record.availability);
    const sources = parseSourceUrls(record.sources);
    const currency = record.currency === 'KRW' || record.currency === 'USD' ? record.currency : undefined;
    if (availability === 'available' && (!currency || sources.length === 0)) return [];

    const fiscalYearNumber = toFiniteNumber(
      typeof record.fiscalYear === 'number' || typeof record.fiscalYear === 'string'
        ? record.fiscalYear
        : null,
    );
    const fiscalYear =
      fiscalYearNumber !== undefined && Number.isInteger(fiscalYearNumber)
        ? fiscalYearNumber
        : undefined;
    const fiscalPeriod =
      typeof record.fiscalPeriod === 'string' && record.fiscalPeriod.trim()
        ? record.fiscalPeriod.trim()
        : undefined;
    const reportedAt = isoFromUnknown(record.reportedAt);

    return [
      {
        metricGroup,
        ...(fiscalYear === undefined ? {} : { fiscalYear }),
        ...(fiscalPeriod ? { fiscalPeriod } : {}),
        ...(currency ? { currency } : {}),
        availability,
        ...(reportedAt ? { reportedAt } : {}),
        sources,
        metrics,
      },
    ];
  });
}

function parseRelatedNews(value: unknown): DashboardInsight[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null;
    const title =
      typeof record.title === 'string' && record.title.trim() ? record.title.trim() : null;
    const context =
      typeof record.context === 'string' && record.context.trim() ? record.context.trim() : title;
    if (!id || !title || !context) return [];
    const impact = record.impact === '높음' || record.impact === '낮음' ? record.impact : '중간';
    const icon =
      record.icon === 'bolt' ||
      record.icon === 'cpu' ||
      record.icon === 'triangle-alert' ||
      record.icon === 'newspaper'
        ? record.icon
        : 'newspaper';
    return [{ id, title, context, impact, icon }];
  });
}

function mapStockDetailDatabaseRow(row: StockDatabaseRow): StockDetail | null {
  const stock = mapStockDatabaseRow(row);
  if (!stock) return null;

  const latestPrice = toFiniteNumber(row.latest_price);
  const changePct = toFiniteNumber(row.change_pct);
  const capturedAt = toIsoString(row.snapshot_captured_at ?? null);
  const currency = latestPrice === undefined ? undefined : row.currency === 'USD' ? 'USD' : 'KRW';
  const reportMarkdown = row.deep_report?.trim();
  const researchedAt = toIsoString(row.last_analyzed_at);
  const learningCards = parseLearningCards(row.learning_cards);
  const glossaryTerms = parseGlossaryTerms(row.glossary_terms);
  const companyProfile = parseCompanyProfile(row.company_profile);
  const companyMetrics = parseCompanyMetrics(row.company_metrics);
  const analysisJob = mapStockAnalysisJob(row);

  return {
    stock,
    ...(latestPrice === undefined || !currency || !capturedAt
      ? {}
      : {
          latestSnapshot: {
            price: latestPrice,
            currency,
            ...(changePct === undefined ? {} : { changePct }),
            capturedAt,
          },
        }),
    deepReport: {
      status: reportMarkdown ? 'available' : 'missing',
      ...(reportMarkdown ? { reportMarkdown } : {}),
      ...(researchedAt ? { researchedAt } : {}),
      sources: parseSourceUrls(row.deep_report_sources, row.source_urls),
    },
    relatedNews: parseRelatedNews(row.related_news),
    risks: parseDelimitedText(row.risks_text),
    checkpoints: parseDelimitedText(row.checkpoints_text),
    ...(companyProfile ? { companyProfile } : {}),
    ...(companyMetrics.length > 0 ? { companyMetrics } : {}),
    ...(learningCards.length > 0 ? { learningCards } : {}),
    ...(glossaryTerms.length > 0 ? { glossaryTerms } : {}),
    ...(analysisJob ? { analysisJob } : {}),
  };
}

export type StockReadModel = {
  listStocks: (query: StockListQuery) => StockListItem[] | Promise<StockListItem[]>;
  getStockDetail: (entityKey: string) => StockDetail | null | Promise<StockDetail | null>;
};

export function createFallbackStockReadModel(): StockReadModel {
  return {
    listStocks() {
      return [];
    },
    getStockDetail() {
      return null;
    },
  };
}

export function createPostgresStockReadModel(executor: StockRowQueryExecutor): StockReadModel {
  return {
    async listStocks(query) {
      const rows = await executor(STOCK_LIST_SQL, [
        query.market ?? null,
        query.scope ?? 'all',
        query.q ? `%${query.q}%` : null,
      ]);

      return rows.flatMap((row) => {
        const item = mapStockDatabaseRow(row);
        return item ? [item] : [];
      });
    },
    async getStockDetail(entityKey) {
      const [row] = await executor(STOCK_DETAIL_SQL, [entityKey]);
      return row ? mapStockDetailDatabaseRow(row) : null;
    },
  };
}

export type GetStockListOptions = {
  now?: Date;
  query?: StockListQuery;
  readModel?: StockReadModel;
};

export async function getStockList(options: GetStockListOptions = {}): Promise<StockListResponse> {
  const readModel = options.readModel ?? createFallbackStockReadModel();
  const query = stockListQuerySchema.parse(options.query ?? {});
  const generatedAt = (options.now ?? new Date()).toISOString();
  let data: StockListItem[];
  try {
    data = await readModel.listStocks(query);
  } catch {
    return stockListResponseSchema.parse({
      data: [],
      availability: 'error',
      error: {
        code: 'STOCK_LIST_READ_FAILED',
        message: '종목 목록 데이터를 읽는 중 오류가 발생했습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt,
      },
    });
  }
  const hasRows = data.length > 0;
  const meta: ResponseMeta = {
    source: hasRows ? 'database' : 'fallback',
    generatedAt,
  };

  return stockListResponseSchema.parse({
    data,
    availability: hasRows ? 'available' : 'collecting',
    error: null,
    meta,
  });
}

export type GetStockDetailOptions = {
  now?: Date;
  readModel?: StockReadModel;
};

export async function getStockDetail(
  entityKey: string,
  options: GetStockDetailOptions = {},
): Promise<StockDetailResponse> {
  const readModel = options.readModel ?? createFallbackStockReadModel();
  const generatedAt = (options.now ?? new Date()).toISOString();
  let data: StockDetail | null;
  try {
    data = await readModel.getStockDetail(entityKey);
  } catch {
    return stockDetailResponseSchema.parse({
      data: null,
      availability: 'error',
      error: {
        code: 'STOCK_DETAIL_READ_FAILED',
        message: '종목 상세 데이터를 읽는 중 오류가 발생했습니다.',
        detail: entityKey,
      },
      meta: {
        source: 'fallback',
        generatedAt,
      },
    });
  }
  const meta: ResponseMeta = {
    source: data ? 'database' : 'fallback',
    generatedAt,
  };

  return stockDetailResponseSchema.parse({
    data,
    availability: data ? 'available' : 'missing',
    error: data
      ? null
      : {
          code: 'STOCK_NOT_FOUND',
          message: '아직 수집된 종목 상세 데이터가 없습니다.',
          detail: entityKey,
        },
    meta,
  });
}
