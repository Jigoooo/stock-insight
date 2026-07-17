import {
  actionSafeText,
  containsActionAdvice,
  filterActionSafeTexts,
} from '../shared/action-advice.ts';
import { isProjectionFresh } from '../shared/projection-freshness.ts';
import type { UserScope } from '../shared/user-scope.ts';

import {
  dashboardBootstrapSchema,
  dashboardResponseSchema,
  type DashboardBootstrap,
  type DashboardInsight,
  type DashboardPortfolio,
  type DashboardResponse,
  type DashboardStock,
  type DashboardTheme,
  type ResponseMeta,
} from '@stock-insight/contracts';

export type DashboardDatabaseRow = {
  projection_updated_at?: string | Date | null;
  watchlist_count?: string | number | null;
  position_count?: string | number | null;
  related_issue_count?: string | number | null;
  cached_report_count?: string | number | null;
  average_change_pct?: string | number | null;
  top_theme_label?: string | null;
  bars?: unknown;
  trend?: unknown;
  theme_share?: unknown;
  themes?: unknown;
  insights?: unknown;
  stocks?: unknown;
};

export type DashboardRowQueryExecutor = (
  sql: string,
  params: readonly unknown[],
) => DashboardDatabaseRow[] | Promise<DashboardDatabaseRow[]>;

export type DashboardReadSnapshot = {
  data: DashboardBootstrap;
  latestAt?: string;
};

export type DashboardReadModel = {
  loadDashboardBootstrap: () =>
    | DashboardBootstrap
    | DashboardReadSnapshot
    | Promise<DashboardBootstrap | DashboardReadSnapshot>;
};

const emptyDashboardBootstrap: DashboardBootstrap = {
  portfolio: {
    value: '수집 전',
    dailyChange: '아직 연결된 데이터가 없습니다',
    relatedIssueCount: 0,
    focusTheme: '수집 전',
    scheduleCount: 0,
    cautionLevel: '낮음',
    bars: [],
    trend: [],
    themeShare: [],
  },
  insights: [],
  stocks: [],
  themes: [],
};

const DASHBOARD_SQL = `
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
    nullif(category, '') AS category,
    thesis,
    confidence,
    risks,
    check_indicators,
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
    thesis AS primary_thesis,
    confidence,
    risks AS risks_text,
    check_indicators AS checkpoints_text,
    score_eligible,
    created_sort,
    id
  FROM normalized_candidates
  WHERE market IN ('KR', 'US')
  ORDER BY market, ticker, created_sort DESC, id DESC
), latest_snapshots AS (
  SELECT DISTINCT ON (market, ticker)
    market,
    ticker,
    latest_price,
    currency,
    change_pct,
    collected_sort,
    id
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
  WHERE market IN ('KR', 'US')
  ORDER BY market, ticker, collected_sort DESC, id DESC
), active_watchlist AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    true AS is_watched
  FROM public.user_watchlist
  WHERE active IS TRUE
    AND removed_at IS NULL
    AND user_id = $1::uuid
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
    AND user_id = $1::uuid
    AND entity_key IS NOT NULL
    AND split_part(entity_key, ':', 1) IN ('KR', 'US')
  ORDER BY entity_key, opened_at DESC, id DESC
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
), ranked_stocks AS (
  SELECT
    candidate.entity_key,
    candidate.ticker,
    candidate.market,
    candidate.name,
    candidate.category,
    snapshot.latest_price,
    snapshot.currency,
    snapshot.change_pct,
    candidate.primary_thesis,
    candidate.confidence,
    coalesce(watchlist.is_watched, false) AS is_watched,
    coalesce(position.is_holding, false) AS is_holding,
    deep.deep_report_length,
    deep.researched_at AS last_analyzed_at,
    candidate.risks_text,
    candidate.checkpoints_text,
    candidate.created_sort,
    candidate.score_eligible
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
  ORDER BY
    coalesce(watchlist.is_watched, false) DESC,
    coalesce(position.is_holding, false) DESC,
    coalesce(candidate.score_eligible, 0) DESC,
    candidate.created_sort DESC,
    candidate.name ASC
  LIMIT 8
), stock_payload AS (
  SELECT coalesce(jsonb_agg(to_jsonb(ranked_stocks) ORDER BY is_watched DESC, is_holding DESC, created_sort DESC, name ASC), '[]'::jsonb) AS stocks
  FROM ranked_stocks
), feed_rows AS (
  SELECT
    record_id,
    title,
    summary_text,
    relevance_score,
    primary_kind,
    record_type,
    coalesce(published_at, effective_date) AS published_sort
  FROM public.v_user_feed_dedup
  WHERE domain = 'stock'
    AND coalesce(title, '') <> ''
    AND (
      split_part(coalesce(record_entity_key, ''), ':', 1) IN ('KR', 'US')
      OR split_part(coalesce(record_entity_key, ''), ':', 1) = 'MACRO'
    )
  ORDER BY coalesce(published_at, effective_date) DESC NULLS LAST, relevance_score DESC NULLS LAST, record_id DESC
  LIMIT 5
), insight_payload AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', concat('feed:', record_id::text),
    'title', coalesce(nullif(title, ''), '시장 뉴스'),
    'context', coalesce(nullif(summary_text, ''), nullif(primary_kind, ''), nullif(record_type, ''), '주식 도메인 뉴스'),
    'impact', CASE
      WHEN coalesce(relevance_score, 0) >= 0.7 THEN '높음'
      WHEN coalesce(relevance_score, 0) >= 0.3 THEN '중간'
      ELSE '낮음'
    END,
    'icon', CASE
      WHEN coalesce(primary_kind, record_type, '') ILIKE '%risk%' THEN 'triangle-alert'
      WHEN coalesce(primary_kind, record_type, title, '') ILIKE '%semiconductor%' THEN 'cpu'
      WHEN coalesce(primary_kind, record_type, title, '') ILIKE '%power%' THEN 'bolt'
      ELSE 'newspaper'
    END
  ) ORDER BY published_sort DESC NULLS LAST, relevance_score DESC NULLS LAST), '[]'::jsonb) AS insights
  FROM feed_rows
), theme_counts AS (
  SELECT
    coalesce(nullif(category, ''), '미분류') AS label,
    count(*)::int AS item_count,
    max(nullif(primary_thesis, '')) AS description
  FROM latest_candidates
  GROUP BY coalesce(nullif(category, ''), '미분류')
  ORDER BY count(*) DESC, coalesce(nullif(category, ''), '미분류') ASC
  LIMIT 4
), theme_total AS (
  SELECT greatest(sum(item_count), 1)::numeric AS total_count
  FROM theme_counts
), theme_payload AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', regexp_replace(lower(label), '[^a-z0-9가-힣]+', '-', 'g'),
    'title', label,
    'description', coalesce(nullif(description, ''), concat(label, ' 후보군')),
    'strength', greatest(1, least(100, round(item_count::numeric / theme_total.total_count * 100)))::int
  ) ORDER BY item_count DESC, label ASC), '[]'::jsonb) AS themes
  FROM theme_counts
  CROSS JOIN theme_total
), theme_share_payload AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', regexp_replace(lower(label), '[^a-z0-9가-힣]+', '-', 'g'),
    'label', label,
    'value', greatest(1, least(100, round(item_count::numeric / theme_total.total_count * 100)))::int
  ) ORDER BY item_count DESC, label ASC), '[]'::jsonb) AS theme_share
  FROM theme_counts
  CROSS JOIN theme_total
), trend_rows AS (
  SELECT
    snapshot_date::date AS day,
    avg(change_pct) AS average_change_pct
  FROM stock.market_snapshots
  WHERE symbol IS NOT NULL
    AND upper(region) IN ('KR', 'US', 'KRX', 'KOSPI', 'KOSDAQ', 'NASDAQ', 'NYSE', 'AMEX')
    AND snapshot_date IS NOT NULL
    AND snapshot_date <> ''
    AND change_pct IS NOT NULL
  GROUP BY snapshot_date::date
  ORDER BY snapshot_date::date DESC
  LIMIT 8
), trend_payload AS (
  SELECT
    coalesce(jsonb_agg(greatest(0, least(100, round(50 + average_change_pct * 5)))::int ORDER BY day ASC), '[]'::jsonb) AS bars,
    coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(day, 'MM-DD'),
      'value', greatest(0, least(100, round(50 + average_change_pct * 5)))::int
    ) ORDER BY day ASC), '[]'::jsonb) AS trend
  FROM trend_rows
), summary AS (
  SELECT
    (SELECT count(*) FROM active_watchlist)::int AS watchlist_count,
    (SELECT count(*) FROM open_positions)::int AS position_count,
    (SELECT count(*) FROM feed_rows)::int AS related_issue_count,
    (SELECT count(*) FROM deep_reports WHERE deep_report_length > 0)::int AS cached_report_count,
    (SELECT avg(snapshot.change_pct)
     FROM latest_snapshots snapshot
     JOIN active_watchlist watchlist ON watchlist.entity_key = concat(snapshot.market, ':', snapshot.ticker)
     WHERE snapshot.change_pct IS NOT NULL) AS average_change_pct,
    (SELECT label FROM theme_counts ORDER BY item_count DESC, label ASC LIMIT 1) AS top_theme_label
), projection_freshness AS (
  SELECT max(source_at) AS projection_updated_at
  FROM (
    SELECT nullif(created_sort, '')::timestamptz AS source_at FROM latest_candidates
    UNION ALL
    SELECT nullif(collected_sort, '')::timestamptz AS source_at FROM latest_snapshots
    UNION ALL
    SELECT nullif(researched_at, '')::timestamptz AS source_at FROM deep_reports
  ) source_times
)
SELECT
  projection_freshness.projection_updated_at,
  summary.watchlist_count,
  summary.position_count,
  summary.related_issue_count,
  summary.cached_report_count,
  summary.average_change_pct,
  summary.top_theme_label,
  trend_payload.bars,
  trend_payload.trend,
  theme_share_payload.theme_share,
  theme_payload.themes,
  insight_payload.insights,
  stock_payload.stocks
FROM summary
CROSS JOIN projection_freshness
CROSS JOIN trend_payload
CROSS JOIN theme_share_payload
CROSS JOIN theme_payload
CROSS JOIN insight_payload
CROSS JOIN stock_payload
`;

function text(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return undefined;
}

function isoDate(value: unknown): string | undefined {
  const raw = value instanceof Date ? value.toISOString() : text(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function integer(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed === undefined ? 0 : Math.max(0, Math.trunc(parsed));
}

function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string')
    return ['1', 't', 'true', 'y', 'yes'].includes(value.toLowerCase());
  return false;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseRecordArray(value: unknown): Record<string, unknown>[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
}

function parseNumberArray(value: unknown): number[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    const parsedNumber = finiteNumber(item);
    return parsedNumber === undefined ? [] : [Math.max(0, Math.min(100, Math.round(parsedNumber)))];
  });
}

function parseDelimitedText(value: unknown): string[] {
  return (text(value) ?? '')
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function slug(value: unknown): string {
  const raw = text(value) ?? 'item';
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

function formatSignedPercent(value: unknown): string | undefined {
  const parsed = finiteNumber(value);
  if (parsed === undefined) return undefined;
  const rounded = Math.round(parsed * 100) / 100;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toLocaleString('ko-KR', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatPrice(priceValue: unknown, currencyValue: unknown): string | undefined {
  const price = finiteNumber(priceValue);
  if (price === undefined) return undefined;
  const currency = text(currencyValue)?.toUpperCase() === 'USD' ? 'USD' : 'KRW';
  const rounded = Math.round(price * 100) / 100;
  const formatted = rounded.toLocaleString('ko-KR', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${formatted}` : `₩${formatted}`;
}

function categoryLabel(value: unknown): string {
  return text(value)?.replace(/_/g, ' ') ?? '테마 수집중';
}

function normalizeImpact(value: unknown): DashboardInsight['impact'] {
  const raw = text(value);
  if (raw === '높음' || raw === '중간' || raw === '낮음') return raw;
  return '낮음';
}

function normalizeIcon(value: unknown): DashboardInsight['icon'] {
  const raw = text(value);
  if (raw === 'bolt' || raw === 'cpu' || raw === 'newspaper' || raw === 'triangle-alert')
    return raw;
  return 'newspaper';
}

function normalizeColorRole(index: number): DashboardPortfolio['themeShare'][number]['colorRole'] {
  return (['semiconductor', 'infrastructure', 'platform', 'reserve'] as const)[index] ?? 'reserve';
}

function normalizeStrength(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed === undefined) return 1;
  return Math.max(1, Math.min(100, Math.round(parsed)));
}

function mapStock(record: Record<string, unknown>): DashboardStock | null {
  const ticker = text(record.ticker);
  const name = text(record.name);
  if (!ticker || !name) return null;

  const entityKey = text(record.entity_key) ?? `${text(record.market) ?? 'stock'}:${ticker}`;
  const price = formatPrice(record.latest_price, record.currency) ?? '가격 수집중';
  const change = formatSignedPercent(record.change_pct) ?? '변동률 수집중';
  const thesis = actionSafeText(text(record.primary_thesis)) ?? '원천 DB에서 요약 수집중입니다.';
  const checkpoints = filterActionSafeTexts(parseDelimitedText(record.checkpoints_text));
  const risks = filterActionSafeTexts(parseDelimitedText(record.risks_text));
  const theme = categoryLabel(record.category);
  const holding = bool(record.is_holding);
  const watched = bool(record.is_watched);

  return {
    id: slug(entityKey),
    holding,
    ticker,
    name,
    logo: ticker.slice(0, 3).toUpperCase(),
    theme,
    price,
    change,
    stance: holding ? '보유 점검' : watched ? '관심 점검' : '관찰 후보',
    summary: thesis,
    founded: '수집중',
    hq: '수집중',
    capital: '수집중',
    shares: '수집중',
    marketCap: '수집중',
    sales: '수집중',
    operatingProfit: '수집중',
    debtRatio: '수집중',
    roe: '수집중',
    segments: text(record.category) ? [[theme, 100]] : [],
    shareholders: [],
    history: [],
    positives: checkpoints,
    risks,
    review: [
      text(record.last_analyzed_at) ?? '수집중',
      finiteNumber(record.deep_report_length) && Number(record.deep_report_length) > 0
        ? '심층 리포트 캐시 있음'
        : '실데이터 연결',
      '조회 전용 DB adapter 결과',
    ],
  };
}

function mapInsight(record: Record<string, unknown>): DashboardInsight | null {
  const id = text(record.id);
  const title = text(record.title);
  const context = text(record.context);
  if (!id || !title || !context) return null;
  if (containsActionAdvice(title, context)) return null;
  return {
    id,
    title,
    context,
    impact: normalizeImpact(record.impact),
    icon: normalizeIcon(record.icon),
  };
}

function mapTheme(record: Record<string, unknown>): DashboardTheme | null {
  const title = text(record.title) ?? text(record.label);
  if (!title || containsActionAdvice(title, record.description)) return null;
  return {
    id: slug(text(record.id) ?? title),
    title,
    description: actionSafeText(text(record.description)) ?? `${title} 후보군`,
    strength: normalizeStrength(record.strength ?? record.value),
  };
}

function mapTrend(value: unknown): DashboardPortfolio['trend'][number] | null {
  const record = asRecord(value);
  if (!record) return null;
  const label = text(record.label);
  const trendValue = finiteNumber(record.value);
  if (!label || trendValue === undefined) return null;
  return { label, value: Math.max(0, Math.min(100, Math.round(trendValue))) };
}

function mapThemeShare(
  value: unknown,
  index: number,
): DashboardPortfolio['themeShare'][number] | null {
  const record = asRecord(value);
  if (!record) return null;
  const label = text(record.label) ?? text(record.title);
  if (!label) return null;
  return {
    id: slug(text(record.id) ?? label),
    label,
    value: normalizeStrength(record.value ?? record.strength),
    colorRole: normalizeColorRole(index),
  };
}

function mapDashboardDatabaseRow(row: DashboardDatabaseRow | undefined): DashboardBootstrap {
  if (!row) return emptyDashboardBootstrap;

  const stocks = parseRecordArray(row.stocks)
    .map(mapStock)
    .filter((item) => item !== null);
  const insights = parseRecordArray(row.insights)
    .map(mapInsight)
    .filter((item) => item !== null);
  const themes = parseRecordArray(row.themes)
    .map(mapTheme)
    .filter((item) => item !== null);
  const bars = parseNumberArray(row.bars);
  const trend = parseRecordArray(row.trend)
    .map(mapTrend)
    .filter((item) => item !== null);
  const themeShare = parseRecordArray(row.theme_share)
    .map(mapThemeShare)
    .filter((item) => item !== null);

  const watchlistCount = integer(row.watchlist_count);
  const positionCount = integer(row.position_count);
  const relatedIssueCount = integer(row.related_issue_count);
  const cachedReportCount = integer(row.cached_report_count);
  const averageChange = finiteNumber(row.average_change_pct);
  const dailyChange =
    averageChange === undefined
      ? '가격 수집중'
      : `${formatSignedPercent(averageChange)} · 관심종목 평균`;
  const negativeBars = bars.filter((value) => value < 45).length;

  return dashboardBootstrapSchema.parse({
    portfolio: {
      value:
        positionCount > 0 ? `보유종목 ${positionCount}개` : `보유 0 · 관심 ${watchlistCount}개`,
      dailyChange,
      relatedIssueCount,
      focusTheme: text(row.top_theme_label) ?? '테마 수집중',
      scheduleCount: cachedReportCount,
      cautionLevel:
        negativeBars >= 3
          ? '높음'
          : averageChange !== undefined && averageChange < 0
            ? '중간'
            : '낮음',
      bars,
      trend,
      themeShare,
    },
    insights,
    stocks,
    themes,
  });
}

export function createFallbackDashboardReadModel(): DashboardReadModel {
  return {
    loadDashboardBootstrap() {
      return emptyDashboardBootstrap;
    },
  };
}

export function createPostgresDashboardReadModel(
  executor: DashboardRowQueryExecutor,
  userScope: UserScope,
): DashboardReadModel {
  return {
    async loadDashboardBootstrap() {
      const [row] = await executor(DASHBOARD_SQL, [userScope.userId]);
      const latestAt = isoDate(row?.projection_updated_at);
      return {
        data: mapDashboardDatabaseRow(row),
        ...(latestAt ? { latestAt } : {}),
      };
    },
  };
}

export type GetDashboardBootstrapOptions = {
  now?: Date;
  readModel?: DashboardReadModel;
};

export async function getDashboardBootstrap(
  options: GetDashboardBootstrapOptions = {},
): Promise<DashboardResponse> {
  const readModel = options.readModel ?? createFallbackDashboardReadModel();
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  let data: DashboardBootstrap;
  let latestAt: string | undefined;
  try {
    const loaded = await readModel.loadDashboardBootstrap();
    if ('data' in loaded) {
      data = loaded.data;
      latestAt = loaded.latestAt;
    } else {
      data = loaded;
    }
  } catch {
    return dashboardResponseSchema.parse({
      data: emptyDashboardBootstrap,
      availability: 'error',
      error: {
        code: 'DASHBOARD_READ_FAILED',
        message: '대시보드 데이터를 읽는 중 오류가 발생했습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt,
      },
    });
  }
  const hasRows = data.stocks.length > 0;
  const availability = !hasRows
    ? 'collecting'
    : isProjectionFresh(latestAt, now)
      ? 'available'
      : 'stale';
  const meta: ResponseMeta = {
    source: hasRows ? 'database' : 'fallback',
    generatedAt,
  };

  return dashboardResponseSchema.parse({
    data,
    availability,
    error: null,
    meta,
  });
}
