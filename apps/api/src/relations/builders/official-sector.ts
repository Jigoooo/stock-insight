// B6 tracer bullet — official sector builder (master plan §4.1, §8 B6).
// Consumes point-in-time taxonomy membership observations that are ALREADY
// bound to exact immutable ingestion.source_revision rows, and emits
// CLASSIFIED_AS relation candidates. GICS (or any non-approved scheme) is
// rejected fail-closed; unclassified entities stay unknown (no candidate).

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

const APPROVED_TAXONOMY_SYSTEMS = new Set(['SIC', 'KSIC']);

export type OfficialSectorObservation = {
  subjectEntityId: number;
  /** core.entity id representing the taxonomy node (Industry entity). */
  taxonomyEntityId: number;
  taxonomySystem: 'SIC' | 'KSIC';
  taxonomyCode: string;
  classificationStatus: 'source_reported' | 'verified' | 'unclassified';
  sourceRevisionId: number;
  /** ingestion.source_revision.available_at — PIT gate input. */
  availableAt: string;
  validFrom: string;
};

export type { RelationCandidateDraft, RelationEvidenceDraft };
export type BuildOfficialSectorOptions = BuilderRunOptions;

function assertValidObservation(observation: OfficialSectorObservation): void {
  if (!APPROVED_TAXONOMY_SYSTEMS.has(observation.taxonomySystem)) {
    throw new Error(
      `taxonomy system not approved for canonical classification: ${observation.taxonomySystem}`,
    );
  }
  assertPositiveInt(observation.subjectEntityId, 'subjectEntityId');
  assertPositiveInt(observation.taxonomyEntityId, 'taxonomyEntityId');
  assertPositiveInt(observation.sourceRevisionId, 'sourceRevisionId');
  assertValidTimestamp(observation.availableAt, 'availableAt');
  assertValidTimestamp(observation.validFrom, 'validFrom');
}

export function buildOfficialSectorCandidates(
  observations: readonly OfficialSectorObservation[],
  options: BuildOfficialSectorOptions,
): RelationCandidateDraft[] {
  const asOfMs = parseAsOf(options);

  type GroupState = {
    observation: OfficialSectorObservation;
    /** Canonical earliest validFrom across grouped observations (order-insensitive). */
    validFrom: string;
    sourceRevisions: Map<number, OfficialSectorObservation>;
  };
  const groups = new Map<string, GroupState>();

  for (const observation of observations) {
    assertValidObservation(observation);
    // Unknown/unclassified stays unknown: emit nothing, assert nothing.
    if (observation.classificationStatus === 'unclassified') continue;
    // PIT gate: a revision published after the run cutoff does not exist yet.
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;

    const key = [
      observation.subjectEntityId,
      observation.taxonomyEntityId,
      observation.taxonomySystem,
      observation.taxonomyCode,
    ].join('|');
    const group = groups.get(key) ?? {
      observation,
      validFrom: observation.validFrom,
      sourceRevisions: new Map<number, OfficialSectorObservation>(),
    };
    if (!group.sourceRevisions.has(observation.sourceRevisionId)) {
      group.sourceRevisions.set(observation.sourceRevisionId, observation);
    }
    if (observation.validFrom < group.validFrom) group.validFrom = observation.validFrom;
    groups.set(key, group);
  }

  const candidates: RelationCandidateDraft[] = [];
  for (const group of groups.values()) {
    const { observation } = group;
    const payloadHash = relationPayloadHash({
      predicate: 'CLASSIFIED_AS',
      subjectEntityId: observation.subjectEntityId,
      objectEntityId: observation.taxonomyEntityId,
      taxonomySystem: observation.taxonomySystem,
      taxonomyCode: observation.taxonomyCode,
      validFrom: group.validFrom,
    });

    const evidence = [...group.sourceRevisions.values()]
      .sort((a, b) => a.sourceRevisionId - b.sourceRevisionId)
      .map((row) =>
        sourceRevisionEvidence({
          sourceRevisionId: row.sourceRevisionId,
          payloadHash,
          evidenceText:
            `Official ${row.taxonomySystem} classification ${row.taxonomyCode} ` +
            `for entity ${row.subjectEntityId} from immutable source revision ${row.sourceRevisionId}`,
          validFrom: row.validFrom,
        }),
      );

    const decision = decideCandidate({
      predicate: 'CLASSIFIED_AS',
      evidence,
      hasModelConfigEvidence: false,
      // Official classification is entity→taxonomy-node; taxonomy nodes are
      // legitimate hubs (policy row carries superhubDegreeCap=null).
      subjectDegree: 1,
      objectDegree: 1,
    });

    candidates.push({
      predicate: 'CLASSIFIED_AS',
      subjectEntityId: observation.subjectEntityId,
      objectEntityId: observation.taxonomyEntityId,
      relationKind: 'structural',
      validFrom: group.validFrom,
      payloadHash,
      evidence,
      ...decision,
      metadata: {
        builder: 'official-sector-v1',
        taxonomySystem: observation.taxonomySystem,
        taxonomyCode: observation.taxonomyCode,
        classificationStatus: observation.classificationStatus,
      },
    });
  }

  return candidates.sort(
    (a, b) => a.subjectEntityId - b.subjectEntityId || a.objectEntityId - b.objectEntityId,
  );
}
