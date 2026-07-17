import type { UserScope } from '../shared/user-scope.ts';

import {
  meBootstrapResponseSchema,
  type MeBootstrap,
  type MeBootstrapPosition,
  type MeBootstrapResponse,
  type MeBootstrapWatchlistItem,
  type ResponseMeta,
} from '@stock-insight/contracts';

export type MeBootstrapDatabaseRow = {
  user_id?: string | number | null;
  watchlist?: unknown;
  positions?: unknown;
};

export type MeBootstrapRowQueryExecutor = (
  sql: string,
  params: readonly unknown[],
) => MeBootstrapDatabaseRow[] | Promise<MeBootstrapDatabaseRow[]>;

export type MeBootstrapReadModel = {
  loadMeBootstrap: () => MeBootstrap | Promise<MeBootstrap>;
};

const emptyMeBootstrap: MeBootstrap = {
  user: { id: 'default', label: '기본 사용자' },
  watchlist: [],
  positions: [],
  preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
};

const ME_BOOTSTRAP_SQL = `
WITH active_watchlist AS (
  SELECT
    user_id::text AS user_id,
    entity_key,
    ticker,
    CASE
      WHEN upper(market) = 'KR' THEN 'KR'
      WHEN upper(market) = 'US' THEN 'US'
      ELSE NULL
    END AS market,
    coalesce(nullif(display_name, ''), ticker, entity_key) AS display_name,
    source,
    added_at
  FROM public.user_watchlist
  WHERE active IS TRUE
    AND removed_at IS NULL
    AND user_id = $1::uuid
    AND entity_key IS NOT NULL
    AND ticker IS NOT NULL
    AND upper(market) IN ('KR', 'US')
  ORDER BY added_at DESC NULLS LAST, id DESC
  LIMIT 200
), open_positions AS (
  SELECT
    position.user_id::text AS user_id,
    position.entity_key,
    split_part(position.entity_key, ':', 2) AS ticker,
    CASE
      WHEN split_part(position.entity_key, ':', 1) = 'KR' THEN 'KR'
      WHEN split_part(position.entity_key, ':', 1) = 'US' THEN 'US'
      ELSE NULL
    END AS market,
    coalesce(
      nullif(watch.display_name, ''),
      candidate.name,
      split_part(position.entity_key, ':', 2),
      position.entity_key
    ) AS display_name,
    position.avg_price,
    position.quantity,
    coalesce(nullif(position.status, ''), 'open') AS status,
    position.source,
    position.opened_at,
    position.closed_at
  FROM public.user_positions position
  LEFT JOIN public.user_watchlist watch
    ON watch.entity_key = position.entity_key
   AND watch.user_id = position.user_id
   AND watch.active IS TRUE
   AND watch.removed_at IS NULL
  LEFT JOIN LATERAL (
    SELECT name
    FROM stock.candidates candidate
    WHERE candidate.ticker = split_part(position.entity_key, ':', 2)
      AND (
        (split_part(position.entity_key, ':', 1) = 'KR' AND upper(candidate.market) IN ('KR', 'KRX', 'KOSDAQ'))
        OR (split_part(position.entity_key, ':', 1) = 'US' AND upper(candidate.market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX'))
      )
    ORDER BY candidate.created_at DESC NULLS LAST, candidate.id DESC
    LIMIT 1
  ) candidate ON TRUE
  WHERE position.entity_key IS NOT NULL
    AND position.user_id = $1::uuid
    AND split_part(position.entity_key, ':', 1) IN ('KR', 'US')
    AND position.closed_at IS NULL
    AND coalesce(nullif(position.status, ''), 'open') = 'open'
  ORDER BY position.opened_at DESC NULLS LAST, position.id DESC
  LIMIT 200
)
SELECT
  $1::uuid::text AS user_id,
  (SELECT coalesce(json_agg(row_to_json(active_watchlist)), '[]'::json) FROM active_watchlist) AS watchlist,
  (SELECT coalesce(json_agg(row_to_json(open_positions)), '[]'::json) FROM open_positions) AS positions
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    return [];
  }
}

function parseJsonArray(value: unknown): Record<string, unknown>[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecord);
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return undefined;
}

function market(value: unknown): 'KR' | 'US' | undefined {
  const normalized = text(value)?.toUpperCase();
  if (normalized === 'KR' || normalized === 'US') return normalized;
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDate(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function mapWatchlistItem(row: Record<string, unknown>): MeBootstrapWatchlistItem | null {
  const entityKey = text(row.entity_key);
  const ticker = text(row.ticker);
  const normalizedMarket = market(row.market);
  const displayName = text(row.display_name) ?? ticker;
  if (!entityKey || !ticker || !normalizedMarket || !displayName) return null;

  return {
    entityKey,
    ticker,
    market: normalizedMarket,
    displayName,
    ...(text(row.source) ? { source: text(row.source) } : {}),
    ...(isoDate(row.added_at) ? { addedAt: isoDate(row.added_at) } : {}),
  };
}

function mapPosition(row: Record<string, unknown>): MeBootstrapPosition | null {
  const entityKey = text(row.entity_key);
  const ticker = text(row.ticker);
  const normalizedMarket = market(row.market);
  const displayName = text(row.display_name) ?? ticker;
  const status = text(row.status) ?? 'open';
  if (!entityKey || !ticker || !normalizedMarket || !displayName) return null;

  return {
    entityKey,
    ticker,
    market: normalizedMarket,
    displayName,
    ...(numberValue(row.avg_price) !== undefined ? { avgPrice: numberValue(row.avg_price) } : {}),
    ...(numberValue(row.quantity) !== undefined ? { quantity: numberValue(row.quantity) } : {}),
    status,
    ...(text(row.source) ? { source: text(row.source) } : {}),
    ...(isoDate(row.opened_at) ? { openedAt: isoDate(row.opened_at) } : {}),
    ...(isoDate(row.closed_at) ? { closedAt: isoDate(row.closed_at) } : {}),
  };
}

function mapMeBootstrapDatabaseRow(row: MeBootstrapDatabaseRow | undefined): MeBootstrap {
  if (!row) return emptyMeBootstrap;

  return {
    user: { id: text(row.user_id) ?? 'default', label: '기본 사용자' },
    watchlist: parseJsonArray(row.watchlist)
      .map(mapWatchlistItem)
      .filter((item) => item !== null),
    positions: parseJsonArray(row.positions)
      .map(mapPosition)
      .filter((item) => item !== null),
    preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
  };
}

export function createFallbackMeBootstrapReadModel(): MeBootstrapReadModel {
  return {
    loadMeBootstrap() {
      return emptyMeBootstrap;
    },
  };
}

export function createPostgresMeBootstrapReadModel(
  executor: MeBootstrapRowQueryExecutor,
  userScope: UserScope,
): MeBootstrapReadModel {
  return {
    async loadMeBootstrap() {
      const [row] = await executor(ME_BOOTSTRAP_SQL, [userScope.userId]);
      return mapMeBootstrapDatabaseRow(row);
    },
  };
}

export type GetMeBootstrapOptions = {
  now?: Date;
  readModel?: MeBootstrapReadModel;
};

export async function getMeBootstrap(
  options: GetMeBootstrapOptions = {},
): Promise<MeBootstrapResponse> {
  const readModel = options.readModel ?? createFallbackMeBootstrapReadModel();
  const generatedAt = (options.now ?? new Date()).toISOString();

  let data: MeBootstrap;
  try {
    data = await readModel.loadMeBootstrap();
  } catch {
    return meBootstrapResponseSchema.parse({
      data: emptyMeBootstrap,
      availability: 'error',
      error: {
        code: 'ME_BOOTSTRAP_READ_FAILED',
        message: '사용자 부트스트랩 데이터를 읽는 중 오류가 발생했습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt,
      },
    });
  }

  const hasData = data.watchlist.length > 0 || data.positions.length > 0;
  const meta: ResponseMeta = {
    source: hasData ? 'database' : 'fallback',
    generatedAt,
  };

  return meBootstrapResponseSchema.parse({
    data,
    availability: hasData ? 'available' : 'collecting',
    error: null,
    meta,
  });
}
