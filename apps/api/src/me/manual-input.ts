import type { UserScope } from '../shared/user-scope.ts';

import type { MeBootstrapPosition, MeBootstrapWatchlistItem } from '@stock-insight/contracts';

export type ManualStockInput = {
  market: 'KR' | 'US';
  ticker: string;
  displayName?: string;
};

export type ManualPositionInput = ManualStockInput & {
  avgPrice?: number;
  quantity?: number;
};

export type NormalizedManualStockInput = {
  entityKey: string;
  market: 'KR' | 'US';
  ticker: string;
  displayName?: string;
};

type ManualPortfolioRow = Record<string, unknown>;

export type ManualPortfolioWriteExecutor = (
  sql: string,
  params: readonly unknown[],
) => ManualPortfolioRow[] | Promise<ManualPortfolioRow[]>;

export type ManualPortfolioWriteModel = {
  upsertWatchlist: (input: ManualStockInput) => Promise<MeBootstrapWatchlistItem>;
  removeWatchlist: (entityKey: string) => Promise<{ entityKey: string; active: false }>;
  upsertPosition: (input: ManualPositionInput) => Promise<MeBootstrapPosition>;
  closePosition: (entityKey: string) => Promise<{ entityKey: string; status: 'closed' }>;
};

const SOURCE = 'manual_web';

const UPSERT_WATCHLIST_SQL = `
WITH scoped_user AS (
  SELECT $5::uuid AS id
), matched_entity AS (
  SELECT id, name
  FROM public.entities
  WHERE entity_key = $1::text
  LIMIT 1
), upsert_watchlist AS (
  INSERT INTO public.user_watchlist (
    user_id,
    entity_id,
    entity_key,
    ticker,
    market,
    display_name,
    source,
    active,
    added_at,
    removed_at,
    raw_json
  )
  SELECT
    scoped_user.id,
    matched_entity.id,
    $1::text,
    $2::text,
    $3::text,
    coalesce(nullif($4::text, ''), matched_entity.name, $2::text),
    '${SOURCE}',
    true,
    now(),
    NULL,
    jsonb_build_object('source', '${SOURCE}', 'input_market', $3::text, 'input_ticker', $2::text)
  FROM scoped_user
  LEFT JOIN matched_entity ON TRUE
  ON CONFLICT (user_id, entity_key) DO UPDATE SET
    entity_id = coalesce(EXCLUDED.entity_id, public.user_watchlist.entity_id),
    ticker = EXCLUDED.ticker,
    market = EXCLUDED.market,
    display_name = EXCLUDED.display_name,
    source = '${SOURCE}',
    active = true,
    removed_at = NULL,
    raw_json = EXCLUDED.raw_json
  RETURNING entity_key, ticker, market, display_name, source, added_at
)
SELECT * FROM upsert_watchlist
`;

const REMOVE_WATCHLIST_SQL = `
WITH scoped_user AS (
  SELECT $2::uuid AS id
), removed_watchlist AS (
  UPDATE public.user_watchlist watchlist
  SET
    active = false,
    removed_at = now(),
    source = '${SOURCE}'
  FROM scoped_user
  WHERE watchlist.user_id = scoped_user.id
    AND watchlist.entity_key = $1::text
  RETURNING watchlist.entity_key
)
SELECT entity_key FROM removed_watchlist
`;

const UPSERT_POSITION_SQL = `
WITH scoped_user AS (
  SELECT $7::uuid AS id
), matched_entity AS (
  SELECT id, name
  FROM public.entities
  WHERE entity_key = $1::text
  LIMIT 1
), upsert_watchlist AS (
  INSERT INTO public.user_watchlist (
    user_id,
    entity_id,
    entity_key,
    ticker,
    market,
    display_name,
    source,
    active,
    added_at,
    removed_at,
    raw_json
  )
  SELECT
    scoped_user.id,
    matched_entity.id,
    $1::text,
    $2::text,
    $3::text,
    coalesce(nullif($4::text, ''), matched_entity.name, $2::text),
    '${SOURCE}',
    true,
    now(),
    NULL,
    jsonb_build_object('source', '${SOURCE}', 'input_market', $3::text, 'input_ticker', $2::text)
  FROM scoped_user
  LEFT JOIN matched_entity ON TRUE
  ON CONFLICT (user_id, entity_key) DO UPDATE SET
    entity_id = coalesce(EXCLUDED.entity_id, public.user_watchlist.entity_id),
    ticker = EXCLUDED.ticker,
    market = EXCLUDED.market,
    display_name = EXCLUDED.display_name,
    source = '${SOURCE}',
    active = true,
    removed_at = NULL,
    raw_json = EXCLUDED.raw_json
  RETURNING entity_key
), upsert_position AS (
  INSERT INTO public.user_positions AS position (
    user_id,
    entity_id,
    entity_key,
    avg_price,
    quantity,
    opened_at,
    closed_at,
    status,
    source,
    raw_json
  )
  SELECT
    scoped_user.id,
    matched_entity.id,
    $1::text,
    $5::numeric,
    $6::numeric,
    now(),
    NULL,
    'open',
    '${SOURCE}',
    jsonb_build_object('source', '${SOURCE}', 'input_market', $3::text, 'input_ticker', $2::text)
  FROM scoped_user
  LEFT JOIN matched_entity ON TRUE
  ON CONFLICT (user_id, entity_key) WHERE status = 'open' AND closed_at IS NULL DO UPDATE SET
    entity_id = coalesce(EXCLUDED.entity_id, position.entity_id),
    avg_price = EXCLUDED.avg_price,
    quantity = EXCLUDED.quantity,
    opened_at = coalesce(position.opened_at, EXCLUDED.opened_at),
    closed_at = NULL,
    status = 'open',
    source = '${SOURCE}',
    updated_at = now(),
    raw_json = EXCLUDED.raw_json
  RETURNING
    position.entity_key,
    $2::text AS ticker,
    $3::text AS market,
    coalesce(nullif($4::text, ''), (SELECT name FROM matched_entity), $2::text) AS display_name,
    position.avg_price,
    position.quantity,
    position.status,
    position.source,
    position.opened_at,
    position.closed_at
)
SELECT * FROM upsert_position
`;

const CLOSE_POSITION_SQL = `
WITH scoped_user AS (
  SELECT $2::uuid AS id
), closed_position AS (
  UPDATE public.user_positions position
  SET
    status = 'closed',
    closed_at = now(),
    updated_at = now(),
    source = '${SOURCE}'
  FROM scoped_user
  WHERE position.user_id = scoped_user.id
    AND position.entity_key = $1::text
    AND position.status = 'open'
    AND position.closed_at IS NULL
  RETURNING position.entity_key, position.status
)
SELECT entity_key, status FROM closed_position
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
  const raw = text(value);
  if (!raw) return undefined;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function normalizeDisplayName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function requirePositiveNumber(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number`);
  return value;
}

export function normalizeManualStockInput(input: ManualStockInput): NormalizedManualStockInput {
  const market = input.market;
  const ticker = input.ticker.trim().toUpperCase();
  const displayName = normalizeDisplayName(input.displayName);

  if (market === 'KR') {
    if (!/^\d{6}$/.test(ticker)) throw new Error('KR ticker must be a 6-digit stock code');
  } else if (market === 'US') {
    if (!/^[A-Z]{1,5}(?:[.-][A-Z])?$/.test(ticker)) {
      throw new Error('US ticker must be an equity ticker symbol');
    }
  } else {
    throw new Error('market must be KR or US');
  }

  return {
    entityKey: `${market}:${ticker}`,
    market,
    ticker,
    ...(displayName ? { displayName } : {}),
  };
}

function mapWatchlistRow(row: ManualPortfolioRow | undefined): MeBootstrapWatchlistItem {
  const entityKey = text(row?.entity_key);
  const ticker = text(row?.ticker);
  const market = text(row?.market);
  const displayName = text(row?.display_name) ?? ticker;
  if (!entityKey || !ticker || (market !== 'KR' && market !== 'US') || !displayName) {
    throw new Error('Manual watchlist write returned no row');
  }

  return {
    entityKey,
    ticker,
    market,
    displayName,
    ...(text(row?.source) ? { source: text(row?.source) } : {}),
    ...(isoDate(row?.added_at) ? { addedAt: isoDate(row?.added_at) } : {}),
  };
}

function mapPositionRow(row: ManualPortfolioRow | undefined): MeBootstrapPosition {
  const entityKey = text(row?.entity_key);
  const ticker = text(row?.ticker);
  const market = text(row?.market);
  const displayName = text(row?.display_name) ?? ticker;
  const status = text(row?.status) ?? 'open';
  if (!entityKey || !ticker || (market !== 'KR' && market !== 'US') || !displayName) {
    throw new Error('Manual position write returned no row');
  }

  return {
    entityKey,
    ticker,
    market,
    displayName,
    ...(numberValue(row?.avg_price) !== undefined ? { avgPrice: numberValue(row?.avg_price) } : {}),
    ...(numberValue(row?.quantity) !== undefined ? { quantity: numberValue(row?.quantity) } : {}),
    status,
    ...(text(row?.source) ? { source: text(row?.source) } : {}),
    ...(isoDate(row?.opened_at) ? { openedAt: isoDate(row?.opened_at) } : {}),
    ...(isoDate(row?.closed_at) ? { closedAt: isoDate(row?.closed_at) } : {}),
  };
}

export function createPostgresManualPortfolioWriteModel(
  executor: ManualPortfolioWriteExecutor,
  userScope: UserScope,
): ManualPortfolioWriteModel {
  return {
    async upsertWatchlist(input) {
      const normalized = normalizeManualStockInput(input);
      const [row] = await executor(UPSERT_WATCHLIST_SQL, [
        normalized.entityKey,
        normalized.ticker,
        normalized.market,
        normalized.displayName ?? '',
        userScope.userId,
      ]);
      return mapWatchlistRow(row);
    },
    async removeWatchlist(entityKey) {
      const [row] = await executor(REMOVE_WATCHLIST_SQL, [entityKey, userScope.userId]);
      const removedEntityKey = text(row?.entity_key) ?? entityKey;
      return { entityKey: removedEntityKey, active: false };
    },
    async upsertPosition(input) {
      const normalized = normalizeManualStockInput(input);
      const avgPrice = requirePositiveNumber(input.avgPrice, 'avgPrice');
      const quantity = requirePositiveNumber(input.quantity, 'quantity');
      const [row] = await executor(UPSERT_POSITION_SQL, [
        normalized.entityKey,
        normalized.ticker,
        normalized.market,
        normalized.displayName ?? '',
        avgPrice ?? null,
        quantity ?? null,
        userScope.userId,
      ]);
      return mapPositionRow(row);
    },
    async closePosition(entityKey) {
      const [row] = await executor(CLOSE_POSITION_SQL, [entityKey, userScope.userId]);
      return { entityKey: text(row?.entity_key) ?? entityKey, status: 'closed' };
    },
  };
}
