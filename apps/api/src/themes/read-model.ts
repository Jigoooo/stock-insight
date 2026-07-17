import type { UserScope } from '../shared/user-scope';

import {
  themeResearchItemSchema,
  themeResearchListSchema,
  type ThemeResearchList,
} from '@stock-insight/contracts/research-workspace';

export type ThemeResearchQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetThemeResearchListOptions = Readonly<{
  userScope: UserScope;
  now?: Date;
}>;

type ThemeRow = {
  theme_key: string;
  title: string;
  member_count: number | string;
  watched_count: number | string;
  holding_count: number | string;
  recent_signal_count: number | string;
  top_entity_keys: string[] | null;
  graph_known_through_at: string | Date | null;
  signal_as_of: string | Date | null;
};

const THEME_SQL = `
  WITH edge_members AS (
    SELECT
      CASE WHEN source.entity_type = 'theme' THEN source.entity_key ELSE target.entity_key END AS theme_key,
      CASE WHEN source.entity_type = 'theme' THEN source.name ELSE target.name END AS theme_title,
      CASE WHEN source.entity_type = 'ticker' THEN source.id ELSE target.id END AS member_id,
      CASE WHEN source.entity_type = 'ticker' THEN source.entity_key ELSE target.entity_key END AS member_key,
      edge.known_at
    FROM ops.current_temporal_graph_edge edge
    JOIN public.entities source ON source.id = edge.src_entity_id
    JOIN public.entities target ON target.id = edge.dst_entity_id
    WHERE edge.approved = true
      AND edge.inferred = false
      AND (
        (source.entity_type = 'theme' AND target.entity_type = 'ticker')
        OR (source.entity_type = 'ticker' AND target.entity_type = 'theme')
      )
      AND edge.edge_type IN ('AFFECTS', 'SAME_THEME', 'ROLLS_UP', 'STAGE', 'ACCELERATES', 'DECELERATES')
  ), members AS (
    SELECT
      theme_key,
      max(theme_title) AS theme_title,
      member_id,
      member_key,
      max(known_at) AS known_at
    FROM edge_members
    GROUP BY theme_key, member_id, member_key
  ), member_context AS (
    SELECT
      member.*,
      EXISTS (
        SELECT 1 FROM public.user_watchlist watchlist
        WHERE watchlist.user_id = $1::uuid
          AND watchlist.entity_key = member.member_key
          AND watchlist.active = true
      ) AS watched,
      EXISTS (
        SELECT 1 FROM public.user_positions position
        WHERE position.user_id = $1::uuid
          AND position.entity_key = member.member_key
          AND position.status = 'open'
      ) AS holding,
      count(signal.id)::int AS recent_signal_count,
      max(signal.occurred_at) AS signal_as_of
    FROM members member
    LEFT JOIN public.market_signals signal
      ON signal.entity_id = member.member_id
     AND signal.domain = 'stock'
     AND signal.occurred_at >= $2::timestamptz
    GROUP BY member.theme_key, member.theme_title, member.member_id,
             member.member_key, member.known_at
  ), themes AS (
    SELECT
      theme_key,
      max(theme_title) AS title,
      count(*)::int AS member_count,
      count(*) FILTER (WHERE watched)::int AS watched_count,
      count(*) FILTER (WHERE holding)::int AS holding_count,
      sum(recent_signal_count)::int AS recent_signal_count,
      (array_agg(
        member_key
        ORDER BY holding DESC, watched DESC, recent_signal_count DESC, member_key
      ))[1:5] AS top_entity_keys,
      max(known_at) AS graph_known_through_at,
      max(signal_as_of) AS signal_as_of
    FROM member_context
    GROUP BY theme_key
  )
  SELECT *
  FROM themes
  ORDER BY holding_count DESC, watched_count DESC, recent_signal_count DESC,
           member_count DESC, theme_key
  LIMIT 100
`;

function toCount(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Theme count is invalid');
  return count;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Theme timestamp is invalid');
  return date.toISOString();
}

function titleFor(row: ThemeRow): string {
  const normalized = row.title.trim();
  if (normalized.length > 0) return normalized;
  return row.theme_key.slice('THEME:'.length).replaceAll('_', ' ');
}

export async function getThemeResearchList(
  executor: ThemeResearchQueryExecutor,
  options: GetThemeResearchListOptions,
): Promise<ThemeResearchList> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const rows = await executor.queryRows<ThemeRow>(THEME_SQL, [options.userScope.userId, since]);
  const items = rows.map((row) => {
    const memberCount = toCount(row.member_count);
    const recentSignalCount = toCount(row.recent_signal_count);
    return themeResearchItemSchema.parse({
      themeKey: row.theme_key,
      title: titleFor(row),
      description: `연결 종목 ${memberCount}개 · 최근 7일 신호 ${recentSignalCount}건`,
      memberCount,
      watchedCount: toCount(row.watched_count),
      holdingCount: toCount(row.holding_count),
      recentSignalCount,
      topEntityKeys: row.top_entity_keys ?? [],
    });
  });
  const graphKnownThroughAt = rows.reduce<string | null>((latest, row) => {
    const current = toIso(row.graph_known_through_at);
    return current !== null && (latest === null || current > latest) ? current : latest;
  }, null);
  const signalAsOf = rows.reduce<string | null>((latest, row) => {
    const current = toIso(row.signal_as_of);
    return current !== null && (latest === null || current > latest) ? current : latest;
  }, null);

  return themeResearchListSchema.parse({
    generatedAt: now.toISOString(),
    graphKnownThroughAt,
    signalAsOf,
    availability: items.length > 0 ? 'available' : 'missing',
    items,
  });
}
