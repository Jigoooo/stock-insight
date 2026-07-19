// B6 — ownership builder (master plan §4.5, Antón–Polk FCAP guidance).
// direct stakes → OWNS (owner→owned); institutional filings → HELD_BY
// (security→holder); pairs of holdings by one owner → COMMON_OWNER with a
// universal-owner superhub degree cap. 13F/holdings never participate before
// filing available_at (PIT gate).

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
  type SuperhubExclusion,
} from '../builder-core.ts';
import { getRelationBuilderPolicy } from '../relation-policy.ts';

export type OwnershipObservation = {
  ownerEntityId: number;
  ownedEntityId: number;
  ownershipKind: 'direct' | 'institutional_holding';
  sourceRevisionId: number;
  availableAt: string;
  validFrom: string;
};

export function buildOwnershipCandidates(
  observations: readonly OwnershipObservation[],
  options: BuilderRunOptions,
): BuilderResult {
  const asOfMs = parseAsOf(options);

  const visible: OwnershipObservation[] = [];
  for (const observation of observations) {
    assertPositiveInt(observation.ownerEntityId, 'ownerEntityId');
    assertPositiveInt(observation.ownedEntityId, 'ownedEntityId');
    assertPositiveInt(observation.sourceRevisionId, 'sourceRevisionId');
    assertValidTimestamp(observation.availableAt, 'availableAt');
    assertValidTimestamp(observation.validFrom, 'validFrom');
    if (observation.ownerEntityId === observation.ownedEntityId) {
      throw new Error('ownership link must connect two distinct entities');
    }
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;
    visible.push(observation);
  }

  const candidates: RelationCandidateDraft[] = [];
  const exclusions: SuperhubExclusion[] = [];

  // ── direct stakes → OWNS; institutional filings → HELD_BY ────────────────
  type PairState = {
    observation: OwnershipObservation;
    /** Canonical earliest validFrom across grouped observations (order-insensitive). */
    validFrom: string;
    revisions: Map<number, OwnershipObservation>;
  };
  const directPairs = new Map<string, PairState>();
  const holdingPairs = new Map<string, PairState>();
  for (const observation of visible) {
    const target = observation.ownershipKind === 'direct' ? directPairs : holdingPairs;
    const key = `${observation.ownerEntityId}|${observation.ownedEntityId}`;
    const state = target.get(key) ?? {
      observation,
      validFrom: observation.validFrom,
      revisions: new Map<number, OwnershipObservation>(),
    };
    if (!state.revisions.has(observation.sourceRevisionId)) {
      state.revisions.set(observation.sourceRevisionId, observation);
    }
    if (observation.validFrom < state.validFrom) state.validFrom = observation.validFrom;
    target.set(key, state);
  }

  const emitDirectional = (
    state: PairState,
    predicate: 'OWNS' | 'HELD_BY',
    subjectEntityId: number,
    objectEntityId: number,
    evidenceLabel: string,
  ): void => {
    const { observation } = state;
    const payloadHash = relationPayloadHash({
      predicate,
      subjectEntityId,
      objectEntityId,
      validFrom: state.validFrom,
    });
    const evidence = [...state.revisions.values()]
      .sort((a, b) => a.sourceRevisionId - b.sourceRevisionId)
      .map((row) =>
        sourceRevisionEvidence({
          sourceRevisionId: row.sourceRevisionId,
          payloadHash,
          evidenceText:
            `${evidenceLabel} owner=${observation.ownerEntityId} ` +
            `owned=${observation.ownedEntityId} from immutable source revision ${row.sourceRevisionId}`,
          validFrom: row.validFrom,
        }),
      );
    const decision = decideCandidate({
      predicate,
      evidence,
      hasModelConfigEvidence: false,
      subjectDegree: 1,
      objectDegree: 1,
    });
    candidates.push({
      predicate,
      subjectEntityId,
      objectEntityId,
      relationKind: 'structural',
      validFrom: state.validFrom,
      payloadHash,
      evidence,
      ...decision,
      metadata: {
        builder: 'ownership-v1',
        ownershipKind: observation.ownershipKind,
      },
    });
  };

  for (const state of directPairs.values()) {
    emitDirectional(
      state,
      'OWNS',
      state.observation.ownerEntityId,
      state.observation.ownedEntityId,
      'Direct ownership stake',
    );
  }
  for (const state of holdingPairs.values()) {
    emitDirectional(
      state,
      'HELD_BY',
      state.observation.ownedEntityId,
      state.observation.ownerEntityId,
      'Institutional holding',
    );
  }

  // ── COMMON_OWNER pair expansion with universal-owner superhub cap ────────
  const commonOwnerCap = getRelationBuilderPolicy('COMMON_OWNER').superhubDegreeCap;
  const holdingsByOwner = new Map<number, Map<number, OwnershipObservation[]>>();
  for (const observation of visible) {
    if (observation.ownershipKind !== 'institutional_holding') continue;
    const byOwned = holdingsByOwner.get(observation.ownerEntityId) ?? new Map();
    const rows = byOwned.get(observation.ownedEntityId) ?? [];
    rows.push(observation);
    byOwned.set(observation.ownedEntityId, rows);
    holdingsByOwner.set(observation.ownerEntityId, byOwned);
  }

  type CommonOwnerContribution = {
    ownerEntityId: number;
    validFrom: string;
    subjectRows: OwnershipObservation[];
    objectRows: OwnershipObservation[];
  };
  const contributionsByPair = new Map<string, CommonOwnerContribution[]>();

  for (const [ownerEntityId, byOwned] of holdingsByOwner) {
    const ownedIds = [...byOwned.keys()].sort((a, b) => a - b);
    if (ownedIds.length < 2) continue;
    if (commonOwnerCap !== null && ownedIds.length > commonOwnerCap) {
      exclusions.push({
        reason: 'superhub_cap_exceeded',
        predicate: 'COMMON_OWNER',
        hubEntityId: ownerEntityId,
        memberCount: ownedIds.length,
        suppressedPairCount: (ownedIds.length * (ownedIds.length - 1)) / 2,
      });
      continue;
    }
    for (let i = 0; i < ownedIds.length; i += 1) {
      for (let j = i + 1; j < ownedIds.length; j += 1) {
        const subjectEntityId = ownedIds[i]!;
        const objectEntityId = ownedIds[j]!;
        const subjectRows = byOwned.get(subjectEntityId)!;
        const objectRows = byOwned.get(objectEntityId)!;
        const validFrom = [...subjectRows, ...objectRows]
          .map((row) => row.validFrom)
          .sort()
          .at(-1)!;
        const pairKey = `${subjectEntityId}|${objectEntityId}`;
        const contributions = contributionsByPair.get(pairKey) ?? [];
        contributions.push({ ownerEntityId, validFrom, subjectRows, objectRows });
        contributionsByPair.set(pairKey, contributions);
      }
    }
  }

  for (const [pairKey, contributions] of contributionsByPair) {
    const [subjectEntityId, objectEntityId] = pairKey.split('|').map(Number) as [number, number];
    const ownerEntityIds = [...new Set(contributions.map((row) => row.ownerEntityId))].sort(
      (a, b) => a - b,
    );
    const validFrom = contributions
      .map((row) => row.validFrom)
      .sort()
      .at(-1)!;
    const payloadHash = relationPayloadHash({
      predicate: 'COMMON_OWNER',
      subjectEntityId,
      objectEntityId,
      ownerEntityIds,
      validFrom,
    });
    const revisionMap = new Map<
      number,
      { observation: OwnershipObservation; ownerEntityIds: Set<number> }
    >();
    for (const contribution of contributions) {
      for (const observation of [...contribution.subjectRows, ...contribution.objectRows]) {
        const revision = revisionMap.get(observation.sourceRevisionId) ?? {
          observation,
          ownerEntityIds: new Set<number>(),
        };
        revision.ownerEntityIds.add(contribution.ownerEntityId);
        revisionMap.set(observation.sourceRevisionId, revision);
      }
    }
    const evidence = [...revisionMap.entries()]
      .sort(([left], [right]) => left - right)
      .map(([sourceRevisionId, row]) =>
        sourceRevisionEvidence({
          sourceRevisionId,
          payloadHash,
          evidenceText:
            `Common owner ${[...row.ownerEntityIds].sort((a, b) => a - b).join(',')} holds ` +
            `${subjectEntityId} and ${objectEntityId} via immutable source revision ${sourceRevisionId}`,
          validFrom: row.observation.validFrom,
        }),
      );
    const decision = decideCandidate({
      predicate: 'COMMON_OWNER',
      evidence,
      hasModelConfigEvidence: false,
      subjectDegree: 1,
      objectDegree: 1,
    });
    const metadata: Record<string, unknown> = {
      builder: 'ownership-v1',
      ownerEntityIds,
    };
    if (ownerEntityIds.length === 1) metadata['ownerEntityId'] = ownerEntityIds[0]!;
    candidates.push({
      predicate: 'COMMON_OWNER',
      subjectEntityId,
      objectEntityId,
      relationKind: 'statistical',
      validFrom,
      payloadHash,
      evidence,
      ...decision,
      metadata,
    });
  }

  return { candidates: sortCandidates(candidates), exclusions };
}
