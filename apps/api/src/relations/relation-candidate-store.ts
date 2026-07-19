import type { PoolClient, QueryResultRow } from 'pg';

// B6 — relation candidate persister. Bridges builder drafts into the B5
// temporal relation ledger: evidence rows first (so the accepted-revision
// guard trigger can see them), then the revision through the append-only
// store. Policy and persistence status must agree — defense in depth against
// a builder bug promoting an unqualified candidate.

import { canonicalJsonClone, sha256, type RelationCandidateDraft } from './builder-core.ts';
import {
  appendModelConfigRelationEvidence,
  appendRelationRevision,
  appendSourceRevisionRelationEvidence,
} from '../knowledge/relation-ledger.ts';

function positiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return parsed;
}

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
  confidence: number | ((candidate: RelationCandidateDraft) => number);
};

export type PersistedRelationCandidate = {
  predicate: string;
  relationIdentityId: number;
  relationRevisionId: number;
  revisionNo: number;
  revisionStatus: 'accepted' | 'quarantined_unverified';
  evidenceInserted: number;
  outcome: 'inserted' | 'replayed';
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
    const upserted = await client.query<QueryResultRow & { relation_identity_id: string | number }>(
      IDENTITY_UPSERT_SQL,
      [candidate.subjectEntityId, candidate.predicate, candidate.objectEntityId, identityHash],
    );
    const identityRow =
      upserted.rows[0] ??
      (
        await client.query<QueryResultRow & { relation_identity_id: string | number }>(
          IDENTITY_READ_SQL,
          [candidate.subjectEntityId, candidate.predicate, candidate.objectEntityId],
        )
      ).rows[0];
    if (identityRow === undefined) {
      throw new Error('relation identity upsert/readback failed');
    }
    const relationIdentityId = positiveInteger(
      identityRow.relation_identity_id,
      'relationIdentityId',
    );

    // Evidence FIRST — the accepted-revision guard trigger requires
    // qualifying evidence bound to the payload hash to already exist.
    let evidenceInserted = 0;
    if (candidate.modelConfig !== undefined && candidate.modelConfig !== null) {
      const modelConfig = canonicalJsonClone(
        candidate.modelConfig,
        'candidate model config evidence',
      );
      const inserted = await appendModelConfigRelationEvidence(client, {
        relationIdentityId,
        relationPayloadHash: candidate.payloadHash,
        modelConfig,
        evidenceText: `Exact model configuration for ${candidate.predicate}`,
        evidenceHash: sha256(
          JSON.stringify({
            kind: 'model_config',
            relationPayloadHash: candidate.payloadHash,
            modelConfig,
          }),
        ),
      });
      if (inserted) evidenceInserted += 1;
    } else if (
      candidate.predicate === 'PRODUCT_SIMILARITY' &&
      candidate.targetRevisionStatus === 'accepted'
    ) {
      throw new Error('accepted PRODUCT_SIMILARITY requires exact model config evidence');
    }
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

    const confidence =
      typeof options.confidence === 'function' ? options.confidence(candidate) : options.confidence;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`confidence must be within [0,1] for ${candidate.predicate}`);
    }
    const revision = await appendRelationRevision(client, {
      relationIdentityId,
      predicateOntologyRevisionId: ontologyRevisionId as number,
      relationKind: candidate.relationKind,
      confidence,
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
      revisionStatus: candidate.targetRevisionStatus,
      evidenceInserted,
      outcome: revision.outcome,
    });
  }

  return { persisted };
}
