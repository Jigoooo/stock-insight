import type { UserScope } from '../shared/user-scope';

import {
  decisionHistoryItemSchema,
  myResearchOverviewSchema,
  type DecisionHistoryItem,
  type MyResearchOverview,
} from '@stock-insight/contracts/research-workspace';

export type MyResearchQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetMyResearchOverviewOptions = Readonly<{
  userScope: UserScope;
  now?: Date;
}>;

type CountRow = {
  watchlist_count: number | string;
  holding_count: number | string;
  open_history_count: number | string;
  review_due_count: number | string;
};

type RecentRow = {
  history_id: string;
  entity_key: string;
  market: string;
  entry_type: string;
  title: string;
  thesis_text: string;
  evidence_json: unknown;
  source_kind: string | null;
  source_ref: string | null;
  occurred_at: string | Date | null;
  review_due_at: string | Date | null;
  status: string;
  advice_prohibited: boolean;
  created_at: string | Date;
};

const COUNTS_SQL = `
  SELECT
    (SELECT count(*) FROM public.user_watchlist
      WHERE user_id = $1::uuid AND active = true)::int AS watchlist_count,
    (SELECT count(*) FROM public.user_positions
      WHERE user_id = $1::uuid AND status = 'open')::int AS holding_count,
    (SELECT count(*) FROM public.v_user_decision_history_v3
      WHERE user_id = $1::uuid AND status = 'open')::int AS open_history_count,
    (SELECT count(*) FROM public.v_user_decision_history_v3
      WHERE user_id = $1::uuid
        AND status = 'open'
        AND review_due_at IS NOT NULL
        AND review_due_at <= $2::timestamptz)::int AS review_due_count
`;

const RECENT_SQL = `
  SELECT
    history_id,
    entity_key,
    market,
    entry_type,
    title,
    thesis_text,
    evidence_json,
    source_kind,
    source_ref,
    occurred_at,
    review_due_at,
    status,
    advice_prohibited,
    created_at
  FROM public.v_user_decision_history_v3
  WHERE user_id = $1::uuid
  ORDER BY coalesce(occurred_at, created_at) DESC, history_id DESC
  LIMIT 10
`;

function toCount(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('My Research count is invalid');
  return count;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('My Research timestamp is invalid');
  return date.toISOString();
}

function evidenceCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value !== 'object' || value === null) return 0;
  const object = value as Record<string, unknown>;
  const nested = ['evidence', 'sources', 'claims', 'facts']
    .map((key) => object[key])
    .filter(Array.isArray)
    .map((items) => items.length);
  return nested.length > 0 ? Math.max(...nested) : Object.keys(object).length > 0 ? 1 : 0;
}

function mapRecent(row: RecentRow): DecisionHistoryItem {
  return decisionHistoryItemSchema.parse({
    historyId: row.history_id,
    entityKey: row.entity_key,
    market: row.market,
    entryType: row.entry_type,
    title: row.title,
    thesis: row.thesis_text,
    evidenceCount: evidenceCount(row.evidence_json),
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    occurredAt: toIso(row.occurred_at),
    reviewDueAt: toIso(row.review_due_at),
    status: row.status,
    adviceProhibited: row.advice_prohibited,
    createdAt: toIso(row.created_at),
  });
}

export async function getMyResearchOverview(
  executor: MyResearchQueryExecutor,
  options: GetMyResearchOverviewOptions,
): Promise<MyResearchOverview> {
  const now = options.now ?? new Date();
  const countRows = await executor.queryRows<CountRow>(COUNTS_SQL, [
    options.userScope.userId,
    now.toISOString(),
  ]);
  const recentRows = await executor.queryRows<RecentRow>(RECENT_SQL, [options.userScope.userId]);
  const counts = countRows[0] ?? {
    watchlist_count: 0,
    holding_count: 0,
    open_history_count: 0,
    review_due_count: 0,
  };
  const watchlistCount = toCount(counts.watchlist_count);
  const holdingCount = toCount(counts.holding_count);
  const openHistoryCount = toCount(counts.open_history_count);
  const reviewDueCount = toCount(counts.review_due_count);
  const recentHistory = recentRows.map(mapRecent);

  return myResearchOverviewSchema.parse({
    generatedAt: now.toISOString(),
    availability:
      watchlistCount + holdingCount + openHistoryCount + recentHistory.length > 0
        ? 'available'
        : 'missing',
    watchlistCount,
    holdingCount,
    openHistoryCount,
    reviewDueCount,
    recentHistory,
  });
}
