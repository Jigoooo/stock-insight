import type { UserScope } from '../shared/user-scope';

import {
  radarSignalItemSchema,
  radarSignalPageSchema,
  type MarketComponentWatermarks,
  type RadarSignalItem,
  type RadarSignalPage,
} from '@stock-insight/contracts/research-workspace';

export type RadarSignalQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetRadarSignalsOptions = Readonly<{
  userScope: UserScope;
  cursor?: string | null;
  limit?: number;
  now?: Date;
}>;

type RadarRow = {
  signal_key: string | null;
  entity_key: string | null;
  market: string | null;
  symbol: string | null;
  name: string | null;
  signal_type: string | null;
  polarity: string | null;
  strength: number | string | null;
  summary_text: string | null;
  occurred_at: string | Date | null;
  source_name: string | null;
  watched: boolean | null;
  holding: boolean | null;
  priority: number | string | null;
  scope_total: number | string;
  signal_as_of: string | Date | null;
};

type RadarCursor = Readonly<{
  v: 1;
  priority: number;
  occurredAt: string;
  signalKey: string;
}>;

const MARKET_COMPONENT_FRESHNESS_MS = 24 * 60 * 60 * 1_000;

function buildComponentWatermarks(
  scopeTotal: number,
  signalAsOf: string | null,
  now: Date,
): MarketComponentWatermarks {
  const missing = { availability: 'missing', watermarkAt: null, rowCount: 0 } as const;
  if (scopeTotal === 0) {
    const empty = { availability: 'empty', watermarkAt: null, rowCount: 0 } as const;
    return {
      event_radar: empty,
      factor_map: empty,
      propagation_map: empty,
      theme_community: missing,
      heatmap_matrix: empty,
      timeline: empty,
      map_globe: missing,
      value_chain: missing,
    };
  }
  if (signalAsOf === null) {
    const error = { availability: 'error', watermarkAt: null, rowCount: scopeTotal } as const;
    return {
      event_radar: error,
      factor_map: error,
      propagation_map: error,
      theme_community: missing,
      heatmap_matrix: error,
      timeline: error,
      map_globe: missing,
      value_chain: missing,
    };
  }
  const stale = now.getTime() - new Date(signalAsOf).getTime() > MARKET_COMPONENT_FRESHNESS_MS;
  const direct = {
    availability: stale ? ('stale' as const) : ('available' as const),
    watermarkAt: signalAsOf,
    rowCount: scopeTotal,
  };
  const derived = {
    ...direct,
    availability: stale ? ('stale' as const) : ('partial' as const),
  };
  return {
    event_radar: direct,
    factor_map: derived,
    propagation_map: derived,
    theme_community: missing,
    heatmap_matrix: direct,
    timeline: direct,
    map_globe: missing,
    value_chain: missing,
  };
}

const RADAR_SQL = `
  WITH base AS (
    SELECT
      signal.signal_key,
      entity.entity_key,
      entity.market,
      entity.symbol,
      entity.name,
      signal.signal_type,
      coalesce(nullif(signal.polarity, ''), 'neutral') AS polarity,
      least(
        1::numeric,
        greatest(0::numeric, abs(coalesce(signal.magnitude, 0))) /
          greatest(
            1::numeric,
            max(abs(coalesce(signal.magnitude, 0))) OVER (PARTITION BY signal.signal_type)
          )
      ) AS strength,
      coalesce(
        nullif(signal.summary_text, ''),
        entity.name || ' ' || signal.signal_type || ' 신호 감지'
      ) AS summary_text,
      signal.occurred_at,
      signal.source_name,
      EXISTS (
        SELECT 1 FROM public.user_watchlist watchlist
        WHERE watchlist.user_id = $1::uuid
          AND watchlist.entity_key = entity.entity_key
          AND watchlist.active = true
      ) AS watched,
      EXISTS (
        SELECT 1 FROM public.user_positions position
        WHERE position.user_id = $1::uuid
          AND position.entity_key = entity.entity_key
          AND position.status = 'open'
      ) AS holding
    FROM public.market_signals signal
    JOIN public.entities entity ON entity.id = signal.entity_id
    WHERE signal.domain = 'stock'
      AND entity.entity_type = 'ticker'
      AND entity.market IN ('KR', 'US')
      AND signal.signal_key IS NOT NULL
      AND signal.occurred_at IS NOT NULL
  ), scoped AS (
    SELECT *, CASE WHEN holding THEN 2 WHEN watched THEN 1 ELSE 0 END AS priority
    FROM base
  ), page AS (
    SELECT *
    FROM scoped
    WHERE (
      $2::int IS NULL
      OR (priority, occurred_at, signal_key) < ($2::int, $3::timestamptz, $4::text)
    )
    ORDER BY priority DESC, occurred_at DESC, signal_key DESC
    LIMIT $5
  ), stats AS (
    SELECT count(*)::int AS scope_total, max(occurred_at) AS signal_as_of FROM scoped
  )
  SELECT page.*, stats.scope_total, stats.signal_as_of
  FROM stats
  LEFT JOIN page ON true
  ORDER BY page.priority DESC NULLS LAST, page.occurred_at DESC NULLS LAST,
           page.signal_key DESC NULLS LAST
`;

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Radar signal timestamp is invalid');
  return date.toISOString();
}

function toCount(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Radar signal count is invalid');
  return count;
}

function toStrength(value: number | string | null): number {
  const strength = Number(value ?? 0);
  if (!Number.isFinite(strength)) throw new Error('Radar signal strength is invalid');
  return Math.min(1, Math.max(0, strength));
}

function encodeCursor(item: RadarSignalItem, priority: number): string {
  const payload: RadarCursor = {
    v: 1,
    priority,
    occurredAt: item.occurredAt,
    signalKey: item.signalKey,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null | undefined): RadarCursor | null {
  if (cursor === null || cursor === undefined) return null;
  if (cursor.length === 0 || cursor.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new Error('Radar cursor is invalid');
  }
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) throw new Error('non-canonical cursor');
    const value = JSON.parse(decoded.toString('utf8')) as Record<string, unknown>;
    if (
      value.v !== 1 ||
      !Number.isInteger(value.priority) ||
      (value.priority as number) < 0 ||
      (value.priority as number) > 2 ||
      typeof value.occurredAt !== 'string' ||
      !Number.isFinite(new Date(value.occurredAt).getTime()) ||
      typeof value.signalKey !== 'string' ||
      value.signalKey.length === 0 ||
      value.signalKey.length > 320
    ) {
      throw new Error('invalid cursor payload');
    }
    return {
      v: 1,
      priority: value.priority as number,
      occurredAt: new Date(value.occurredAt).toISOString(),
      signalKey: value.signalKey,
    };
  } catch {
    throw new Error('Radar cursor is invalid');
  }
}

function mapRow(row: RadarRow): { item: RadarSignalItem; priority: number } | null {
  if (row.signal_key === null) return null;
  const occurredAt = toIso(row.occurred_at);
  if (occurredAt === null) throw new Error('Radar signal timestamp is missing');
  const priority = Number(row.priority ?? 0);
  if (!Number.isInteger(priority) || priority < 0 || priority > 2) {
    throw new Error('Radar signal priority is invalid');
  }
  return {
    priority,
    item: radarSignalItemSchema.parse({
      signalKey: row.signal_key,
      entityKey: row.entity_key,
      market: row.market,
      symbol: row.symbol,
      name: row.name,
      signalType: row.signal_type,
      polarity: row.polarity,
      strength: toStrength(row.strength),
      summary: row.summary_text,
      occurredAt,
      sourceName: row.source_name,
      watched: row.watched ?? false,
      holding: row.holding ?? false,
    }),
  };
}

export async function getRadarSignals(
  executor: RadarSignalQueryExecutor,
  options: GetRadarSignalsOptions,
): Promise<RadarSignalPage> {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Radar limit must be between 1 and 50');
  }
  const cursor = decodeCursor(options.cursor);
  const rows = await executor.queryRows<RadarRow>(RADAR_SQL, [
    options.userScope.userId,
    cursor?.priority ?? null,
    cursor?.occurredAt ?? null,
    cursor?.signalKey ?? null,
    limit + 1,
  ]);
  const scopeTotal = rows[0] === undefined ? 0 : toCount(rows[0].scope_total);
  const signalAsOf = rows[0] === undefined ? null : toIso(rows[0].signal_as_of);
  const mapped = rows.map(mapRow).filter((value) => value !== null);
  const hasMore = mapped.length > limit;
  const returned = mapped.slice(0, limit);
  const last = returned.at(-1);
  const now = options.now ?? new Date();

  return radarSignalPageSchema.parse({
    generatedAt: now.toISOString(),
    signalAsOf,
    scopeTotal,
    componentWatermarks: buildComponentWatermarks(scopeTotal, signalAsOf, now),
    items: returned.map(({ item }) => item),
    nextCursor: hasMore && last ? encodeCursor(last.item, last.priority) : null,
  });
}
