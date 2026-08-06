import { createHash } from 'node:crypto';

export type KnowledgeSyncPlan = {
  unpromoted: number;
  revision_drift: number;
  chunks_missing: number;
};

export type KnowledgeSnapshotEvidence = {
  kind: 'claim' | 'event';
  id: number | string;
  chunkId: number | string;
  revisionNo: number;
};

export function normalizeSourceRevision(value: unknown): number {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`invalid source revision: ${JSON.stringify(value)}`);
  }
  const revision = Number(raw);
  if (!Number.isSafeInteger(revision)) {
    throw new Error(`source revision is outside the safe integer range: ${raw}`);
  }
  return revision;
}

/**
 * Document-scoped identity for a claim, mirroring buildRevisionEventDedupeKey.
 *
 * Scoped to the document ON PURPOSE. This stops one document producing the same
 * claim twice (34 such duplicates measured 2026-08-06); it deliberately does NOT
 * collapse the same claim reported by two documents. That is a different question
 * with a time dimension — two reports days apart are one claim, months apart are
 * two — and run-claim-merge answers it with a measured 7-day window, attaching the
 * second document as evidence rather than discarding a row.
 */
export function buildClaimDedupeKey(input: {
  documentId: number;
  revisionNo: number;
  predicate: string;
  subjectMention: string;
  objectText: string;
}): string {
  const revisionNo = normalizeSourceRevision(input.revisionNo);
  const predicate = input.predicate.trim().toLowerCase();
  const norm = (value: string): string =>
    value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  const subject = norm(input.subjectMention);
  const object = norm(input.objectText);
  if (!Number.isSafeInteger(input.documentId) || input.documentId < 1 || !predicate || !subject) {
    throw new Error('claim identity is incomplete');
  }
  return `extract-claim-v1:${input.documentId}:r${revisionNo}:${predicate}:${subject}:${object}`;
}

export function buildRevisionEventDedupeKey(input: {
  documentId: number;
  revisionNo: number;
  eventType: string;
  targetMention: string;
}): string {
  const revisionNo = normalizeSourceRevision(input.revisionNo);
  const eventType = input.eventType.trim().toLowerCase();
  const targetMention = input.targetMention.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  if (
    !Number.isSafeInteger(input.documentId) ||
    input.documentId < 1 ||
    !eventType ||
    !targetMention
  ) {
    throw new Error('event revision identity is incomplete');
  }
  return `extract-v2:${input.documentId}:r${revisionNo}:${eventType}:${targetMention}`;
}

// The same identity with the revision removed: what the observed fact is, as
// opposed to which extraction of it this row is. Migration 062 backfilled
// knowledge.event.event_key by stripping ':r{n}' out of existing dedupe keys, so
// this must normalise exactly as buildRevisionEventDedupeKey does or new rows will
// not line up with the ones already stored.
export function buildEventKey(input: {
  documentId: number;
  eventType: string;
  targetMention: string;
}): string {
  const eventType = input.eventType.trim().toLowerCase();
  const targetMention = input.targetMention.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  if (
    !Number.isSafeInteger(input.documentId) ||
    input.documentId < 1 ||
    !eventType ||
    !targetMention
  ) {
    throw new Error('event identity is incomplete');
  }
  return `extract-v2:${input.documentId}:${eventType}:${targetMention}`;
}

export function assertKnowledgeSyncComplete(plan: KnowledgeSyncPlan): void {
  const unresolved = (['unpromoted', 'revision_drift', 'chunks_missing'] as const)
    .map((key) => [key, plan[key]] as const)
    .filter(([, value]) => value !== 0);
  if (unresolved.length > 0) {
    throw new Error(
      `knowledge sync left unresolved rows: ${unresolved.map(([key, value]) => `${key}=${value}`).join(', ')}`,
    );
  }
}

export function buildKnowledgeSnapshotId(
  asOf: string,
  evidence: readonly KnowledgeSnapshotEvidence[],
): string {
  const normalizedAsOf = new Date(asOf).toISOString();
  const rows = evidence
    .map((row) => ({
      kind: row.kind,
      id: String(row.id),
      chunkId: String(row.chunkId),
      revisionNo: normalizeSourceRevision(row.revisionNo),
    }))
    .sort((left, right) =>
      [left.kind, left.id, left.chunkId, String(left.revisionNo)]
        .join(':')
        .localeCompare([right.kind, right.id, right.chunkId, String(right.revisionNo)].join(':')),
    );
  const digest = createHash('sha256')
    .update(JSON.stringify({ asOf: normalizedAsOf, evidence: rows }))
    .digest('hex');
  return `knowledge@${normalizedAsOf}#${digest}`;
}
