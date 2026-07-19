import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEtfBasketCandidates } from '../src/relations/builders/etf-overlap.ts';
import { buildOwnershipCandidates } from '../src/relations/builders/ownership.ts';
import { buildProductSimilarityCandidates } from '../src/relations/builders/product-similarity.ts';
import { getRelationBuilderPolicy } from '../src/relations/relation-policy.ts';

const AS_OF = '2026-07-19T00:00:00.000Z';
const T0 = '2026-07-01T00:00:00.000Z';

describe('B6 relation builders — superhub safety', () => {
  it('a broad-market ETF above the degree cap produces zero pair candidates and an exclusion record', () => {
    const cap = getRelationBuilderPolicy('SAME_ETF_BASKET').superhubDegreeCap;
    assert.ok(cap !== null && cap > 0);
    const memberCount = cap + 1;
    const observations = Array.from({ length: memberCount }, (_, index) => ({
      etfEntityId: 900,
      memberEntityId: 1000 + index,
      sourceRevisionId: 9001,
      availableAt: T0,
      validFrom: T0,
    }));
    const { candidates, exclusions } = buildEtfBasketCandidates(observations, { asOf: AS_OF });
    assert.equal(candidates.length, 0);
    assert.equal(exclusions.length, 1);
    const exclusion = exclusions[0]!;
    assert.equal(exclusion.reason, 'superhub_cap_exceeded');
    assert.equal(exclusion.hubEntityId, 900);
    assert.equal(exclusion.memberCount, memberCount);
    assert.equal(exclusion.suppressedPairCount, (memberCount * (memberCount - 1)) / 2);
  });

  it('an ETF at exactly the cap still expands into pairs', () => {
    const cap = getRelationBuilderPolicy('SAME_ETF_BASKET').superhubDegreeCap!;
    const observations = Array.from({ length: cap }, (_, index) => ({
      etfEntityId: 901,
      memberEntityId: 2000 + index,
      sourceRevisionId: 9002,
      availableAt: T0,
      validFrom: T0,
    }));
    const { candidates, exclusions } = buildEtfBasketCandidates(observations, { asOf: AS_OF });
    assert.equal(exclusions.length, 0);
    assert.equal(candidates.length, (cap * (cap - 1)) / 2);
  });

  it('a universal owner above the COMMON_OWNER cap is excluded, not expanded into a near-complete graph', () => {
    const cap = getRelationBuilderPolicy('COMMON_OWNER').superhubDegreeCap;
    assert.ok(cap !== null && cap > 0);
    const holdingCount = cap + 1;
    const observations = Array.from({ length: holdingCount }, (_, index) => ({
      ownerEntityId: 55,
      ownedEntityId: 3000 + index,
      ownershipKind: 'institutional_holding' as const,
      sourceRevisionId: 9100 + index,
      availableAt: T0,
      validFrom: T0,
    }));
    const { candidates, exclusions } = buildOwnershipCandidates(observations, { asOf: AS_OF });
    assert.equal(candidates.filter((c) => c.predicate === 'COMMON_OWNER').length, 0);
    // Direct HELD_BY rows survive: the cap suppresses pair expansion, not the filing itself.
    assert.equal(candidates.filter((c) => c.predicate === 'HELD_BY').length, holdingCount);
    const exclusion = exclusions.find((row) => row.reason === 'superhub_cap_exceeded');
    assert.ok(exclusion);
    assert.equal(exclusion.hubEntityId, 55);
  });

  it('pair expansion is bounded: candidate count never exceeds cap*(cap-1)/2 per hub', () => {
    const cap = getRelationBuilderPolicy('SAME_ETF_BASKET').superhubDegreeCap!;
    const maxPairs = (cap * (cap - 1)) / 2;
    for (const memberCount of [2, 5, cap]) {
      const observations = Array.from({ length: memberCount }, (_, index) => ({
        etfEntityId: 950,
        memberEntityId: 4000 + index,
        sourceRevisionId: 9200,
        availableAt: T0,
        validFrom: T0,
      }));
      const { candidates } = buildEtfBasketCandidates(observations, { asOf: AS_OF });
      assert.ok(candidates.length <= maxPairs);
      assert.equal(candidates.length, (memberCount * (memberCount - 1)) / 2);
    }
  });

  it('product similarity rejects candidates touching an endpoint above its policy degree cap', () => {
    const cap = getRelationBuilderPolicy('PRODUCT_SIMILARITY').superhubDegreeCap!;
    const observations = Array.from({ length: cap + 1 }, (_, index) => ({
      subjectEntityId: 1,
      objectEntityId: 10_000 + index,
      similarityScore: 0.8,
      modelConfig: { model: 'test-model', threshold: 0.5 },
      sourceRevisionIds: [20_000 + index * 2, 20_001 + index * 2],
      availableAt: T0,
      validFrom: T0,
    }));
    const candidates = buildProductSimilarityCandidates(observations, {
      asOf: AS_OF,
    }).candidates;
    assert.equal(candidates.length, cap + 1);
    assert.ok(candidates.every((candidate) => candidate.policyDecision.decision === 'rejected'));
    assert.ok(
      candidates.every((candidate) =>
        candidate.policyDecision.reasons.includes('superhub_cap_exceeded'),
      ),
    );
  });
});
