import type { PoolClient, QueryResultRow } from 'pg';

// B6 — relation candidate persister. Bridges builder drafts into the B5
// temporal relation ledger: evidence rows first (so the accepted-revision
// guard trigger can see them), then the revision through the append-only
// store. Policy and persistence status must agree — defense in depth against
// a builder bug promoting an unqualified candidate.

import type { RelationCandidateDraft } from './builder-core.ts';
import {
  appendRelationRevision,
  appendSourceRevisionRelationEvidence,
} from '../knowledge/relation-ledger.ts';

const IDENTITY_UPSERT_SQL = `
INSERT INTO knowledge.relation_identity (subject_entity_id, predicate, object_entity_id, identity_hash)
VALUES ($1, $2, $3, $4)
ON CONFLICT (subject_entity_id, predicate, object_entity_id) DO NOTHING
RETURNING relation_identity_id
`;

const IDENTITY_READ_SQL = `
SELECT relation_identity_id
FROM knowledge.relation_identity
WHERE subject_entity_id=$1 AND predicate=$2 AND object_entity_id=$3
`;

export type PersistRelationCandidatesOptions = {
  /** Approved predicate ontology revision id per predicate — fail-closed when missing. */
  predicateOntologyRevisionIds: Record<string, number>;
  /** Confidence recorded on the revision row. */
  confidence: number;
};

export type PersistedRelationCandidate = {
  predicate: string;
  relationIdentityId: number;
  relationRevisionId: number;
  revisionNo: number;
  revisionStatus: 'accepted' | 'quarantined_unverified';
  evidenceInserted: number;
};

export type PersistRelationCandidatesResult = {
  persisted: PersistedRelationCandidate[];
};

export async function persistRelationCandidates(
  client: PoolClient,
  candidates: readonly RelationCandidateDraft[],
  options: PersistRelationCandidatesOptions,
): Promise<PersistRelationCandidatesResult> {
  const persisted: PersistedRelationCandidate[] = [];

  for (const candidate of candidates) {
    // Defense in depth: the persister re-derives the allowed status from the
    // policy decision and refuses inconsistent drafts outright.
    const allowedStatus =
      candidate.policyDecision.decision === 'accepted' ? 'accepted' : 'quarantined_unverified';
    if (candidate.targetRevisionStatus !== allowedStatus) {
      throw new Error(
        `inconsistent candidate: policy=${candidate.policyDecision.decision} ` +
          `but targetRevisionStatus=${candidate.targetRevisionStatus} ` +
          `(${candidate.predicate} ${candidate.subjectEntityId}->${candidate.objectEntityId})`,
      );
    }

    const ontologyRevisionId = options.predicateOntologyRevisionIds[candidate.predicate];
    if (!Number.isSafeInteger(ontologyRevisionId) || (ontologyRevisionId ?? 0) <= 0) {
      throw new Error(
        `no approved predicate ontology revision id configured for ${candidate.predicate}`,
      );
    }

    // Resolve (or create) the relation identity.
    const identityHash = candidate.payloadHash;
    const upserted = await client.query<QueryResultRow & { relation_identity_id: number }>(
      IDENTITY_UPSERT_SQL,
      [candidate.subjectEntityId, candidate.predicate, candidate.objectEntityId, identityHash],
    );
    const identityRow =
      upserted.rows[0] ??
      (
        await client.query<QueryResultRow & { relation_identity_id: number }>(IDENTITY_READ_SQL, [
          candidate.subjectEntityId,
          candidate.predicate,
          candidate.objectEntityId,
        ])
      ).rows[0];
    if (identityRow === undefined) {
      throw new Error('relation identity upsert/readback failed');
    }
    const relationIdentityId = identityRow.relation_identity_id;

    // Evidence FIRST — the accepted-revision guard trigger requires
    // qualifying evidence bound to the payload hash to already exist.
    let evidenceInserted = 0;
    for (const evidence of candidate.evidence) {
      const inserted = await appendSourceRevisionRelationEvidence(client, {
        relationIdentityId,
        sourceRevisionId: evidence.sourceRevisionId,
        relationPayloadHash: evidence.relationPayloadHash,
        evidenceText: evidence.evidenceText,
        evidenceHash: evidence.evidenceHash,
        validFrom: evidence.validFrom,
        metadata: { builder: candidate.metadata['builder'] ?? 'unknown' },
      });
      if (inserted) evidenceInserted += 1;
    }

    const revision = await appendRelationRevision(client, {
      relationIdentityId,
      predicateOntologyRevisionId: ontologyRevisionId as number,
      relationKind: candidate.relationKind,
      confidence: options.confidence,
      revisionStatus: allowedStatus,
      validFrom: candidate.validFrom,
      payloadHash: candidate.payloadHash,
      metadata: {
        ...candidate.metadata,
        policyReasons: candidate.policyDecision.reasons,
      },
    });

    persisted.push({
      predicate: candidate.predicate,
      relationIdentityId,
      relationRevisionId: revision.relationRevisionId,
      revisionNo: revision.revisionNo,
      revisionStatus: allowedStatus,
      evidenceInserted,
    });
  }

  return { persisted };
}
