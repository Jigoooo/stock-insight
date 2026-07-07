import {
  marketNewsQuerySchema,
  marketNewsResponseSchema,
  type MarketNewsItem,
  type MarketNewsQuery,
  type MarketNewsResponse,
  type ResponseMeta,
  type StockIdentity,
} from '@stock-insight/contracts';

export type MarketNewsDatabaseRow = {
  record_id?: string | number | bigint | null;
  market?: string | null;
  record_entity_key?: string | null;
  ticker?: string | null;
  title?: string | null;
  summary_text?: string | null;
  record_type?: string | null;
  primary_kind?: string | null;
  relevance_score?: string | number | null;
  published_at?: string | Date | null;
  effective_date?: string | Date | null;
};

export type MarketNewsRowQueryExecutor = (
  sql: string,
  params: readonly unknown[],
) => MarketNewsDatabaseRow[] | Promise<MarketNewsDatabaseRow[]>;

export type MarketNewsReadModel = {
  listMarketNews: (query: MarketNewsQuery) => MarketNewsItem[] | Promise<MarketNewsItem[]>;
};

const MARKET_NEWS_SQL = `
WITH stock_feed AS (
  SELECT
    record_id,
    CASE
      WHEN split_part(coalesce(record_entity_key, ''), ':', 1) = 'KR' THEN 'KR'
      WHEN split_part(coalesce(record_entity_key, ''), ':', 1) = 'US' THEN 'US'
      ELSE 'GLOBAL'
    END AS market,
    record_entity_key,
    ticker,
    title,
    summary_text,
    record_type,
    primary_kind,
    relevance_score,
    published_at,
    effective_date
  FROM public.v_user_feed_dedup
  WHERE domain = 'stock'
)
SELECT
  record_id,
  market,
  record_entity_key,
  ticker,
  title,
  summary_text,
  record_type,
  primary_kind,
  relevance_score,
  published_at,
  effective_date
FROM stock_feed
WHERE ($1::text IS NULL OR market = $1::text)
  AND (
    $2::text = 'all'
    OR record_type = $2::text
    OR primary_kind = $2::text
    OR ($2::text = 'news' AND record_type IN ('news', 'article', 'publication', 'candidate'))
    OR ($2::text = 'briefing' AND record_type IN ('briefing', 'candidate'))
  )
ORDER BY
  coalesce(published_at, effective_date) DESC NULLS LAST,
  relevance_score DESC NULLS LAST,
  record_id DESC
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

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDate(value: unknown): string | undefined {
  const raw = value instanceof Date ? value.toISOString() : text(value);
  if (!raw) return undefined;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function market(value: unknown): 'KR' | 'US' | 'GLOBAL' {
  const normalized = text(value)?.toUpperCase();
  if (normalized === 'KR' || normalized === 'US' || normalized === 'GLOBAL') return normalized;
  return 'GLOBAL';
}

function polarity(value: unknown): 'positive' | 'negative' | 'neutral' {
  const body = `${text(value) ?? ''}`.toLowerCase();
  if (/\b(bearish|negative)\b/.test(body)) return 'negative';
  if (/\b(bullish|positive)\b/.test(body)) return 'positive';
  return 'neutral';
}

function identityMarket(value: 'KR' | 'US' | 'GLOBAL'): StockIdentity['market'] {
  if (value === 'KR') return 'KRX';
  if (value === 'US') return 'NASDAQ';
  return 'UNKNOWN';
}

function buildAffectedEntity(row: MarketNewsDatabaseRow, normalizedMarket: 'KR' | 'US' | 'GLOBAL') {
  const entityKey = text(row.record_entity_key);
  const ticker = text(row.ticker) ?? entityKey?.split(':')[1];
  const name = text(row.title) ?? ticker;
  if (!entityKey || !ticker || !name) return [];
  return [
    {
      entityKey,
      ticker,
      name,
      market: identityMarket(normalizedMarket),
    },
  ];
}

function mapMarketNewsDatabaseRow(row: MarketNewsDatabaseRow): MarketNewsItem | null {
  const recordId = text(row.record_id);
  const title = text(row.title) ?? text(row.record_entity_key) ?? text(row.ticker);
  if (!recordId || !title) return null;

  const normalizedMarket = market(row.market);
  const summary = text(row.summary_text);
  const signalType = text(row.record_type) ?? text(row.primary_kind);
  const magnitude = numberValue(row.relevance_score);
  const publishedAt = isoDate(row.published_at) ?? isoDate(row.effective_date);

  return {
    id: `feed:${recordId}`,
    market: normalizedMarket,
    title,
    ...(summary ? { summary } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    affectedEntities: buildAffectedEntity(row, normalizedMarket),
    ...(signalType ? { signalType } : {}),
    polarity: polarity(`${title} ${summary ?? ''}`),
    ...(magnitude !== undefined ? { magnitude } : {}),
  };
}

export function createFallbackMarketNewsReadModel(): MarketNewsReadModel {
  return {
    listMarketNews() {
      return [];
    },
  };
}

export function createPostgresMarketNewsReadModel(
  executor: MarketNewsRowQueryExecutor,
): MarketNewsReadModel {
  return {
    async listMarketNews(query) {
      const parsed = marketNewsQuerySchema.parse(query);
      const rows = await executor(MARKET_NEWS_SQL, [parsed.market ?? null, parsed.type ?? 'all']);
      return rows.map(mapMarketNewsDatabaseRow).filter((item) => item !== null);
    },
  };
}

export type GetMarketNewsOptions = {
  now?: Date;
  query?: MarketNewsQuery;
  readModel?: MarketNewsReadModel;
};

export async function getMarketNews(
  options: GetMarketNewsOptions = {},
): Promise<MarketNewsResponse> {
  const readModel = options.readModel ?? createFallbackMarketNewsReadModel();
  const query = marketNewsQuerySchema.parse(options.query ?? {});
  const generatedAt = (options.now ?? new Date()).toISOString();

  let data: MarketNewsItem[];
  try {
    data = await readModel.listMarketNews({ ...query, type: query.type ?? 'all' });
  } catch {
    return marketNewsResponseSchema.parse({
      data: [],
      availability: 'error',
      error: {
        code: 'MARKET_NEWS_READ_FAILED',
        message: '시장 뉴스 데이터를 읽는 중 오류가 발생했습니다.',
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

  return marketNewsResponseSchema.parse({
    data,
    availability: hasRows ? 'available' : 'collecting',
    error: null,
    meta,
  });
}
