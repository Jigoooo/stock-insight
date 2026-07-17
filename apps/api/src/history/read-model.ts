import type { UserScope } from '../shared/user-scope';

import {
  decisionHistoryPageSchema,
  type DecisionHistoryItem,
  type DecisionHistoryPage,
} from '@stock-insight/contracts/research-workspace';

export type DecisionHistoryQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetDecisionHistoryOptions = Readonly<{
  userScope: UserScope;
  cursor?: string | null;
  limit?: number;
  now?: Date;
}>;

type HistoryRow = {
  history_id: string | null;
  entity_key: string | null;
  market: string | null;
  entry_type: string | null;
  title: string | null;
  thesis_text: string | null;
  evidence_json: unknown;
  source_kind: string | null;
  source_ref: string | null;
  occurred_at: string | Date | null;
  review_due_at: string | Date | null;
  status: string | null;
  advice_prohibited: boolean | null;
  created_at: string | Date | null;
  sort_at: string | Date | null;
  scope_total: number | string;
};

type HistoryCursor = Readonly<{
  v: 1;
  sortAt: string;
  historyId: string;
}>;

const HISTORY_SQL = `
  WITH scoped AS (
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
      created_at,
      coalesce(occurred_at, created_at) AS sort_at
    FROM public.v_user_decision_history_v3
    WHERE user_id = $1::uuid
  ), page AS (
    SELECT *
    FROM scoped
    WHERE (
      $2::timestamptz IS NULL
      OR (sort_at, history_id) < ($2::timestamptz, $3::uuid)
    )
    ORDER BY sort_at DESC, history_id DESC
    LIMIT $4
  ), stats AS (
    SELECT count(*)::int AS scope_total FROM scoped
  )
  SELECT page.*, stats.scope_total
  FROM stats
  LEFT JOIN page ON true
  ORDER BY page.sort_at DESC NULLS LAST, page.history_id DESC NULLS LAST
`;

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Decision history contains an invalid timestamp');
  return date.toISOString();
}

function toCount(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Decision history count is invalid');
  }
  return count;
}

function evidenceCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value !== 'object' || value === null) return 0;

  const object = value as Record<string, unknown>;
  const nestedCounts = ['evidence', 'sources', 'claims', 'facts']
    .map((key) => object[key])
    .filter(Array.isArray)
    .map((items) => items.length);
  if (nestedCounts.length > 0) return Math.max(...nestedCounts);
  return Object.keys(object).length > 0 ? 1 : 0;
}

function encodeCursor(item: DecisionHistoryItem, sortAt: string): string {
  const payload: HistoryCursor = { v: 1, sortAt, historyId: item.historyId };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null | undefined): HistoryCursor | null {
  if (cursor === null || cursor === undefined) return null;
  if (cursor.length === 0 || cursor.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new Error('History cursor is invalid');
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) throw new Error('non-canonical cursor');
    const value = JSON.parse(decoded.toString('utf8')) as Record<string, unknown>;
    if (
      value.v !== 1 ||
      typeof value.sortAt !== 'string' ||
      !Number.isFinite(new Date(value.sortAt).getTime()) ||
      typeof value.historyId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        value.historyId,
      )
    ) {
      throw new Error('invalid cursor payload');
    }
    return { v: 1, sortAt: new Date(value.sortAt).toISOString(), historyId: value.historyId };
  } catch {
    throw new Error('History cursor is invalid');
  }
}

function mapItem(row: HistoryRow): { item: DecisionHistoryItem; sortAt: string } | null {
  if (row.history_id === null) return null;
  const sortAt = toIso(row.sort_at);
  if (sortAt === null) throw new Error('Decision history sort timestamp is missing');

  const item = {
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
  };

  return {
    item: decisionHistoryPageSchema.shape.items.element.parse(item),
    sortAt,
  };
}

export async function getDecisionHistory(
  executor: DecisionHistoryQueryExecutor,
  options: GetDecisionHistoryOptions,
): Promise<DecisionHistoryPage> {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('History limit must be between 1 and 50');
  }
  const cursor = decodeCursor(options.cursor);
  const rows = await executor.queryRows<HistoryRow>(HISTORY_SQL, [
    options.userScope.userId,
    cursor?.sortAt ?? null,
    cursor?.historyId ?? null,
    limit + 1,
  ]);
  const scopeTotal = rows[0] === undefined ? 0 : toCount(rows[0].scope_total);
  const mapped = rows.map(mapItem).filter((value) => value !== null);
  const hasMore = mapped.length > limit;
  const returned = mapped.slice(0, limit);
  const last = returned.at(-1);

  return decisionHistoryPageSchema.parse({
    generatedAt: (options.now ?? new Date()).toISOString(),
    availability: scopeTotal > 0 ? 'available' : 'missing',
    scopeTotal,
    items: returned.map(({ item }) => item),
    nextCursor: hasMore && last ? encodeCursor(last.item, last.sortAt) : null,
  });
}
