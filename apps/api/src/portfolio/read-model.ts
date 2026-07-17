import { containsActionAdvice } from '../shared/action-advice.ts';
import type { UserScope } from '../shared/user-scope.ts';

import {
  portfolioDigestResponseSchema,
  portfolioDigestSchema,
  type PortfolioAlertReason,
  type PortfolioAlertSeverity,
  type PortfolioDigest,
  type PortfolioDigestAlert,
  type PortfolioDigestResponse,
  type PortfolioExposure,
  type PortfolioExposureKind,
  type PortfolioFreshnessItem,
  type PortfolioRiskLevel,
  type ResponseMeta,
} from '@stock-insight/contracts';

export type PortfolioDigestDatabaseRow = {
  alerts?: unknown;
  exposures?: unknown;
  freshness?: unknown;
  watchlist_count?: string | number | null;
  position_count?: string | number | null;
  alert_count?: string | number | null;
  change_event_count?: string | number | null;
  freshness_risk_count?: string | number | null;
  non_stock_filtered_count?: string | number | null;
};

export type PortfolioDigestRowQueryExecutor = (
  sql: string,
  params: readonly unknown[],
) => PortfolioDigestDatabaseRow[] | Promise<PortfolioDigestDatabaseRow[]>;

export type PortfolioDigestReadModel = {
  loadPortfolioDigest: () => PortfolioDigest | Promise<PortfolioDigest>;
};

const emptyPortfolioDigest: PortfolioDigest = {
  alerts: [],
  exposures: [],
  freshness: [],
  stats: {
    watchlistCount: 0,
    positionCount: 0,
    alertCount: 0,
    changeEventCount: 0,
    freshnessRiskCount: 0,
    nonStockFilteredCount: 0,
  },
};

const PORTFOLIO_DIGEST_SQL = `
WITH active_watchlist AS (
  SELECT DISTINCT ON (entity_key)
    entity_key,
    split_part(entity_key, ':', 1) AS market,
    ticker,
    display_name
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
    split_part(entity_key, ':', 1) AS market,
    split_part(entity_key, ':', 2) AS ticker,
    split_part(entity_key, ':', 2) AS display_name
  FROM public.user_positions
  WHERE closed_at IS NULL
    AND status = 'open'
    AND user_id = $1::uuid
    AND entity_key IS NOT NULL
    AND split_part(entity_key, ':', 1) IN ('KR', 'US')
  ORDER BY entity_key, opened_at DESC, id DESC
), portfolio_entities AS (
  SELECT entity_key, market, ticker, display_name, false AS is_position FROM active_watchlist
  UNION
  SELECT entity_key, market, ticker, display_name, true AS is_position FROM open_positions
), portfolio_entity_ids AS (
  SELECT entity.id, portfolio.entity_key, portfolio.market
  FROM portfolio_entities portfolio
  JOIN public.entities entity ON entity.entity_key = portfolio.entity_key
), stock_change_events AS (
  SELECT
    concat('change:', event_key) AS id,
    coalesce(nullif(title, ''), concat(coalesce(ticker, entity_key), ' 변화 감지')) AS title,
    concat(
      coalesce(nullif(event_type, ''), 'change'),
      CASE WHEN delta_pct IS NOT NULL THEN concat(' · ', round(delta_pct::numeric, 2)::text, '%') ELSE '' END
    ) AS summary,
    CASE
      WHEN severity = 'high' OR abs(coalesce(delta_pct, 0)) >= 5 THEN 'high'
      WHEN severity = 'medium' OR abs(coalesce(delta_pct, 0)) >= 2 THEN 'medium'
      ELSE 'low'
    END AS severity,
    'change_event' AS reason,
    entity_key,
    split_part(entity_key, ':', 1) AS market,
    created_at
  FROM public.change_events
  WHERE domain = 'stock'
    AND resolved_at IS NULL
    AND split_part(coalesce(entity_key, ''), ':', 1) IN ('KR', 'US')
  ORDER BY created_at DESC, abs(coalesce(delta_pct, 0)) DESC NULLS LAST
  LIMIT 8
), feed_alerts AS (
  SELECT
    concat('feed:', record_id::text) AS id,
    coalesce(nullif(title, ''), '관심종목 변화 후보') AS title,
    coalesce(nullif(summary_text, ''), nullif(top_reason, ''), concat('개인화 피드 ', coalesce(primary_kind, 'change'))) AS summary,
    CASE
      WHEN coalesce(relevance_score, 0) >= 0.8 THEN 'high'
      WHEN coalesce(relevance_score, 0) >= 0.3 THEN 'medium'
      ELSE 'low'
    END AS severity,
    'feed_change' AS reason,
    CASE
      WHEN split_part(coalesce(record_entity_key, ''), ':', 1) IN ('KR', 'US') THEN record_entity_key
      WHEN array_length(watched_entities, 1) > 0 THEN watched_entities[1]
      ELSE NULL
    END AS entity_key,
    CASE
      WHEN split_part(coalesce(record_entity_key, ''), ':', 1) IN ('KR', 'US') THEN split_part(record_entity_key, ':', 1)
      WHEN array_length(watched_entities, 1) > 0 THEN split_part(watched_entities[1], ':', 1)
      ELSE NULL
    END AS market,
    coalesce(published_at, effective_date) AS created_at
  FROM public.v_user_feed_dedup
  WHERE domain = 'stock'
    AND coalesce(title, '') <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(watched_entities, ARRAY[]::text[])) AS watched(entity_key)
      WHERE split_part(coalesce(watched.entity_key, ''), ':', 1) NOT IN ('KR', 'US')
    )
  ORDER BY coalesce(published_at, effective_date) DESC NULLS LAST,
    relevance_score DESC NULLS LAST,
    record_id DESC
  LIMIT 8
), alert_rows AS (
  SELECT * FROM stock_change_events
  UNION ALL
  SELECT * FROM feed_alerts
  WHERE NOT EXISTS (SELECT 1 FROM stock_change_events)
), selected_alerts AS (
  SELECT *
  FROM alert_rows
  WHERE market IN ('KR', 'US')
  ORDER BY created_at DESC NULLS LAST,
    CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
    id DESC
  LIMIT 8
), alert_payload AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'summary', summary,
    'severity', severity,
    'reason', reason,
    'entityKey', entity_key,
    'market', market,
    'createdAt', to_jsonb(created_at)
  ) ORDER BY created_at DESC NULLS LAST), '[]'::jsonb) AS alerts
  FROM selected_alerts
), market_exposure AS (
  SELECT
    concat('market-', lower(market)) AS id,
    market AS label,
    'market' AS kind,
    count(*)::int AS item_count,
    concat(market, ' 관심·보유 종목 ', count(*)::int, '개') AS summary
  FROM portfolio_entities
  GROUP BY market
), graph_exposure AS (
  SELECT
    lower(target.entity_type || '-' || regexp_replace(target.entity_key, '[^a-zA-Z0-9가-힣]+', '-', 'g')) AS id,
    coalesce(nullif(target.name, ''), target.entity_key) AS label,
    CASE
      WHEN target.entity_type = 'theme' THEN 'theme'
      WHEN target.entity_type = 'macro' THEN 'macro'
      ELSE 'industry'
    END AS kind,
    count(DISTINCT source.entity_key)::int AS item_count,
    concat('그래프 경로로 ', count(DISTINCT source.entity_key)::int, '개 종목이 연결') AS summary
  FROM portfolio_entity_ids source
  JOIN public.v_graph_adjacency adjacency ON adjacency.from_id = source.id
  JOIN public.entities target ON target.id = adjacency.to_id
  WHERE target.entity_type IN ('theme', 'macro', 'stage')
    AND target.entity_key <> source.entity_key
  GROUP BY target.entity_type, target.entity_key, target.name
  ORDER BY count(DISTINCT source.entity_key) DESC, max(adjacency.weight) DESC NULLS LAST
  LIMIT 5
), exposure_rows AS (
  SELECT * FROM market_exposure
  UNION ALL
  SELECT * FROM graph_exposure
), exposure_total AS (
  SELECT greatest(coalesce(sum(item_count), 0), 1)::numeric AS total_count
  FROM exposure_rows
), exposure_payload AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'label', label,
    'kind', kind,
    'value', round(item_count::numeric / exposure_total.total_count * 100, 2),
    'itemCount', item_count,
    'riskLevel', CASE
      WHEN item_count::numeric / exposure_total.total_count >= 0.45 THEN 'high'
      WHEN item_count::numeric / exposure_total.total_count >= 0.25 THEN 'medium'
      ELSE 'low'
    END,
    'summary', summary
  ) ORDER BY item_count DESC, label ASC), '[]'::jsonb) AS exposures
  FROM exposure_rows
  CROSS JOIN exposure_total
), freshness_rows AS (
  SELECT
    'feed' AS id,
    '개인화 피드' AS label,
    max(coalesce(published_at, effective_date)) AS latest_at
  FROM public.v_user_feed_dedup
  WHERE domain = 'stock'
  UNION ALL
  SELECT
    'source_documents' AS id,
    '원천 문서' AS label,
    max(coalesce(published_at, collected_at, created_at)) AS latest_at
  FROM public.source_documents
  WHERE split_part(coalesce(entity_key, ''), ':', 1) IN ('KR', 'US', 'MACRO', 'THEME')
     OR entity_key IS NULL
  UNION ALL
  SELECT
    'change_events' AS id,
    '변화 이벤트' AS label,
    max(created_at) AS latest_at
  FROM public.change_events
  WHERE domain = 'stock'
    AND split_part(coalesce(entity_key, ''), ':', 1) IN ('KR', 'US')
), freshness_scored AS (
  SELECT
    id,
    label,
    latest_at,
    CASE WHEN latest_at IS NULL THEN NULL ELSE greatest(0, extract(epoch FROM (now() - latest_at)) / 3600) END AS age_hours
  FROM freshness_rows
), freshness_payload AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'label', label,
    'status', CASE
      WHEN latest_at IS NULL THEN 'collecting'
      WHEN age_hours <= 72 THEN 'available'
      ELSE 'stale'
    END,
    'latestAt', to_jsonb(latest_at),
    'ageHours', CASE WHEN age_hours IS NULL THEN NULL ELSE round(age_hours::numeric, 1) END,
    'summary', CASE
      WHEN latest_at IS NULL THEN '아직 수집 기록이 없습니다.'
      WHEN age_hours <= 72 THEN concat('최근 ', round(age_hours::numeric, 1)::text, '시간 내 갱신')
      ELSE concat('마지막 갱신 ', round(age_hours::numeric, 1)::text, '시간 경과')
    END
  ) ORDER BY id ASC), '[]'::jsonb) AS freshness,
  count(*) FILTER (WHERE latest_at IS NULL OR age_hours > 72)::int AS freshness_risk_count
  FROM freshness_scored
), stats AS (
  SELECT
    (SELECT count(*) FROM active_watchlist)::int AS watchlist_count,
    (SELECT count(*) FROM open_positions)::int AS position_count,
    (SELECT count(*) FROM selected_alerts)::int AS alert_count,
    (SELECT count(*) FROM stock_change_events)::int AS change_event_count,
    coalesce((SELECT freshness_risk_count FROM freshness_payload), 0)::int AS freshness_risk_count,
    0::int AS non_stock_filtered_count
)
SELECT
  alert_payload.alerts,
  exposure_payload.exposures,
  freshness_payload.freshness,
  stats.watchlist_count,
  stats.position_count,
  stats.alert_count,
  stats.change_event_count,
  stats.freshness_risk_count,
  stats.non_stock_filtered_count
FROM alert_payload
CROSS JOIN exposure_payload
CROSS JOIN freshness_payload
CROSS JOIN stats
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

function integer(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed === undefined ? 0 : Math.max(0, Math.trunc(parsed));
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

function isoDate(value: unknown): string | undefined {
  const raw = value instanceof Date ? value.toISOString() : text(value);
  if (!raw) return undefined;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function severity(value: unknown): PortfolioAlertSeverity {
  const raw = text(value);
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'low';
}

function reason(value: unknown): PortfolioAlertReason {
  const raw = text(value);
  if (
    raw === 'change_event' ||
    raw === 'feed_change' ||
    raw === 'freshness' ||
    raw === 'exposure'
  ) {
    return raw;
  }
  return 'feed_change';
}

function market(value: unknown): 'KR' | 'US' | undefined {
  const raw = text(value)?.toUpperCase();
  if (raw === 'KR' || raw === 'US') return raw;
  return undefined;
}

function exposureKind(value: unknown): PortfolioExposureKind {
  const raw = text(value);
  if (raw === 'market' || raw === 'theme' || raw === 'macro' || raw === 'industry') return raw;
  return 'industry';
}

function riskLevel(value: unknown): PortfolioRiskLevel {
  const raw = text(value);
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'low';
}

function availability(value: unknown): PortfolioFreshnessItem['status'] {
  const raw = text(value);
  if (
    raw === 'available' ||
    raw === 'missing' ||
    raw === 'collecting' ||
    raw === 'stale' ||
    raw === 'text_only' ||
    raw === 'error'
  ) {
    return raw;
  }
  return 'collecting';
}

function mapAlert(record: Record<string, unknown>): PortfolioDigestAlert | null {
  const id = text(record.id);
  const title = text(record.title);
  const summary = text(record.summary);
  if (!id || !title || !summary) return null;
  if (containsActionAdvice(title, summary)) return null;

  const normalizedMarket = market(record.market);
  const entityKey = text(record.entityKey ?? record.entity_key);
  const createdAt = isoDate(record.createdAt ?? record.created_at);

  return {
    id,
    title,
    summary,
    severity: severity(record.severity),
    reason: reason(record.reason),
    ...(entityKey ? { entityKey } : {}),
    ...(normalizedMarket ? { market: normalizedMarket } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

function normalizeExposureValues(exposures: PortfolioExposure[]): PortfolioExposure[] {
  if (exposures.length === 0) return exposures;

  const total = exposures.reduce((sum, item) => sum + item.value, 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const normalized = exposures.map((item) => ({
    ...item,
    value: Math.max(0, Math.min(100, Math.round((item.value / total) * 100))),
  }));
  const roundedTotal = normalized.reduce((sum, item) => sum + item.value, 0);
  const delta = 100 - roundedTotal;
  if (delta !== 0 && normalized[0]) {
    normalized[0] = {
      ...normalized[0],
      value: Math.max(0, Math.min(100, normalized[0].value + delta)),
    };
  }
  return normalized;
}

function mapExposure(record: Record<string, unknown>): PortfolioExposure | null {
  const id = text(record.id);
  const label = text(record.label);
  const summary = text(record.summary);
  const value = finiteNumber(record.value);
  if (!id || !label || !summary || value === undefined) return null;

  return {
    id,
    label,
    kind: exposureKind(record.kind),
    value: Math.max(0, Math.min(100, value)),
    itemCount: integer(record.itemCount ?? record.item_count),
    riskLevel: riskLevel(record.riskLevel ?? record.risk_level),
    summary,
  };
}

function mapFreshness(record: Record<string, unknown>): PortfolioFreshnessItem | null {
  const id = text(record.id);
  const label = text(record.label);
  const summary = text(record.summary);
  if (!id || !label || !summary) return null;

  const latestAt = isoDate(record.latestAt ?? record.latest_at);
  const ageHours = finiteNumber(record.ageHours ?? record.age_hours);
  return {
    id,
    label,
    status: availability(record.status),
    ...(latestAt ? { latestAt } : {}),
    ...(ageHours !== undefined ? { ageHours: Math.max(0, Math.round(ageHours * 10) / 10) } : {}),
    summary,
  };
}

function sanitizePortfolioDigest(digest: PortfolioDigest): PortfolioDigest {
  const alerts = digest.alerts.filter((item) => !containsActionAdvice(item.title, item.summary));
  return portfolioDigestSchema.parse({
    ...digest,
    alerts,
    stats: {
      ...digest.stats,
      alertCount: alerts.length,
    },
  });
}

function mapPortfolioDigestDatabaseRow(
  row: PortfolioDigestDatabaseRow | undefined,
): PortfolioDigest {
  if (!row) return emptyPortfolioDigest;

  const alerts = parseRecordArray(row.alerts)
    .map(mapAlert)
    .filter((item) => item !== null);
  const exposures = normalizeExposureValues(
    parseRecordArray(row.exposures)
      .map(mapExposure)
      .filter((item) => item !== null),
  );
  const freshness = parseRecordArray(row.freshness)
    .map(mapFreshness)
    .filter((item) => item !== null);

  return portfolioDigestSchema.parse({
    alerts,
    exposures,
    freshness,
    stats: {
      watchlistCount: integer(row.watchlist_count),
      positionCount: integer(row.position_count),
      alertCount: integer(row.alert_count),
      changeEventCount: integer(row.change_event_count),
      freshnessRiskCount: integer(row.freshness_risk_count),
      nonStockFilteredCount: integer(row.non_stock_filtered_count),
    },
  });
}

export function createFallbackPortfolioDigestReadModel(): PortfolioDigestReadModel {
  return {
    loadPortfolioDigest() {
      return emptyPortfolioDigest;
    },
  };
}

export function createPostgresPortfolioDigestReadModel(
  executor: PortfolioDigestRowQueryExecutor,
  userScope: UserScope,
): PortfolioDigestReadModel {
  return {
    async loadPortfolioDigest() {
      const [row] = await executor(PORTFOLIO_DIGEST_SQL, [userScope.userId]);
      return mapPortfolioDigestDatabaseRow(row);
    },
  };
}

export type GetPortfolioDigestOptions = {
  now?: Date;
  readModel?: PortfolioDigestReadModel;
};

export async function getPortfolioDigest(
  options: GetPortfolioDigestOptions = {},
): Promise<PortfolioDigestResponse> {
  const readModel = options.readModel ?? createFallbackPortfolioDigestReadModel();
  const generatedAt = (options.now ?? new Date()).toISOString();

  let data: PortfolioDigest;
  try {
    data = sanitizePortfolioDigest(await readModel.loadPortfolioDigest());
  } catch {
    return portfolioDigestResponseSchema.parse({
      data: emptyPortfolioDigest,
      availability: 'error',
      error: {
        code: 'PORTFOLIO_DIGEST_READ_FAILED',
        message: '포트폴리오 변화·노출 데이터를 읽는 중 오류가 발생했습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt,
      },
    });
  }

  const hasData = data.alerts.length > 0 || data.exposures.length > 0 || data.freshness.length > 0;
  const meta: ResponseMeta = {
    source: hasData ? 'database' : 'fallback',
    generatedAt,
  };

  return portfolioDigestResponseSchema.parse({
    data,
    availability: hasData ? 'available' : 'collecting',
    error: null,
    meta,
  });
}
