import type { UserScope } from '../shared/user-scope';

import {
  personalizationDecisionHistorySchema,
  personalizationDecisionSupportSchema,
  type PersonalizationDecisionHistory,
  type PersonalizationDecisionSupport,
} from '@stock-insight/contracts/personalization';

export type PersonalizationDecisionQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

type DecisionRow = {
  decision_packet_id: string;
  portfolio_snapshot_id: string;
  entity_key: string | null;
  entity_name: string;
  action: string;
  action_reason: string;
  abstention_reason: string | null;
  common_view_key: string;
  common_view_digest: string;
  common_view_as_of: string | Date;
  generated_at: string | Date;
  expires_at: string | Date;
  legal_review_status: string;
  advice_prohibited: boolean;
  order_executable: boolean;
  runtime_packet: unknown;
};

type RuntimeDetails = {
  reasonCodes: unknown;
  targetWeight: { low: number; high: number };
  explanation: unknown;
};

export type GetPersonalizationDecisionOptions = Readonly<{
  userScope: UserScope;
  entityKey: string;
  now?: Date;
}>;

export type GetPersonalizationDecisionHistoryOptions = GetPersonalizationDecisionOptions &
  Readonly<{ limit?: number }>;

const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

const DECISION_SELECT_SQL = `
  SELECT
    packet.decision_packet_id,
    packet.portfolio_snapshot_id,
    identifier.identifier_value AS entity_key,
    entity.canonical_name AS entity_name,
    packet.action,
    packet.action_reason,
    packet.abstention_reason,
    packet.common_view_key,
    packet.common_view_digest,
    packet.common_view_as_of,
    packet.generated_at,
    packet.expires_at,
    CASE
      WHEN legal_review.review_status = 'approved_read_only' THEN 'approved_read_only'
      ELSE 'required'
    END AS legal_review_status,
    packet.advice_prohibited,
    packet.order_executable,
    packet.runtime_packet
  FROM personalization.decision_packet packet
  JOIN personalization.portfolio_snapshot_seal seal
    ON seal.portfolio_snapshot_id = packet.portfolio_snapshot_id
   AND seal.user_id = packet.user_id
  JOIN core.entity entity ON entity.entity_id = packet.security_entity_id
  JOIN LATERAL (
    SELECT candidate.identifier_value
    FROM core.entity_identifier candidate
    WHERE candidate.entity_id = packet.security_entity_id
      AND candidate.identifier_type = 'INTERNAL_KEY'
      AND candidate.identifier_value = $2::text
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
      AND review.reviewed_at <= $3::timestamptz
    ORDER BY review.reviewed_at DESC, review.decision_packet_legal_review_id DESC
    LIMIT 1
  ) legal_review ON true
  WHERE packet.user_id = $1::uuid
    AND packet.generated_at <= $3::timestamptz
`;

const DECISION_SUPPORT_SQL = `${DECISION_SELECT_SQL}
  ORDER BY packet.generated_at DESC, packet.decision_packet_id DESC
  LIMIT 1
`;

const DECISION_HISTORY_SQL = `${DECISION_SELECT_SQL}
  ORDER BY packet.generated_at DESC, packet.decision_packet_id DESC
  LIMIT $4
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIso(value: string | Date, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Decision packet ${field} is invalid`);
  return date.toISOString();
}

function requireOptions(options: GetPersonalizationDecisionOptions): Date {
  if (!entityKeyPattern.test(options.entityKey)) throw new Error('Decision entity key is invalid');
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Decision request time is invalid');
  return now;
}

function parseRuntimeDetails(row: DecisionRow): RuntimeDetails {
  if (!isRecord(row.runtime_packet)) throw new Error('Decision runtime packet is missing');
  const runtime = row.runtime_packet;
  const portfolioContext = runtime.portfolioContext;
  if (
    runtime.action !== row.action ||
    !Array.isArray(runtime.reasonCodes) ||
    !isRecord(portfolioContext) ||
    typeof portfolioContext.targetWeight !== 'number' ||
    !Number.isFinite(portfolioContext.targetWeight) ||
    !isRecord(runtime.explanation)
  ) {
    throw new Error('Decision runtime packet lineage is invalid');
  }
  const generatedAt =
    typeof runtime.generatedAt === 'string' ? Date.parse(runtime.generatedAt) : NaN;
  const expiresAt = typeof runtime.expiresAt === 'string' ? Date.parse(runtime.expiresAt) : NaN;
  if (
    generatedAt !== new Date(row.generated_at).getTime() ||
    expiresAt !== new Date(row.expires_at).getTime()
  ) {
    throw new Error('Decision runtime packet timestamps do not match the ledger');
  }
  return {
    reasonCodes: runtime.reasonCodes,
    targetWeight: {
      low: portfolioContext.targetWeight,
      high: portfolioContext.targetWeight,
    },
    explanation: runtime.explanation,
  };
}

function mapPacket(row: DecisionRow, now: Date) {
  if (row.entity_key === null) throw new Error('Decision packet entity identity is missing');
  const generatedAt = toIso(row.generated_at, 'generated at');
  const expiresAt = toIso(row.expires_at, 'expires at');
  const expired = Date.parse(expiresAt) <= now.getTime();
  const approved = row.legal_review_status === 'approved_read_only';
  const visible = approved && !expired;
  return {
    packet: {
      decisionPacketId: row.decision_packet_id,
      entityKey: row.entity_key,
      entityName: row.entity_name,
      action: visible ? row.action : null,
      actionReason: visible ? row.action_reason : null,
      abstentionReason: visible ? row.abstention_reason : null,
      commonViewAsOf: toIso(row.common_view_as_of, 'common view as of'),
      generatedAt,
      expiresAt,
      legalReviewStatus: approved ? ('approved_read_only' as const) : ('required' as const),
      restrictionReason: expired
        ? ('PACKET_EXPIRED' as const)
        : approved
          ? null
          : ('LEGAL_REVIEW_REQUIRED' as const),
      adviceProhibited: row.advice_prohibited,
      orderExecutable: row.order_executable,
    },
    visible,
    expired,
  };
}

export async function getPersonalizationDecisionSupport(
  executor: PersonalizationDecisionQueryExecutor,
  options: GetPersonalizationDecisionOptions,
): Promise<PersonalizationDecisionSupport | null> {
  const now = requireOptions(options);
  const rows = await executor.queryRows<DecisionRow>(DECISION_SUPPORT_SQL, [
    options.userScope.userId,
    options.entityKey,
    now.toISOString(),
  ]);
  const row = rows[0];
  if (!row) return null;
  const mapped = mapPacket(row, now);
  const details = mapped.visible ? parseRuntimeDetails(row) : null;
  return personalizationDecisionSupportSchema.parse({
    schemaVersion: 'p4.v1',
    availability: mapped.expired ? 'stale' : 'available',
    portfolioSnapshotId: row.portfolio_snapshot_id,
    commonViewKey: row.common_view_key,
    commonViewDigest: row.common_view_digest,
    packet: mapped.packet,
    reasonCodes: details?.reasonCodes ?? [],
    targetWeight: details?.targetWeight ?? null,
    explanation: details?.explanation ?? null,
    readOnly: true,
  });
}

export async function getPersonalizationDecisionHistory(
  executor: PersonalizationDecisionQueryExecutor,
  options: GetPersonalizationDecisionHistoryOptions,
): Promise<PersonalizationDecisionHistory> {
  const now = requireOptions(options);
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Decision history limit is invalid');
  }
  const rows = await executor.queryRows<DecisionRow>(DECISION_HISTORY_SQL, [
    options.userScope.userId,
    options.entityKey,
    now.toISOString(),
    limit,
  ]);
  return personalizationDecisionHistorySchema.parse({
    schemaVersion: 'p4.v1',
    availability: rows.length > 0 ? 'available' : 'missing',
    entityKey: options.entityKey,
    items: rows.map((row) => mapPacket(row, now).packet),
    nextCursor: null,
  });
}
