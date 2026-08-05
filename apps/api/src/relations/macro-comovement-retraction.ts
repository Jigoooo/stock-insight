// Retraction for MACRO_COMOVEMENT.
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
import type { MacroComovementMeasuredAbsence } from './macro-comovement-model.ts';
import { appendRelationRevision } from '../knowledge/relation-ledger.ts';

/**
 * Same canonical undirected ordering the builder uses to mint the identity:
 * subject is the smaller entity id. Looking a pair up in any other order finds
 * nothing and silently retracts nothing.
 */
export function canonicalPairKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

/** Accepted MACRO_COMOVEMENT edges as of now, with what a retraction must carry forward. */
export const ACCEPTED_MACRO_IDENTITIES_SQL = `
SELECT identity_row.relation_identity_id,
       identity_row.subject_entity_id,
       identity_row.object_entity_id,
       revision.relation_kind,
       revision.valid_from,
       revision.predicate_ontology_revision_id
FROM knowledge.relation_identity identity_row
JOIN knowledge.relation_revision revision
  ON revision.relation_identity_id = identity_row.relation_identity_id
WHERE identity_row.predicate = 'MACRO_COMOVEMENT'
  AND revision.revision_status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM knowledge.relation_revision newer
    WHERE newer.relation_identity_id = revision.relation_identity_id
      AND newer.revision_no > revision.revision_no
  )
ORDER BY identity_row.relation_identity_id
`;

export type AcceptedMacroIdentity = {
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
export function planMacroRetractions(
  accepted: readonly AcceptedMacroIdentity[],
  measuredBelowThreshold: readonly MacroComovementMeasuredAbsence[],
): { identity: AcceptedMacroIdentity; measurement: MacroComovementMeasuredAbsence }[] {
  const measuredByPair = new Map<string, MacroComovementMeasuredAbsence>();
  for (const measurement of measuredBelowThreshold) {
    measuredByPair.set(
      canonicalPairKey(measurement.seriesEntityId, measurement.stockEntityId),
      measurement,
    );
  }
  const planned: {
    identity: AcceptedMacroIdentity;
    measurement: MacroComovementMeasuredAbsence;
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
export function retractionPayloadHash(subjectEntityId: number, objectEntityId: number): string {
  return relationPayloadHash({
    predicate: 'MACRO_COMOVEMENT',
    subjectEntityId,
    objectEntityId,
    retracted: true,
  });
}

type MacroClient = {
  query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }>;
};

/** Read-only: what a run WOULD retract. Shared by the dry run and the apply path. */
export async function planMacroRetractionsFromDatabase(
  client: MacroClient,
  measuredBelowThreshold: readonly MacroComovementMeasuredAbsence[],
): Promise<{
  inspected: number;
  planned: { identity: AcceptedMacroIdentity; measurement: MacroComovementMeasuredAbsence }[];
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
  >(ACCEPTED_MACRO_IDENTITIES_SQL, []);
  const accepted: AcceptedMacroIdentity[] = rows.rows.map((row) => ({
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
    planned: planMacroRetractions(accepted, measuredBelowThreshold),
  };
}

export async function retractMacroComovementEdges(
  client: PoolClient,
  measuredBelowThreshold: readonly MacroComovementMeasuredAbsence[],
): Promise<{ inspected: number; retracted: number; replayed: number }> {
  const { inspected, planned } = await planMacroRetractionsFromDatabase(
    client,
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
      payloadHash: retractionPayloadHash(identity.subjectEntityId, identity.objectEntityId),
      metadata: {
        retractedBy: 'macro-comovement-below-threshold',
        measuredCorrelation: measurement.correlation,
        overlappingObservations: measurement.overlappingObservations,
        lastObservedDate: measurement.lastObservedDate,
        interpretation: 'measured_and_did_not_hold_not_absent',
      },
    });
    if (result.outcome === 'inserted') retracted += 1;
    else replayed += 1;
  }
  return { inspected, retracted, replayed };
}
