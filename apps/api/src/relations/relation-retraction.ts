// Retraction for exhaustively-computed predicates.
//
// Used by MACRO_COMOVEMENT and PRODUCT_SIMILARITY: both score EVERY pair every
// run, so a pair's absence from the output is a verdict rather than a silence.
// SAME_ETF_BASKET is deliberately NOT here — co-membership is not a score, and
// one failed holdings collection would read as "these stocks left the basket".
//
// A builder that stops producing a pair used to leave its last acceptance
// standing forever, so the graph became the union of every run that ever
// accepted it. Measured 2026-08-05: beta adjustment cut the accepted candidates
// to 23 while snapshot 22 still carried 36 edges — Alphabet, Meta, GS and C
// against WTI at their pre-adjustment confidence.
//
// Retraction is an APPEND, never an edit: knowledge.relation_revision is
// immutable, and rewriting a past acceptance would destroy the record that we
// once believed it. A later `rejected` revision states the newer verdict, and
// the snapshot selector prefers the latest verdict.
//
// The rule that makes this safe: retract only what this run MEASURED and found
// below threshold. Absence is not a verdict — a pair can be missing because the
// overlap was too short, because an input never loaded, or because the degree
// cap dropped it, and none of those mean the relation stopped holding.

import type { PoolClient, QueryResultRow } from 'pg';

import { relationPayloadHash } from './builder-core.ts';
/**
 * The only shape a retraction needs: which pair was measured, and what the
 * measurement was. Each predicate's model names its number differently, so the
 * caller maps into this rather than this knowing about every model.
 */
export type MeasuredAbsence = {
  subjectEntityId: number;
  objectEntityId: number;
  /** The value that failed the threshold, kept for the retraction's metadata. */
  measuredValue: number;
  /** Free-form detail recorded alongside the verdict. */
  detail?: Record<string, unknown>;
};
import { appendRelationRevision } from '../knowledge/relation-ledger.ts';

/**
 * Same canonical undirected ordering the builder uses to mint the identity:
 * subject is the smaller entity id. Looking a pair up in any other order finds
 * nothing and silently retracts nothing.
 */
export function canonicalPairKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

/** Accepted edges of one predicate as of now, with what a retraction must carry forward. */
export const ACCEPTED_IDENTITIES_SQL = `
SELECT identity_row.relation_identity_id,
       identity_row.subject_entity_id,
       identity_row.object_entity_id,
       revision.relation_kind,
       revision.valid_from,
       revision.predicate_ontology_revision_id
FROM knowledge.relation_identity identity_row
JOIN knowledge.relation_revision revision
  ON revision.relation_identity_id = identity_row.relation_identity_id
WHERE identity_row.predicate = $1
  AND revision.revision_status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM knowledge.relation_revision newer
    WHERE newer.relation_identity_id = revision.relation_identity_id
      AND newer.revision_no > revision.revision_no
  )
ORDER BY identity_row.relation_identity_id
`;

export type AcceptedIdentity = {
  relationIdentityId: number;
  subjectEntityId: number;
  objectEntityId: number;
  relationKind: string;
  validFrom: string;
  predicateOntologyRevisionId: number;
};

/**
 * Which accepted edges this run contradicts. Pure so the decision is testable
 * without a database — the dangerous half of retraction is choosing the set.
 */
export function planRetractions(
  accepted: readonly AcceptedIdentity[],
  measuredBelowThreshold: readonly MeasuredAbsence[],
): { identity: AcceptedIdentity; measurement: MeasuredAbsence }[] {
  const measuredByPair = new Map<string, MeasuredAbsence>();
  for (const measurement of measuredBelowThreshold) {
    measuredByPair.set(
      canonicalPairKey(measurement.subjectEntityId, measurement.objectEntityId),
      measurement,
    );
  }
  const planned: {
    identity: AcceptedIdentity;
    measurement: MeasuredAbsence;
  }[] = [];
  for (const identity of accepted) {
    const measurement = measuredByPair.get(
      canonicalPairKey(identity.subjectEntityId, identity.objectEntityId),
    );
    // No measurement for this pair means this run did not evaluate it. Leaving
    // the edge is the only honest option: we have nothing to contradict it with.
    if (measurement === undefined) continue;
    planned.push({ identity, measurement });
  }
  return planned;
}

/**
 * Stable across runs on purpose. The retraction states "this pair no longer
 * qualifies", which does not change as the window slides, so a re-run replays
 * the existing revision instead of appending a new one every day. The measured
 * correlation goes in metadata, where changing it does not churn the ledger.
 */
export function retractionPayloadHash(
  predicate: string,
  subjectEntityId: number,
  objectEntityId: number,
): string {
  return relationPayloadHash({
    predicate,
    subjectEntityId,
    objectEntityId,
    retracted: true,
  });
}

type RetractionClient = {
  query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }>;
};

/** Read-only: what a run WOULD retract. Shared by the dry run and the apply path. */
export async function planRetractionsFromDatabase(
  client: RetractionClient,
  predicate: string,
  measuredBelowThreshold: readonly MeasuredAbsence[],
): Promise<{
  inspected: number;
  planned: { identity: AcceptedIdentity; measurement: MeasuredAbsence }[];
}> {
  if (measuredBelowThreshold.length === 0) return { inspected: 0, planned: [] };
  const rows = await client.query<
    QueryResultRow & {
      relation_identity_id: string | number;
      subject_entity_id: string | number;
      object_entity_id: string | number;
      relation_kind: string;
      valid_from: Date | string;
      predicate_ontology_revision_id: string | number;
    }
  >(ACCEPTED_IDENTITIES_SQL, [predicate]);
  const accepted: AcceptedIdentity[] = rows.rows.map((row) => ({
    relationIdentityId: Number(row.relation_identity_id),
    subjectEntityId: Number(row.subject_entity_id),
    objectEntityId: Number(row.object_entity_id),
    relationKind: row.relation_kind,
    validFrom:
      row.valid_from instanceof Date
        ? row.valid_from.toISOString()
        : new Date(row.valid_from).toISOString(),
    predicateOntologyRevisionId: Number(row.predicate_ontology_revision_id),
  }));
  return {
    inspected: accepted.length,
    planned: planRetractions(accepted, measuredBelowThreshold),
  };
}

export async function retractEdges(
  client: PoolClient,
  predicate: string,
  retractedBy: string,
  measuredBelowThreshold: readonly MeasuredAbsence[],
): Promise<{ inspected: number; retracted: number; replayed: number }> {
  const { inspected, planned } = await planRetractionsFromDatabase(
    client,
    predicate,
    measuredBelowThreshold,
  );
  let retracted = 0;
  let replayed = 0;
  for (const { identity, measurement } of planned) {
    const result = await appendRelationRevision(client, {
      relationIdentityId: identity.relationIdentityId,
      predicateOntologyRevisionId: identity.predicateOntologyRevisionId,
      relationKind: identity.relationKind,
      // Confidence is the strength of a relation being asserted. A retraction
      // asserts none.
      confidence: 0,
      revisionStatus: 'rejected',
      // Carried forward, not stamped with today: re-stamping would make every
      // run a new revision and the ledger would grow without saying anything new.
      validFrom: identity.validFrom,
      payloadHash: retractionPayloadHash(
        predicate,
        identity.subjectEntityId,
        identity.objectEntityId,
      ),
      metadata: {
        retractedBy,
        measuredValue: measurement.measuredValue,
        ...(measurement.detail ?? {}),
        interpretation: 'measured_and_did_not_hold_not_absent',
      },
    });
    if (result.outcome === 'inserted') retracted += 1;
    else replayed += 1;
  }
  return { inspected, retracted, replayed };
}
