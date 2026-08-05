// B6 — ETF basket builder (master plan §4.5, Da–Shive guidance).
// Members of one ETF at one PIT snapshot expand into undirected
// SAME_ETF_BASKET pairs (subject<object canonical order). Broad-market ETFs
// above the superhub degree cap are excluded wholesale so a universal basket
// cannot manufacture a near-complete graph.

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

/**
 * Confidence for a co-membership, from the tightest basket the pair shares.
 *
 * This used to be a flat 0.800 for every pair. Measured on production
 * 2026-08-05: 2,006 of 2,519 SAME_ETF_BASKET edges (80%) come from baskets of
 * 50+ members, and the largest is SPY at 70. Those pairs assert "both are large
 * US caps" — and they carried MORE weight than any PRODUCT_SIMILARITY edge
 * (max 0.477) and most MACRO_COMOVEMENT edges. The single most influential
 * number in the graph ranked index membership above every measured relationship,
 * and nobody had chosen it deliberately.
 *
 * The form is 1/(n-1): a member of an n-name basket has n-1 co-members, so the
 * chance a randomly drawn one is this particular partner is 1/(n-1). That is the
 * specificity the edge actually carries.
 *
 * The constant anchors n=8 — the tightest basket we hold — at 0.800, so the
 * strongest co-membership keeps the value it has today and everything wider is
 * discounted by how much company it keeps:
 *
 *   8 members  0.800     14 members 0.431     70 members (SPY) 0.081
 *   9 members  0.700     19 members 0.311
 *
 * The floor keeps a broad-index edge walkable rather than deleting it: the pair
 * IS in the same basket, it just does not distinguish much.
 */
export const ETF_BASKET_CONFIDENCE = Object.freeze({
  anchorBasketSize: 8,
  anchorConfidence: 0.8,
  floor: 0.05,
});

export function etfBasketConfidence(smallestSharedBasketSize: number): number {
  if (!Number.isSafeInteger(smallestSharedBasketSize) || smallestSharedBasketSize < 2) {
    throw new Error('smallestSharedBasketSize must be an integer of at least 2');
  }
  const { anchorBasketSize, anchorConfidence, floor } = ETF_BASKET_CONFIDENCE;
  const scaled = (anchorConfidence * (anchorBasketSize - 1)) / (smallestSharedBasketSize - 1);
  return Number(Math.min(anchorConfidence, Math.max(floor, scaled)).toFixed(3));
}

export type EtfBasketObservation = {
  etfEntityId: number;
  memberEntityId: number;
  sourceRevisionId: number;
  availableAt: string;
  validFrom: string;
};

export function buildEtfBasketCandidates(
  observations: readonly EtfBasketObservation[],
  options: BuilderRunOptions,
): BuilderResult {
  const asOfMs = parseAsOf(options);
  const cap = getRelationBuilderPolicy('SAME_ETF_BASKET').superhubDegreeCap;

  const membersByEtf = new Map<number, Map<number, EtfBasketObservation[]>>();
  for (const observation of observations) {
    assertPositiveInt(observation.etfEntityId, 'etfEntityId');
    assertPositiveInt(observation.memberEntityId, 'memberEntityId');
    assertPositiveInt(observation.sourceRevisionId, 'sourceRevisionId');
    assertValidTimestamp(observation.availableAt, 'availableAt');
    assertValidTimestamp(observation.validFrom, 'validFrom');
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;

    const byMember = membersByEtf.get(observation.etfEntityId) ?? new Map();
    const rows = byMember.get(observation.memberEntityId) ?? [];
    rows.push(observation);
    byMember.set(observation.memberEntityId, rows);
    membersByEtf.set(observation.etfEntityId, byMember);
  }

  const candidates: RelationCandidateDraft[] = [];
  const exclusions: SuperhubExclusion[] = [];
  type PairContribution = {
    etfEntityId: number;
    /** How many members that basket had, which is what makes the pair specific. */
    basketMemberCount: number;
    validFrom: string;
    subjectRows: EtfBasketObservation[];
    objectRows: EtfBasketObservation[];
  };
  const contributionsByPair = new Map<string, PairContribution[]>();

  for (const [etfEntityId, byMember] of membersByEtf) {
    const memberIds = [...byMember.keys()].sort((a, b) => a - b);
    if (memberIds.length < 2) continue;
    if (cap !== null && memberIds.length > cap) {
      exclusions.push({
        reason: 'superhub_cap_exceeded',
        predicate: 'SAME_ETF_BASKET',
        hubEntityId: etfEntityId,
        memberCount: memberIds.length,
        suppressedPairCount: (memberIds.length * (memberIds.length - 1)) / 2,
      });
      continue;
    }

    for (let i = 0; i < memberIds.length; i += 1) {
      for (let j = i + 1; j < memberIds.length; j += 1) {
        const subjectEntityId = memberIds[i]!;
        const objectEntityId = memberIds[j]!;
        const subjectRows = byMember.get(subjectEntityId)!;
        const objectRows = byMember.get(objectEntityId)!;
        const validFrom = [...subjectRows, ...objectRows]
          .map((row) => row.validFrom)
          .sort()
          .at(-1)!;
        const pairKey = `${subjectEntityId}|${objectEntityId}`;
        const contributions = contributionsByPair.get(pairKey) ?? [];
        contributions.push({
          etfEntityId,
          basketMemberCount: memberIds.length,
          validFrom,
          subjectRows,
          objectRows,
        });
        contributionsByPair.set(pairKey, contributions);
      }
    }
  }

  for (const [pairKey, contributions] of contributionsByPair) {
    const [subjectEntityId, objectEntityId] = pairKey.split('|').map(Number) as [number, number];
    const etfEntityIds = [...new Set(contributions.map((row) => row.etfEntityId))].sort(
      (a, b) => a - b,
    );
    const validFrom = contributions
      .map((row) => row.validFrom)
      .sort()
      .at(-1)!;
    const payloadHash = relationPayloadHash({
      predicate: 'SAME_ETF_BASKET',
      subjectEntityId,
      objectEntityId,
      etfEntityIds,
      validFrom,
    });
    const revisionMap = new Map<
      number,
      { observation: EtfBasketObservation; etfEntityIds: Set<number> }
    >();
    for (const contribution of contributions) {
      for (const observation of [...contribution.subjectRows, ...contribution.objectRows]) {
        const revision = revisionMap.get(observation.sourceRevisionId) ?? {
          observation,
          etfEntityIds: new Set<number>(),
        };
        revision.etfEntityIds.add(contribution.etfEntityId);
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
            `ETF ${[...row.etfEntityIds].sort((a, b) => a - b).join(',')} basket co-membership ` +
            `of ${subjectEntityId} and ${objectEntityId} from immutable source revision ${sourceRevisionId}`,
          validFrom: row.observation.validFrom,
        }),
      );
    const decision = decideCandidate({
      predicate: 'SAME_ETF_BASKET',
      evidence,
      hasModelConfigEvidence: false,
      subjectDegree: 1,
      objectDegree: 1,
    });
    // The TIGHTEST basket the pair shares. Co-membership in a 9-name sector fund
    // says something; co-membership in a 70-name index fund says "both are large
    // caps". Taking the minimum lets one specific basket carry the pair even when
    // they also happen to share a broad one.
    const smallestSharedBasketSize = Math.min(...contributions.map((row) => row.basketMemberCount));
    const metadata: Record<string, unknown> = {
      builder: 'etf-overlap-v1',
      etfEntityIds,
      smallestSharedBasketSize,
      basketConfidence: etfBasketConfidence(smallestSharedBasketSize),
    };
    if (etfEntityIds.length === 1) metadata['etfEntityId'] = etfEntityIds[0]!;
    candidates.push({
      predicate: 'SAME_ETF_BASKET',
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
