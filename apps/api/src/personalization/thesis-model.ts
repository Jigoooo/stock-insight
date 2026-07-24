import { randomUUID } from 'node:crypto';

import type { UserScope } from '../shared/user-scope';

import {
  personalizationThesisSchema,
  personalizationThesisWriteInputSchema,
  type PersonalizationThesis,
  type PersonalizationThesisWriteInput,
} from '@stock-insight/contracts/personalization';

export type PersonalizationThesisExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetPersonalizationThesisOptions = Readonly<{
  userScope: UserScope;
  entityKey: string;
  now?: Date;
}>;

export type AppendUserThesisRevisionOptions = Readonly<{
  userScope: UserScope;
  entityKey: string;
  input: PersonalizationThesisWriteInput;
  now?: Date;
  generateId?: () => string;
}>;

type ThesisRow = {
  thesis_revision_id: string;
  revision_no: number | string;
  source_kind: string;
  thesis_text: string;
  evidence_refs: unknown;
  counter_evidence: unknown;
  invalidation_conditions: unknown;
  status: string;
  valid_from: string | Date;
  valid_to: string | Date | null;
};

type HeadRow = {
  security_entity_id: string | number;
  predecessor_id: string | null;
  next_revision_no: string | number;
};

const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

const THESIS_READ_SQL = `
  SELECT
    thesis.thesis_revision_id,
    thesis.revision_no,
    thesis.source_kind,
    thesis.thesis_text,
    thesis.evidence_refs,
    thesis.counter_evidence,
    thesis.invalidation_conditions,
    thesis.status,
    thesis.valid_from,
    thesis.valid_to
  FROM personalization.thesis_revision thesis
  JOIN core.entity_identifier identifier
    ON identifier.entity_id = thesis.security_entity_id
   AND identifier.identifier_type = 'INTERNAL_KEY'
   AND identifier.identifier_value = $2::text
   AND (identifier.valid_from IS NULL OR identifier.valid_from <= $3::timestamptz)
   AND (identifier.valid_to IS NULL OR identifier.valid_to > $3::timestamptz)
  WHERE thesis.user_id = $1::uuid
    AND thesis.valid_from <= $3::timestamptz
    AND (thesis.valid_to IS NULL OR thesis.valid_to > $3::timestamptz)
    AND NOT EXISTS (
      SELECT 1
      FROM personalization.thesis_revision successor
      WHERE successor.user_id = thesis.user_id
        AND successor.security_entity_id = thesis.security_entity_id
        AND successor.supersedes_thesis_revision_id = thesis.thesis_revision_id
        AND successor.valid_from <= $3::timestamptz
    )
  ORDER BY thesis.revision_no DESC, thesis.thesis_revision_id DESC
  LIMIT 1
`;

const THESIS_HEAD_LOCK_SQL = `
  WITH security AS MATERIALIZED (
    SELECT identifier.entity_id AS security_entity_id
    FROM core.entity_identifier identifier
    WHERE identifier.identifier_type = 'INTERNAL_KEY'
      AND identifier.identifier_value = $2::text
      AND (identifier.valid_from IS NULL OR identifier.valid_from <= $3::timestamptz)
      AND (identifier.valid_to IS NULL OR identifier.valid_to > $3::timestamptz)
    ORDER BY identifier.valid_from DESC NULLS LAST, identifier.identifier_id DESC
    LIMIT 1
  ), locked AS MATERIALIZED (
    SELECT
      security.security_entity_id,
      pg_advisory_xact_lock(
        hashtextextended('p4-thesis:' || $1::text || ':' || security.security_entity_id::text, 0)
      ) AS lock_token
    FROM security
  ), head AS (
    SELECT thesis.thesis_revision_id, thesis.revision_no
    FROM personalization.thesis_revision thesis
    JOIN locked ON locked.security_entity_id = thesis.security_entity_id
    WHERE thesis.user_id = $1::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM personalization.thesis_revision successor
        WHERE successor.user_id = thesis.user_id
          AND successor.security_entity_id = thesis.security_entity_id
          AND successor.supersedes_thesis_revision_id = thesis.thesis_revision_id
      )
    ORDER BY thesis.revision_no DESC, thesis.thesis_revision_id DESC
    LIMIT 1
  )
  SELECT
    locked.security_entity_id,
    head.thesis_revision_id AS predecessor_id,
    coalesce(head.revision_no, 0) + 1 AS next_revision_no
  FROM locked
  LEFT JOIN head ON true
`;

const THESIS_INSERT_SQL = `
  INSERT INTO personalization.thesis_revision (
    thesis_revision_id,
    user_id,
    security_entity_id,
    revision_no,
    supersedes_thesis_revision_id,
    thesis_text,
    evidence_refs,
    counter_evidence,
    invalidation_conditions,
    status,
    valid_from,
    valid_to,
    source_kind
  ) VALUES (
    $1::uuid,
    $2::uuid,
    $3::bigint,
    $4::integer,
    $5::uuid,
    $6::text,
    $7::jsonb,
    $8::jsonb,
    $9::jsonb,
    'active',
    $10::timestamptz,
    NULL,
    'user_authored'
  )
  RETURNING
    thesis_revision_id,
    revision_no,
    source_kind,
    thesis_text,
    evidence_refs,
    counter_evidence,
    invalidation_conditions,
    status,
    valid_from,
    valid_to
`;

function requireEntityKey(entityKey: string): void {
  if (!entityKeyPattern.test(entityKey)) throw new Error('Thesis entity key is invalid');
}

function requireNow(now: Date | undefined): Date {
  const value = now ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new Error('Thesis request time is invalid');
  return value;
}

function toIso(value: string | Date, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Thesis ${field} is invalid`);
  return date.toISOString();
}

function toRevision(row: ThesisRow) {
  const revisionNo = Number(row.revision_no);
  if (!Number.isSafeInteger(revisionNo) || revisionNo < 1) {
    throw new Error('Thesis revision number is invalid');
  }
  return {
    thesisRevisionId: row.thesis_revision_id,
    revisionNo,
    sourceKind: row.source_kind,
    thesisText: row.thesis_text,
    evidenceRefs: row.evidence_refs,
    counterEvidence: row.counter_evidence,
    invalidationConditions: row.invalidation_conditions,
    status: row.status,
    validFrom: toIso(row.valid_from, 'valid from'),
    validTo: row.valid_to === null ? null : toIso(row.valid_to, 'valid to'),
  };
}

export async function getPersonalizationThesis(
  executor: PersonalizationThesisExecutor,
  options: GetPersonalizationThesisOptions,
): Promise<PersonalizationThesis> {
  requireEntityKey(options.entityKey);
  const now = requireNow(options.now);
  const rows = await executor.queryRows<ThesisRow>(THESIS_READ_SQL, [
    options.userScope.userId,
    options.entityKey,
    now.toISOString(),
  ]);
  return personalizationThesisSchema.parse({
    schemaVersion: 'p4.v1',
    availability: rows[0] ? 'available' : 'missing',
    entityKey: options.entityKey,
    revision: rows[0] ? toRevision(rows[0]) : null,
  });
}

export async function appendUserThesisRevision(
  executor: PersonalizationThesisExecutor,
  options: AppendUserThesisRevisionOptions,
): Promise<PersonalizationThesis> {
  requireEntityKey(options.entityKey);
  const now = requireNow(options.now);
  const input = personalizationThesisWriteInputSchema.parse(options.input);
  const headRows = await executor.queryRows<HeadRow>(THESIS_HEAD_LOCK_SQL, [
    options.userScope.userId,
    options.entityKey,
    now.toISOString(),
  ]);
  const head = headRows[0];
  if (!head) throw new Error('Thesis security identity could not be resolved');
  const revisionNo = Number(head.next_revision_no);
  if (!Number.isSafeInteger(revisionNo) || revisionNo < 1) {
    throw new Error('Thesis successor revision number is invalid');
  }
  const revisionId = (options.generateId ?? randomUUID)();
  const rows = await executor.queryRows<ThesisRow>(THESIS_INSERT_SQL, [
    revisionId,
    options.userScope.userId,
    head.security_entity_id,
    revisionNo,
    head.predecessor_id,
    input.thesisText,
    JSON.stringify(input.evidenceRefs),
    JSON.stringify(input.counterEvidence),
    JSON.stringify(input.invalidationConditions),
    now.toISOString(),
  ]);
  const row = rows[0];
  if (!row) throw new Error('Thesis revision insert returned no row');
  return personalizationThesisSchema.parse({
    schemaVersion: 'p4.v1',
    availability: 'available',
    entityKey: options.entityKey,
    revision: toRevision(row),
  });
}
