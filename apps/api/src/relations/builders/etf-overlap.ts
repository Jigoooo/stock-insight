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
        const payloadHash = relationPayloadHash({
          predicate: 'SAME_ETF_BASKET',
          subjectEntityId,
          objectEntityId,
          etfEntityId,
          validFrom,
        });
        const revisionMap = new Map<number, EtfBasketObservation>();
        for (const row of [...subjectRows, ...objectRows]) {
          if (!revisionMap.has(row.sourceRevisionId)) revisionMap.set(row.sourceRevisionId, row);
        }
        const evidence = [...revisionMap.values()]
          .sort((a, b) => a.sourceRevisionId - b.sourceRevisionId)
          .map((row) =>
            sourceRevisionEvidence({
              sourceRevisionId: row.sourceRevisionId,
              payloadHash,
              evidenceText:
                `ETF ${etfEntityId} basket co-membership of ${subjectEntityId} and ${objectEntityId} ` +
                `from immutable source revision ${row.sourceRevisionId}`,
              validFrom: row.validFrom,
            }),
          );
        const decision = decideCandidate({
          predicate: 'SAME_ETF_BASKET',
          evidence,
          hasModelConfigEvidence: false,
          subjectDegree: 1,
          objectDegree: 1,
        });
        candidates.push({
          predicate: 'SAME_ETF_BASKET',
          subjectEntityId,
          objectEntityId,
          relationKind: 'statistical',
          validFrom,
          payloadHash,
          evidence,
          ...decision,
          metadata: {
            builder: 'etf-overlap-v1',
            etfEntityId,
          },
        });
      }
    }
  }

  return { candidates: sortCandidates(candidates), exclusions };
}
