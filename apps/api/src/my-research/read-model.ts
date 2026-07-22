import type { UserScope } from '../shared/user-scope';

import {
  decisionHistoryItemSchema,
  decisionSupportSummarySchema,
  myResearchOverviewSchema,
  type DecisionHistoryItem,
  type DecisionSupportSummary,
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

type RelationProbeRow = {
  relation_name: string | null;
  review_relation_name: string | null;
  seal_relation_name: string | null;
};

type DecisionPacketRow = {
  decision_packet_id: string;
  entity_key: string | null;
  entity_name: string;
  action: string;
  action_reason: string;
  abstention_reason: string | null;
  common_view_as_of: string | Date;
  expires_at: string | Date;
  generated_at: string | Date;
  legal_review_status: 'required' | 'approved_read_only';
  advice_prohibited: boolean;
  order_executable: boolean;
  packet_count: number | string;
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

const DECISION_SUPPORT_PROBE_SQL = `
  SELECT
    to_regclass('personalization.decision_packet')::text AS relation_name,
    to_regclass('personalization.decision_packet_legal_review')::text AS review_relation_name,
    to_regclass('personalization.portfolio_snapshot_seal')::text AS seal_relation_name
`;

const DECISION_SUPPORT_SQL = `
  SELECT
    packet.decision_packet_id,
    identifier.identifier_value AS entity_key,
    entity.canonical_name AS entity_name,
    packet.action,
    packet.action_reason,
    packet.abstention_reason,
    packet.common_view_as_of,
    packet.expires_at,
    packet.generated_at,
    CASE
      WHEN legal_review.review_status = 'approved_read_only' THEN 'approved_read_only'
      ELSE 'required'
    END AS legal_review_status,
    packet.advice_prohibited,
    packet.order_executable,
    count(*) OVER ()::int AS packet_count
  FROM personalization.decision_packet packet
  JOIN personalization.portfolio_snapshot_seal seal
    ON seal.portfolio_snapshot_id = packet.portfolio_snapshot_id
   AND seal.user_id = packet.user_id
  JOIN core.entity entity ON entity.entity_id = packet.security_entity_id
  LEFT JOIN LATERAL (
    SELECT candidate.identifier_value
    FROM core.entity_identifier candidate
    WHERE candidate.entity_id = packet.security_entity_id
      AND candidate.identifier_type = 'INTERNAL_KEY'
      AND (candidate.valid_from IS NULL OR candidate.valid_from <= packet.common_view_as_of)
      AND (candidate.valid_to IS NULL OR candidate.valid_to > packet.common_view_as_of)
    ORDER BY candidate.valid_from DESC NULLS LAST, candidate.identifier_id DESC
    LIMIT 1
  ) identifier ON true
  LEFT JOIN LATERAL (
    SELECT review.review_status
    FROM personalization.decision_packet_legal_review review
    WHERE review.user_id = packet.user_id
      AND review.decision_packet_id = packet.decision_packet_id
      AND review.reviewed_at <= $2::timestamptz
    ORDER BY review.reviewed_at DESC, review.decision_packet_legal_review_id DESC
    LIMIT 1
  ) legal_review ON true
  WHERE packet.user_id = $1::uuid
    AND packet.generated_at <= $2::timestamptz
  ORDER BY packet.generated_at DESC, packet.decision_packet_id DESC
  LIMIT 1
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

async function loadDecisionSupport(
  executor: MyResearchQueryExecutor,
  userId: string,
  now: Date,
): Promise<DecisionSupportSummary> {
  const probe = await executor.queryRows<RelationProbeRow>(DECISION_SUPPORT_PROBE_SQL);
  if (
    probe[0]?.relation_name !== 'personalization.decision_packet' ||
    probe[0]?.review_relation_name !== 'personalization.decision_packet_legal_review' ||
    probe[0]?.seal_relation_name !== 'personalization.portfolio_snapshot_seal'
  ) {
    return decisionSupportSummarySchema.parse({
      availability: 'missing',
      sourceState: 'migration_missing',
      packetCount: 0,
      latestPacket: null,
    });
  }
  const rows = await executor.queryRows<DecisionPacketRow>(DECISION_SUPPORT_SQL, [
    userId,
    now.toISOString(),
  ]);
  const row = rows[0];
  if (!row) {
    return decisionSupportSummarySchema.parse({
      availability: 'missing',
      sourceState: 'ready',
      packetCount: 0,
      latestPacket: null,
    });
  }
  const approved = row.legal_review_status === 'approved_read_only';
  const expiresAt = toIso(row.expires_at);
  if (expiresAt === null) throw new Error('Decision packet expiration is missing');
  const expired = Date.parse(expiresAt) <= now.getTime();
  const visible = approved && !expired;
  return decisionSupportSummarySchema.parse({
    availability: expired ? 'stale' : 'available',
    sourceState: 'ready',
    packetCount: toCount(row.packet_count),
    latestPacket: {
      decisionPacketId: row.decision_packet_id,
      entityKey: row.entity_key,
      entityName: row.entity_name,
      action: visible ? row.action : null,
      actionReason: visible ? row.action_reason : null,
      abstentionReason: visible ? row.abstention_reason : null,
      commonViewAsOf: toIso(row.common_view_as_of),
      generatedAt: toIso(row.generated_at),
      expiresAt,
      legalReviewStatus: row.legal_review_status,
      restrictionReason: expired ? 'PACKET_EXPIRED' : approved ? null : 'LEGAL_REVIEW_REQUIRED',
      adviceProhibited: row.advice_prohibited,
      orderExecutable: row.order_executable,
    },
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
  const decisionSupport = await loadDecisionSupport(executor, options.userScope.userId, now);
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
    decisionSupport,
  });
}
