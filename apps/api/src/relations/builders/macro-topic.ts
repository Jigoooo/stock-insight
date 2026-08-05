// Macro topic builder — MEASURED_BY.
//
// A macro topic and the FRED series that indicates it: `topic:energy`
// MEASURED_BY `fred:DCOILWTICO`. This is DEFINITIONAL, not measured. There is no
// correlation, no window and no model config, because nothing here was observed
// — the pair comes from analytics.macro_series_topic, a mapping this repository
// curates. Confidence is therefore not a statistic and is not scaled by data.
//
// Why the predicate exists: knowledge.event.target_entity_id is a SINGLE value,
// so an event about rates cannot attach to DGS10, DGS2, FEDFUNDS and WALCL at
// once, and run-event-text-attribution refuses to pick one. Attaching the event
// to the topic removes the ambiguity — a topic is always one — and this edge is
// what carries it back down to the series, and from there to stocks.
//
// Evidence is one source revision of the mapping snapshot. That is not a
// preference: migration 024's accepted-revision guard admits identity_mapping
// only for ISSUED_BY with a matching core.security_issuer_identity row, and
// admits claim/document/chunk only when a VERIFIED claim exists — production has
// zero verified claims. source_revision is the only door that opens, so the
// mapping we actually read is registered and cited.
//
// Direction. The pair is directional (topic -> series) and, unlike
// MACRO_COMOVEMENT, the endpoints are not interchangeable: a series indicates a
// topic, a topic does not indicate a series. So there is no canonical id
// ordering here — subject is always the topic.

import {
  assertPositiveInt,
  assertValidTimestamp,
  decideCandidate,
  parseAsOf,
  relationPayloadHash,
  sourceRevisionEvidence,
  type BuilderRunOptions,
  type RelationCandidateDraft,
  type RelationEvidenceDraft,
} from '../builder-core.ts';

export type MacroTopicObservation = {
  /** core.entity id of the 'topic:<key>' Metric entity. */
  topicEntityId: number;
  /** core.entity id of the 'fred:<series>' Metric entity. */
  seriesEntityId: number;
  topic: string;
  seriesKey: string;
  sourceRevisionId: number;
  /** ingestion.source_revision.available_at — PIT gate input. */
  availableAt: string;
  validFrom: string;
};

export type { RelationCandidateDraft, RelationEvidenceDraft };
export type BuildMacroTopicOptions = BuilderRunOptions;

export function buildMacroTopicCandidates(
  observations: readonly MacroTopicObservation[],
  options: BuildMacroTopicOptions,
): { candidates: RelationCandidateDraft[] } {
  const asOfMs = parseAsOf(options);
  const candidates: RelationCandidateDraft[] = [];
  const seen = new Set<string>();

  for (const observation of observations) {
    assertPositiveInt(observation.topicEntityId, 'topicEntityId');
    assertPositiveInt(observation.seriesEntityId, 'seriesEntityId');
    assertPositiveInt(observation.sourceRevisionId, 'sourceRevisionId');
    assertValidTimestamp(observation.availableAt, 'availableAt');
    assertValidTimestamp(observation.validFrom, 'validFrom');
    if (observation.topicEntityId === observation.seriesEntityId) {
      throw new Error('a topic cannot be its own indicator');
    }
    // Point-in-time gate: a revision that became available after asOf did not
    // exist for this run and must not back-date an edge.
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;

    // One mapping row, one edge. A duplicate would mint a second revision of the
    // same identity within a single run and make the ledger say the mapping
    // changed when it did not.
    const pairKey = `${observation.topicEntityId}:${observation.seriesEntityId}`;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    const payloadHash = relationPayloadHash({
      predicate: 'MEASURED_BY',
      subjectEntityId: observation.topicEntityId,
      objectEntityId: observation.seriesEntityId,
      topic: observation.topic,
      seriesKey: observation.seriesKey,
    });

    const evidence = [
      sourceRevisionEvidence({
        sourceRevisionId: observation.sourceRevisionId,
        payloadHash,
        evidenceText:
          `Curated mapping: macro topic '${observation.topic}' is indicated by series ` +
          `'${observation.seriesKey}', from immutable source revision ${observation.sourceRevisionId}`,
        validFrom: observation.validFrom,
      }),
    ];

    const decision = decideCandidate({
      predicate: 'MEASURED_BY',
      evidence,
      // Definitional, so there is no model to bind. The policy row agrees
      // (requiresModelConfig: false) — attaching one would imply a measurement
      // that never happened.
      hasModelConfigEvidence: false,
      // A topic legitimately has several series and a series belongs to one
      // topic; the policy row carries superhubDegreeCap: null because the
      // measured width is 4 series at most.
      subjectDegree: 1,
      objectDegree: 1,
    });

    candidates.push({
      predicate: 'MEASURED_BY',
      subjectEntityId: observation.topicEntityId,
      objectEntityId: observation.seriesEntityId,
      relationKind: 'structural',
      validFrom: observation.validFrom,
      payloadHash,
      evidence,
      ...decision,
      metadata: {
        builder: 'macro-topic-v1',
        topic: observation.topic,
        seriesKey: observation.seriesKey,
        interpretation: 'curated_definition_not_measurement',
      },
    });
  }

  candidates.sort(
    (left, right) =>
      left.subjectEntityId - right.subjectEntityId || left.objectEntityId - right.objectEntityId,
  );
  return { candidates };
}
