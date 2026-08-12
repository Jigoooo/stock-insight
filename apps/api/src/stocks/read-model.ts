import {
  actionSafeText,
  containsActionAdvice,
  filterActionSafeTexts,
} from '../shared/action-advice.ts';
import type { UserScope } from '../shared/user-scope.ts';

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
WITH universe AS (
  SELECT entity_key, market, ticker, name
  FROM serving.security_universe_v1
), ohlcv_prices AS (
  SELECT market, ticker, latest_price, currency, change_pct
  FROM serving.latest_price_v1
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
  FROM serving.market_snapshots_clean_v1
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
    AND user_id = $4::uuid
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
    AND user_id = $4::uuid
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
  universe.entity_key,
  universe.ticker,
  universe.market,
  universe.name,
  coalesce(ohlcv.latest_price, snapshot.latest_price) AS latest_price,
  coalesce(ohlcv.currency, snapshot.currency) AS currency,
  coalesce(ohlcv.change_pct, snapshot.change_pct) AS change_pct,
  candidate.primary_thesis,
  candidate.confidence,
  coalesce(watchlist.is_watched, false) AS is_watched,
  coalesce(position.is_holding, false) AS is_holding,
  deep.deep_report_length,
  deep.researched_at AS last_analyzed_at
FROM universe
LEFT JOIN latest_candidates candidate
  ON candidate.market = universe.market
 AND candidate.ticker = universe.ticker
LEFT JOIN ohlcv_prices ohlcv
  ON ohlcv.market = universe.market
 AND ohlcv.ticker = universe.ticker
LEFT JOIN latest_snapshots snapshot
  ON snapshot.market = universe.market
 AND snapshot.ticker = universe.ticker
LEFT JOIN active_watchlist watchlist
  ON watchlist.entity_key = universe.entity_key
LEFT JOIN open_positions position
  ON position.entity_key = universe.entity_key
LEFT JOIN deep_reports deep
  ON deep.market = universe.market
 AND deep.ticker = universe.ticker
WHERE ($1::text IS NULL OR universe.market = $1::text)
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
    OR universe.ticker ILIKE $3::text
    OR universe.name ILIKE $3::text
    OR candidate.primary_thesis ILIKE $3::text
  )
ORDER BY
  coalesce(watchlist.is_watched, false) DESC,
  coalesce(position.is_holding, false) DESC,
  candidate.created_sort DESC NULLS LAST,
  universe.name ASC
LIMIT 300
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
    FROM serving.market_snapshots_clean_v1
    WHERE symbol IS NOT NULL
  ) snapshot
  JOIN parsed_entity entity
    ON entity.market = snapshot.market
   AND entity.ticker = snapshot.ticker
  ORDER BY snapshot.market, snapshot.ticker, snapshot.collected_sort DESC, snapshot.id DESC
), ohlcv_price AS (
  SELECT price.market, price.ticker, price.latest_price, price.currency, price.change_pct,
         price.price_as_of
  FROM serving.latest_price_v1 price
  JOIN parsed_entity entity
    ON entity.market = price.market
   AND entity.ticker = price.ticker
  LIMIT 1
), active_watchlist AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    true AS is_watched
  FROM public.user_watchlist
  WHERE active IS TRUE
    AND removed_at IS NULL
    AND user_id = $2::uuid
    AND entity_key = (SELECT entity_key FROM parsed_entity)
  ORDER BY entity_key, added_at DESC, id DESC
), open_positions AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    true AS is_holding
  FROM public.user_positions
  WHERE closed_at IS NULL
    AND status = 'open'
    AND user_id = $2::uuid
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
), user_feed AS MATERIALIZED (
  SELECT *
  FROM public.v_user_feed_dedup
  WHERE user_id = $2::uuid
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
    FROM user_feed
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
  coalesce(ohlcv.latest_price, snapshot.latest_price) AS latest_price,
  coalesce(ohlcv.currency, snapshot.currency) AS currency,
  coalesce(ohlcv.change_pct, snapshot.change_pct) AS change_pct,
  coalesce(ohlcv.price_as_of::text, snapshot.snapshot_captured_at) AS snapshot_captured_at,
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
LEFT JOIN ohlcv_price ohlcv
  ON ohlcv.market = candidate.market
 AND ohlcv.ticker = candidate.ticker
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
    const unit =
      typeof record.unit === 'string' && record.unit.trim() ? record.unit.trim() : undefined;
    return [{ key, label, value: valueNumber, ...(unit ? { unit } : {}) }];
  });
}

function parseCompanyProfile(value: unknown): StockCompanyProfile | undefined {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const status = normalizeDataAvailability(record.status);
  const symbol =
    typeof record.symbol === 'string' && record.symbol.trim() ? record.symbol.trim() : undefined;
  const market = record.market === 'KR' || record.market === 'US' ? record.market : undefined;
  const name =
    typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined;
  const sector =
    typeof record.sector === 'string' && record.sector.trim() ? record.sector.trim() : undefined;
  const industry =
    typeof record.industry === 'string' && record.industry.trim()
      ? record.industry.trim()
      : undefined;
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
    const currency =
      record.currency === 'KRW' || record.currency === 'USD' ? record.currency : undefined;
    if (availability === 'available' && (!currency || sources.length === 0)) return [];

    const fiscalYearNumber = toFiniteNumber(
      typeof record.fiscalYear === 'number' || typeof record.fiscalYear === 'string'
        ? record.fiscalYear
        : null,
    );
    const fiscalYear =
      fiscalYearNumber !== undefined &&
      Number.isInteger(fiscalYearNumber) &&
      fiscalYearNumber > 1900
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

function sanitizeStockListItem(item: StockListItem): StockListItem {
  const { primaryThesis, ...rest } = item;
  const safeThesis = actionSafeText(primaryThesis);
  return safeThesis ? { ...rest, primaryThesis: safeThesis } : rest;
}

function sanitizeGlossaryTerm(term: EntityGlossaryTerm): EntityGlossaryTerm | null {
  return containsActionAdvice(term.term, term.definition) ? null : term;
}

/**
 * 출처·등기 설명은 **사업 설명이 아니다.**
 *
 * 화면은 `summaryText` 를 "무엇을 하는 회사인가" 자리에 그린다 — 정본 01 §3 항목 1이고
 * REQ-PROD-003(처음 보는 종목을 5분 안에 파악)의 첫 질문이다. 그런데 라이브 348건이
 * 무엇을 담고 있는지 재보니(2026-08-12) **한 건도 그 질문에 답하지 않는다**:
 *
 *   126건  "MICRON TECHNOLOGY INC SEC EDGAR 기업 프로필 (CIK 0000723125)"
 *   222건  "현대오토에버(주) 기업 개황 (대표 류석문, 업종코드 582)"
 *
 * 앞의 126건은 **CIK 라는 원시 출처 식별자까지 노출**해 UX 헌법 7번으로 릴리스가
 * 막힌다. 뒤의 222건은 대표 이름과 업종코드를 나열한 등기부 요약이라, 그 회사가
 * 무엇을 파는지는 한 글자도 없다.
 *
 * 번역하거나 생성해서 채우지 않는다 — 정본 06 §9 가 "LLM 이 빈 데이터 필드를
 * 서술로 보충" 하는 것을 NO-GO 로 지목한다. 대신 이 자리에서 **부재로 이름 붙인다.**
 * 화면에는 이미 그 문구가 있다("한 줄 설명이 아직 연결되지 않았습니다").
 *
 * 출처 설명 자체를 버리는 것이 아니다 — 계보는 `sourceRefs` 가 진다. 버리는 것은
 * 그것을 **사업 설명으로 읽히게 두는 일**뿐이다.
 */
const provenanceBlurbPattern = /(SEC EDGAR|CIK\s*[0-9]|기업 프로필|기업 개황|업종코드|corpCode)/i;

function businessSummaryOrNull(value: string | undefined): string | null {
  const safe = actionSafeText(value);
  if (!safe) return null;
  return provenanceBlurbPattern.test(safe) ? null : safe;
}

function sanitizeCompanyProfile(
  profile: StockCompanyProfile | undefined,
): StockCompanyProfile | undefined {
  if (!profile) return undefined;
  const safeSummary = businessSummaryOrNull(profile.summaryText);
  const sanitized = { ...profile };
  if (safeSummary) {
    sanitized.summaryText = safeSummary;
  } else {
    delete sanitized.summaryText;
  }
  return sanitized;
}

/**
 * 파이프라인이 실패한 자리를 카드 본문으로 옮겨 적은 문자열.
 *
 * `public.stock_learning_cards` 라이브 8행 실측(2026-08-11)에서 셋이 여기 걸린다:
 * US:FIG · US:TSLA 는 본문 전문이 `API call failed after 3 retries: [Errno 32]
 * Broken pipe` 이고, US:BMNR 은 제목이 `… (종합 단계 실패 — 원본 제공)` 이다.
 * 260자 상한 아래라 잘리지도 않아 화면에는 설명문과 똑같은 자리·똑같은 서체로
 * 앉는다 — UX 헌법 6번이 금지하는 "오류를 다른 상태로 위장" 이다.
 */
const CARD_PIPELINE_FAILURE_PATTERN =
  /(?:API call failed|Traceback \(most recent call last\)|\[Errno\s*\d+\]|Broken pipe|ECONNRESET|ETIMEDOUT|after\s+\d+\s+retries|(?:종합|생성|수집|검증)\s*단계\s*실패|원본\s*제공)/iu;

/**
 * 카드가 종목이 아니라 **자기 실행에 대해** 말하는 1인칭 발화.
 *
 * 같은 8행에서 둘이 여기 걸린다: US:NVDA `주인님, 검증 결과를 충실히 반영해 최종
 * 보고서를 작성했습니다. … 🌍`, US:PLTR `충분합니다. 보고서 작성합니다.`
 * KR:005380 은 `… 지어내지 않겠습니다` 로 걸린다 — 정직한 고백이지만 종목 설명이
 * 아니라 수집 과정에 대한 진술이고, 내부 도구 이름과 그 크레딧 상태까지 함께
 * 데리고 나온다.
 *
 * 고쳐 쓰지 않고 **떨어뜨린다.** 문장을 다듬으면 기록을 위조하는 것이 되고,
 * 화면에는 "실을 수 있는 것이 남지 않았습니다" 라는 이름 붙은 부재가 남는다.
 */
const CARD_ASSISTANT_VOICE_PATTERN =
  /(?:주인님|보고서(?:를)?\s*(?:작성|정리)(?:합니다|했습니다|하겠습니다)|지어내지\s*않겠습니다)/iu;

/**
 * 카드가 종목을 **설명**하는 대신 그 종목에 대한 **입장**을 싣는 결론 문장.
 *
 * 2026-08-11 라이브 8행에서 위 두 게이트를 통과한 둘이 여기 걸린다.
 *
 *   KR:005930 `… "조건부 보유 논리" 가 있는 종목입니다 … 관망형 보유 판단이 …`
 *   KR:452450 `… 고변동 소형 장비주" 로 보는 게 맞습니다 … 보유 판단은 …`
 *
 * 둘 다 260자 상한 아래라 잘리지 않고 전문이 렌더되며, 섹션 헤더가 "판단이
 * 아니라 설명이며" 를 그린 바로 아래 문단에 앉는다. CLAUDE.md 의 제품 경계는
 * 목표주가만이 아니라 **입장 표명 자체**를 금지한다.
 *
 * ## 왜 `containsActionAdvice` 를 넓히지 않는가
 *
 * 그 함수는 뉴스 제목·맥락·리스크·thesis 등 네 개 뉴스 읽기 모델이 공유한다.
 * 거기서의 오탐은 정당한 보도를 조용히 떨어뜨리고, 2026-08-03 회귀가 정확히 그
 * 대가였다. 뉴스 헤드라인과 장문 생성 산문은 기준이 다르다 — 그래서 이 패턴은
 * 학습 카드 전용으로 여기 남는다.
 *
 * ## 왜 이 세 형태뿐인가
 *
 * `보유` 를 낱말만으로 막지 않는다. `보유 종목`(포트폴리오에 든 종목),
 * `지분 보유`, `현금 보유` 는 서술적 용법이고 통과해야 한다. 그래서 **뒤에 오는
 * 머리명사**가 판단어인 형태(`보유 논리` · `보유 판단`)만 막는다.
 *
 * `반영했고` 는 넣지 않았다. `원가 상승을 판가에 반영했고` 처럼 사업 서술로 쓰는
 * 흔한 조각이라 낱말만으로는 오탐이 된다. 두 살아남은 카드는 아래 세 형태로
 * 이미 각각 두 번씩 걸리므로 필요하지도 않다.
 *
 * `결론:` 도 넣지 않았다. 담화 표지일 뿐이고 `결론: 이 회사는 반도체 장비를
 * 만듭니다` 는 막을 이유가 없다.
 */
const CARD_INVESTMENT_STANCE_PATTERN =
  /(?:(?:보유|매수|매도|투자|접근)\s*(?:논리|판단|스탠스)|로\s*보는\s*게\s*맞(?:습니다|다)|(?:관망|비중)\s*형?\s*(?:보유|접근))/iu;

function isUnusableCardText(value: string | undefined): boolean {
  const text = value?.trim();
  if (!text) return false;
  return (
    CARD_PIPELINE_FAILURE_PATTERN.test(text) ||
    CARD_ASSISTANT_VOICE_PATTERN.test(text) ||
    CARD_INVESTMENT_STANCE_PATTERN.test(text)
  );
}

function sanitizeLearningCard(card: StockLearningCard): StockLearningCard | null {
  if (containsActionAdvice(card.title)) return null;
  // 제목이나 본문 중 하나라도 파이프라인 사고를 옮겨 적은 것이면 카드 전체를
  // 뺀다. 본문만 지우고 제목을 남기면 실패가 "아직 내용이 없는 카드" 로
  // 위장되고, 그것이 정확히 이 게이트가 막는 것이다.
  if (isUnusableCardText(card.title) || isUnusableCardText(card.bodyMarkdown)) return null;

  const safeBodyMarkdown = actionSafeText(card.bodyMarkdown);
  const sanitized = {
    ...card,
    bullets: filterActionSafeTexts(card.bullets).filter((bullet) => !isUnusableCardText(bullet)),
  };
  if (safeBodyMarkdown) {
    sanitized.bodyMarkdown = safeBodyMarkdown;
  } else {
    delete sanitized.bodyMarkdown;
  }
  // 제목만 남은 카드는 아무것도 말하지 않는다. 빈 카드를 그리면 화면이 채워진
  // 것처럼 보이지만 읽을 것은 없다.
  if (!sanitized.bodyMarkdown && sanitized.bullets.length === 0) return null;
  return sanitized;
}

function sanitizeAnalysisJob(job: StockAnalysisJob | undefined): StockAnalysisJob | undefined {
  if (!job) return undefined;
  const safeErrorMessage = actionSafeText(job.errorMessage);
  const sanitized = { ...job };
  if (safeErrorMessage) {
    sanitized.errorMessage = safeErrorMessage;
  } else {
    delete sanitized.errorMessage;
  }
  return sanitized;
}

function sanitizeStockDetail(detail: StockDetail): StockDetail {
  const safeReportMarkdown = actionSafeText(detail.deepReport.reportMarkdown);
  // 출처 **라벨**도 게이트를 지나야 한다. 라벨은 기사 제목이라
  // `Netflix … Should You Buy the Dip?` 같은 문장이 그대로 들어오고, 화면에서는
  // 링크 텍스트로 렌더된다. 본문을 통째로 버리는 갈래조차 sources 는 그대로
  // 통과시키고 있었으므로, **본문이 걸린 종목일수록** 라벨이 그대로 남았다.
  // URL 은 건드리지 않는다 — 원문으로 가는 길까지 끊을 이유가 없다.
  const sources = detail.deepReport.sources.filter((source) => !containsActionAdvice(source.label));
  const deepReport = safeReportMarkdown
    ? { ...detail.deepReport, reportMarkdown: safeReportMarkdown, sources }
    : { status: 'missing' as const, sources };

  const learningCards = detail.learningCards
    ?.map(sanitizeLearningCard)
    .filter((item) => item !== null);
  const glossaryTerms = detail.glossaryTerms
    ?.map(sanitizeGlossaryTerm)
    .filter((item) => item !== null);
  const companyProfile = sanitizeCompanyProfile(detail.companyProfile);
  const analysisJob = sanitizeAnalysisJob(detail.analysisJob);

  const sanitized: StockDetail = {
    ...detail,
    stock: sanitizeStockListItem(detail.stock),
    deepReport,
    relatedNews: detail.relatedNews.filter(
      (item) => !containsActionAdvice(item.title, item.context),
    ),
    risks: filterActionSafeTexts(detail.risks),
    checkpoints: filterActionSafeTexts(detail.checkpoints),
  };

  if (companyProfile) {
    sanitized.companyProfile = companyProfile;
  } else {
    delete sanitized.companyProfile;
  }

  if (detail.learningCards !== undefined) {
    sanitized.learningCards = learningCards ?? [];
  } else {
    delete sanitized.learningCards;
  }

  if (detail.glossaryTerms !== undefined) {
    sanitized.glossaryTerms = glossaryTerms ?? [];
  } else {
    delete sanitized.glossaryTerms;
  }

  if (analysisJob) {
    sanitized.analysisJob = analysisJob;
  } else {
    delete sanitized.analysisJob;
  }

  return sanitized;
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

export function createPostgresStockReadModel(
  executor: StockRowQueryExecutor,
  userScope: UserScope,
): StockReadModel {
  return {
    async listStocks(query) {
      const rows = await executor(STOCK_LIST_SQL, [
        query.market ?? null,
        query.scope ?? 'all',
        query.q ? `%${query.q}%` : null,
        userScope.userId,
      ]);

      return rows.flatMap((row) => {
        const item = mapStockDatabaseRow(row);
        return item ? [sanitizeStockListItem(item)] : [];
      });
    },
    async getStockDetail(entityKey) {
      const [row] = await executor(STOCK_DETAIL_SQL, [entityKey, userScope.userId]);
      if (!row) return null;
      const detail = mapStockDetailDatabaseRow(row);
      return detail ? sanitizeStockDetail(detail) : null;
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
    data = (await readModel.listStocks(query)).map(sanitizeStockListItem);
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
    const rawDetail = await readModel.getStockDetail(entityKey);
    data = rawDetail ? sanitizeStockDetail(rawDetail) : null;
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
