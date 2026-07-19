// B6 — supply/customer chain builder (master plan §4.3).
// Disclosed supplier/customer links become directed SUPPLIES and inverse
// CUSTOMER_OF candidates bound to the same immutable source revision.
// Undisclosed chains are unknown/not_disclosed — absence emits nothing.

import {
  assertPositiveInt,
  assertValidTimestamp,
  decideCandidate,
  parseAsOf,
  relationPayloadHash,
  sortCandidates,
  sourceRevisionEvidence,
  type BuilderResult,
  type BuilderRunOptions,
  type RelationCandidateDraft,
} from '../builder-core.ts';

export type SupplyChainObservation = {
  supplierEntityId: number;
  customerEntityId: number;
  disclosureKind: 'supplier_disclosed' | 'customer_disclosed' | 'both_disclosed';
  sourceRevisionId: number;
  availableAt: string;
  validFrom: string;
};

export function buildSupplyChainCandidates(
  observations: readonly SupplyChainObservation[],
  options: BuilderRunOptions,
): BuilderResult {
  const asOfMs = parseAsOf(options);

  type GroupState = {
    observation: SupplyChainObservation;
    /** Canonical earliest validFrom across grouped observations (order-insensitive). */
    validFrom: string;
    sourceRevisions: Map<number, SupplyChainObservation>;
  };
  const groups = new Map<string, GroupState>();

  for (const observation of observations) {
    assertPositiveInt(observation.supplierEntityId, 'supplierEntityId');
    assertPositiveInt(observation.customerEntityId, 'customerEntityId');
    assertPositiveInt(observation.sourceRevisionId, 'sourceRevisionId');
    assertValidTimestamp(observation.availableAt, 'availableAt');
    assertValidTimestamp(observation.validFrom, 'validFrom');
    if (observation.supplierEntityId === observation.customerEntityId) {
      throw new Error('supply chain link must connect two distinct entities');
    }
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;

    const key = `${observation.supplierEntityId}|${observation.customerEntityId}`;
    const group = groups.get(key) ?? {
      observation,
      validFrom: observation.validFrom,
      sourceRevisions: new Map<number, SupplyChainObservation>(),
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
    const revisions = [...group.sourceRevisions.values()].sort(
      (a, b) => a.sourceRevisionId - b.sourceRevisionId,
    );

    const directions = [
      {
        predicate: 'SUPPLIES' as const,
        subjectEntityId: observation.supplierEntityId,
        objectEntityId: observation.customerEntityId,
      },
      {
        predicate: 'CUSTOMER_OF' as const,
        subjectEntityId: observation.customerEntityId,
        objectEntityId: observation.supplierEntityId,
      },
    ];

    for (const direction of directions) {
      const payloadHash = relationPayloadHash({
        predicate: direction.predicate,
        subjectEntityId: direction.subjectEntityId,
        objectEntityId: direction.objectEntityId,
        validFrom: group.validFrom,
      });
      const evidence = revisions.map((row) =>
        sourceRevisionEvidence({
          sourceRevisionId: row.sourceRevisionId,
          payloadHash,
          evidenceText:
            `Disclosed supply-chain link supplier=${observation.supplierEntityId} ` +
            `customer=${observation.customerEntityId} (${row.disclosureKind}) ` +
            `from immutable source revision ${row.sourceRevisionId}`,
          validFrom: row.validFrom,
        }),
      );
      const decision = decideCandidate({
        predicate: direction.predicate,
        evidence,
        hasModelConfigEvidence: false,
        subjectDegree: 1,
        objectDegree: 1,
      });
      candidates.push({
        predicate: direction.predicate,
        subjectEntityId: direction.subjectEntityId,
        objectEntityId: direction.objectEntityId,
        relationKind: 'structural',
        validFrom: group.validFrom,
        payloadHash,
        evidence,
        ...decision,
        metadata: {
          builder: 'supply-chain-v1',
          disclosureKind: observation.disclosureKind,
          absenceSemantics: 'unknown_not_disclosed',
        },
      });
    }
  }

  return { candidates: sortCandidates(candidates), exclusions: [] };
}
