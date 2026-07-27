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

export function assertKnowledgeSyncComplete(plan: KnowledgeSyncPlan): void {
  const unresolved = Object.entries(plan).filter(([, value]) => value !== 0);
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
