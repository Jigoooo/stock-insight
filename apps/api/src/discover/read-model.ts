import {
  discoverStocksQuerySchema,
  discoverStocksResponseSchema,
  type DiscoverReasonType,
  type DiscoverStockItem,
  type DiscoverStocksQuery,
  type DiscoverStocksResponse,
  type ResponseMeta,
  type SourceLink,
  type StockIdentity,
  type StockAnalysisStatus,
} from '@stock-insight/contracts';

export type DiscoverStocksDatabaseRow = {
  entity_key?: string | null;
  ticker?: string | null;
  market?: string | null;
  name?: string | null;
  category?: string | null;
  reason_type?: string | null;
  reason_summary?: string | null;
  confidence?: string | null;
  risks_text?: string | null;
  checkpoints_text?: string | null;
  source_urls?: unknown;
  deep_report_length?: string | number | null;
  last_analyzed_at?: string | Date | null;
  related_to_my_stocks?: unknown;
};

export type DiscoverStocksRowQueryExecutor = (
  sql: string,
  params: readonly unknown[],
) => DiscoverStocksDatabaseRow[] | Promise<DiscoverStocksDatabaseRow[]>;

export type DiscoverStocksReadModel = {
  listDiscoverStocks: (
    query: DiscoverStocksQuery,
  ) => DiscoverStockItem[] | Promise<DiscoverStockItem[]>;
};

const DISCOVER_STOCKS_SQL = `
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
    category,
    thesis,
    confidence,
    risks,
    check_indicators,
    source_urls,
    score_eligible,
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
    category,
    thesis AS reason_summary,
    confidence,
    risks AS risks_text,
    check_indicators AS checkpoints_text,
    source_urls,
    score_eligible,
    created_sort,
    id
  FROM normalized_candidates
  WHERE market IN ('KR', 'US')
  ORDER BY market, ticker, created_sort DESC, id DESC
), active_watchlist AS (
  SELECT DISTINCT ON (entity_key)
    entity_key
  FROM public.user_watchlist
  WHERE active IS TRUE
    AND removed_at IS NULL
    AND entity_key IS NOT NULL
    AND split_part(entity_key, ':', 1) IN ('KR', 'US')
  ORDER BY entity_key, added_at DESC, id DESC
), related_entities AS (
  SELECT
    reach.to_key AS entity_key,
    min(CASE reach.relevance_kind
      WHEN 'direct' THEN 1
      WHEN 'related' THEN 2
      WHEN 'indirect' THEN 3
      ELSE 4
    END) AS relation_rank,
    max(reach.relevance_score) AS relation_score,
    jsonb_agg(DISTINCT jsonb_build_object(
      'entity_key', reach.watched_entity_key,
      'ticker', split_part(reach.watched_entity_key, ':', 2),
      'market', split_part(reach.watched_entity_key, ':', 1),
      'name', coalesce(watched_candidate.name, split_part(reach.watched_entity_key, ':', 2))
    )) FILTER (WHERE reach.watched_entity_key IS NOT NULL) AS related_to_my_stocks
  FROM public.entity_reach_cache reach
  JOIN active_watchlist watchlist
    ON watchlist.entity_key = reach.watched_entity_key
  LEFT JOIN latest_candidates watched_candidate
    ON watched_candidate.entity_key = reach.watched_entity_key
  WHERE split_part(reach.watched_entity_key, ':', 1) IN ('KR', 'US')
    AND split_part(reach.to_key, ':', 1) IN ('KR', 'US')
  GROUP BY reach.to_key
), deep_reports AS (
  SELECT DISTINCT ON (market, ticker)
    market,
    ticker,
    deep_report_length,
    researched_at
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
      length(coalesce(report, '')) AS deep_report_length,
      researched_at
    FROM watchlist.deep_cache
    WHERE ticker IS NOT NULL
  ) deep
  WHERE market IN ('KR', 'US')
  ORDER BY market, ticker, researched_at DESC
)
SELECT
  candidate.entity_key,
  candidate.ticker,
  candidate.market,
  candidate.name,
  candidate.category,
  CASE
    WHEN related.related_to_my_stocks IS NOT NULL AND related.relation_rank = 1 THEN 'direct'
    WHEN related.related_to_my_stocks IS NOT NULL AND related.relation_rank = 3 THEN 'indirect'
    WHEN related.related_to_my_stocks IS NOT NULL THEN 'related'
    ELSE 'market_candidate'
  END AS reason_type,
  candidate.reason_summary,
  candidate.confidence,
  candidate.risks_text,
  candidate.checkpoints_text,
  candidate.source_urls,
  deep.deep_report_length,
  deep.researched_at AS last_analyzed_at,
  related.related_to_my_stocks
FROM latest_candidates candidate
LEFT JOIN related_entities related
  ON related.entity_key = candidate.entity_key
LEFT JOIN deep_reports deep
  ON deep.market = candidate.market
 AND deep.ticker = candidate.ticker
WHERE ($1::text IS NULL OR candidate.market = $1::text)
  AND (
    $2::text = 'all'
    OR ($2::text = 'watchlist_related' AND related.related_to_my_stocks IS NOT NULL)
    OR ($2::text = 'market_momentum' AND (coalesce(candidate.score_eligible, 0) = 1 OR candidate.category = 'watchlist'))
    OR ($2::text = 'new_candidate' AND candidate.category = 'buy_interest')
  )
ORDER BY
  related.relation_score DESC NULLS LAST,
  coalesce(candidate.score_eligible, 0) DESC,
  candidate.created_sort DESC,
  candidate.name ASC
LIMIT 100
`;

function text(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
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

function parseDelimitedText(value: unknown): string[] {
  return (text(value) ?? '')
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

function parseSourceUrls(value: unknown): SourceLink[] {
  const parsed = parseJsonValue(value);
  const candidates = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'string'
      ? parsed.split(/[;\n,]+/)
      : [];
  const sources: SourceLink[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const url = toSourceUrl(candidate);
    if (!url || seen.has(url)) continue;
    try {
      const source = { label: toSourceLabel(candidate, url), url };
      new URL(source.url);
      sources.push(source);
      seen.add(source.url);
    } catch {
      // Ignore malformed legacy source text.
    }
  }

  return sources;
}

function normalizeApiMarket(value: unknown): 'KR' | 'US' | null {
  const normalized = text(value)?.toUpperCase();
  if (normalized === 'KR' || normalized === 'US') return normalized;
  return null;
}

function identityMarket(value: 'KR' | 'US'): StockIdentity['market'] {
  return value === 'KR' ? 'KRX' : 'NASDAQ';
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' | undefined {
  const normalized = text(value)?.toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized;
  return undefined;
}

function normalizeReasonType(value: unknown): DiscoverReasonType {
  const normalized = text(value);
  if (
    normalized === 'direct' ||
    normalized === 'related' ||
    normalized === 'indirect' ||
    normalized === 'market_candidate'
  ) {
    return normalized;
  }
  return 'market_candidate';
}

function reasonTitle(reasonType: DiscoverReasonType): string {
  switch (reasonType) {
    case 'direct':
      return '관심종목 직접 후보';
    case 'related':
      return '관심종목 관련 후보';
    case 'indirect':
      return '관심종목 간접 후보';
    case 'market_candidate':
      return '시장 모멘텀 후보';
  }
}

function toIsoString(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseRelatedStocks(value: unknown): StockIdentity[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const market = normalizeApiMarket(record.market ?? text(record.entity_key)?.split(':')[0]);
    const entityKey = text(record.entity_key);
    const ticker = text(record.ticker) ?? entityKey?.split(':')[1];
    const name = text(record.name) ?? ticker;
    if (!market || !entityKey || !ticker || !name || seen.has(entityKey)) return [];
    seen.add(entityKey);
    return [{ entityKey, ticker, name, market: identityMarket(market) }];
  });
}

function analysisStatus(row: DiscoverStocksDatabaseRow): StockAnalysisStatus {
  const deepReportLength = finiteNumber(row.deep_report_length) ?? 0;
  const lastAnalyzedAt = toIsoString(row.last_analyzed_at);
  return lastAnalyzedAt || deepReportLength > 0 ? 'cached' : 'none';
}

function mapDiscoverStocksDatabaseRow(row: DiscoverStocksDatabaseRow): DiscoverStockItem | null {
  const market = normalizeApiMarket(row.market);
  const ticker = text(row.ticker);
  const name = text(row.name);
  if (!market || !ticker || !name) return null;

  const entityKey = text(row.entity_key) ?? `${market}:${ticker}`;
  const reasonType = normalizeReasonType(row.reason_type);
  const summary = text(row.reason_summary) ?? `${name} 후보`;
  const confidence = normalizeConfidence(row.confidence);
  const sources = parseSourceUrls(row.source_urls);
  const relatedToMyStocks = parseRelatedStocks(row.related_to_my_stocks);
  const status = analysisStatus(row);

  return {
    entityKey,
    ticker,
    market,
    name,
    reasonType,
    reasonTitle: reasonTitle(reasonType),
    reasonSummary: summary,
    ...(confidence ? { confidence } : {}),
    ...(relatedToMyStocks.length ? { relatedToMyStocks } : {}),
    topRisks: parseDelimitedText(row.risks_text),
    checkpoints: parseDelimitedText(row.checkpoints_text),
    sourceCount: sources.length,
    sources,
    canStartAnalysis: status !== 'cached',
    analysisStatus: status,
  };
}

export function createFallbackDiscoverStocksReadModel(): DiscoverStocksReadModel {
  return {
    listDiscoverStocks() {
      return [];
    },
  };
}

export function createPostgresDiscoverStocksReadModel(
  executor: DiscoverStocksRowQueryExecutor,
): DiscoverStocksReadModel {
  return {
    async listDiscoverStocks(query) {
      const parsed = discoverStocksQuerySchema.parse(query);
      const rows = await executor(DISCOVER_STOCKS_SQL, [
        parsed.market ?? null,
        parsed.reason ?? 'all',
      ]);
      return rows.map(mapDiscoverStocksDatabaseRow).filter((item) => item !== null);
    },
  };
}

export type GetDiscoverStocksOptions = {
  now?: Date;
  query?: DiscoverStocksQuery;
  readModel?: DiscoverStocksReadModel;
};

export async function getDiscoverStocks(
  options: GetDiscoverStocksOptions = {},
): Promise<DiscoverStocksResponse> {
  const readModel = options.readModel ?? createFallbackDiscoverStocksReadModel();
  const query = discoverStocksQuerySchema.parse(options.query ?? {});
  const generatedAt = (options.now ?? new Date()).toISOString();

  let data: DiscoverStockItem[];
  try {
    data = await readModel.listDiscoverStocks({ ...query, reason: query.reason ?? 'all' });
  } catch {
    return discoverStocksResponseSchema.parse({
      data: [],
      availability: 'error',
      error: {
        code: 'DISCOVER_STOCKS_READ_FAILED',
        message: '주목 종목 데이터를 읽는 중 오류가 발생했습니다.',
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

  return discoverStocksResponseSchema.parse({
    data,
    availability: hasRows ? 'available' : 'collecting',
    error: null,
    meta,
  });
}
