import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEtfBasketCandidates } from '../src/relations/builders/etf-overlap.ts';
import { buildNewsComentionCandidates } from '../src/relations/builders/news-relation.ts';
import { buildOwnershipCandidates } from '../src/relations/builders/ownership.ts';
import { buildProductSimilarityCandidates } from '../src/relations/builders/product-similarity.ts';
import { buildSupplyChainCandidates } from '../src/relations/builders/supply-chain.ts';

const AS_OF = '2026-07-19T00:00:00.000Z';
const T0 = '2026-07-01T00:00:00.000Z';

describe('B6 relation builders — golden fixtures', () => {
  it('supply chain: one disclosed link yields SUPPLIES and inverse CUSTOMER_OF bound to the same revision', () => {
    const { candidates, exclusions } = buildSupplyChainCandidates(
      [
        {
          supplierEntityId: 11,
          customerEntityId: 22,
          disclosureKind: 'supplier_disclosed',
          sourceRevisionId: 7001,
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(exclusions.length, 0);
    assert.equal(candidates.length, 2);
    const supplies = candidates.find((c) => c.predicate === 'SUPPLIES');
    const customerOf = candidates.find((c) => c.predicate === 'CUSTOMER_OF');
    assert.ok(supplies && customerOf);
    assert.equal(supplies.subjectEntityId, 11);
    assert.equal(supplies.objectEntityId, 22);
    assert.equal(customerOf.subjectEntityId, 22);
    assert.equal(customerOf.objectEntityId, 11);
    for (const candidate of [supplies, customerOf]) {
      assert.equal(candidate.relationKind, 'structural');
      assert.equal(candidate.policyDecision.decision, 'accepted');
      assert.equal(candidate.targetRevisionStatus, 'accepted');
      assert.deepEqual(
        candidate.evidence.map((e) => e.sourceRevisionId),
        [7001],
      );
      assert.match(candidate.payloadHash, /^[a-f0-9]{64}$/);
      assert.equal(candidate.evidence[0]!.relationPayloadHash, candidate.payloadHash);
    }
    assert.notEqual(supplies.payloadHash, customerOf.payloadHash);
  });

  it('ownership: direct stake yields OWNS; institutional filing yields HELD_BY (security→holder)', () => {
    const { candidates, exclusions } = buildOwnershipCandidates(
      [
        {
          ownerEntityId: 31,
          ownedEntityId: 41,
          ownershipKind: 'direct',
          sourceRevisionId: 7101,
          availableAt: T0,
          validFrom: T0,
        },
        {
          ownerEntityId: 32,
          ownedEntityId: 42,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 7102,
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(exclusions.length, 0);
    const owns = candidates.find((c) => c.predicate === 'OWNS');
    const heldBy = candidates.find((c) => c.predicate === 'HELD_BY');
    assert.ok(owns && heldBy);
    assert.equal(owns.subjectEntityId, 31);
    assert.equal(owns.objectEntityId, 41);
    assert.equal(owns.policyDecision.decision, 'accepted');
    assert.equal(heldBy.subjectEntityId, 42);
    assert.equal(heldBy.objectEntityId, 32);
    assert.equal(heldBy.policyDecision.decision, 'accepted');
  });

  it('ownership: COMMON_OWNER requires two DISTINCT filings; same-revision pair is quarantined', () => {
    const twoFilings = buildOwnershipCandidates(
      [
        {
          ownerEntityId: 50,
          ownedEntityId: 61,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 7201,
          availableAt: T0,
          validFrom: T0,
        },
        {
          ownerEntityId: 50,
          ownedEntityId: 62,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 7202,
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    const commonOwner = twoFilings.candidates.find((c) => c.predicate === 'COMMON_OWNER');
    assert.ok(commonOwner);
    assert.equal(commonOwner.subjectEntityId, 61);
    assert.equal(commonOwner.objectEntityId, 62);
    assert.equal(commonOwner.policyDecision.decision, 'accepted');
    assert.deepEqual(commonOwner.evidence.map((e) => e.sourceRevisionId).sort(), [7201, 7202]);

    const oneFiling = buildOwnershipCandidates(
      [
        {
          ownerEntityId: 50,
          ownedEntityId: 61,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 7301,
          availableAt: T0,
          validFrom: T0,
        },
        {
          ownerEntityId: 50,
          ownedEntityId: 62,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 7301,
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    const quarantined = oneFiling.candidates.find((c) => c.predicate === 'COMMON_OWNER');
    assert.ok(quarantined);
    assert.equal(quarantined.policyDecision.decision, 'quarantined_unverified');
    assert.ok(quarantined.policyDecision.reasons.includes('insufficient_source_revisions'));
    assert.equal(quarantined.targetRevisionStatus, 'quarantined_unverified');
  });

  it('ETF basket: three members expand to three undirected SAME_ETF_BASKET pairs (subject<object)', () => {
    const { candidates, exclusions } = buildEtfBasketCandidates(
      [
        {
          etfEntityId: 900,
          memberEntityId: 73,
          sourceRevisionId: 7401,
          availableAt: T0,
          validFrom: T0,
        },
        {
          etfEntityId: 900,
          memberEntityId: 71,
          sourceRevisionId: 7401,
          availableAt: T0,
          validFrom: T0,
        },
        {
          etfEntityId: 900,
          memberEntityId: 72,
          sourceRevisionId: 7401,
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(exclusions.length, 0);
    assert.equal(candidates.length, 3);
    assert.deepEqual(
      candidates.map((c) => [c.subjectEntityId, c.objectEntityId]),
      [
        [71, 72],
        [71, 73],
        [72, 73],
      ],
    );
    for (const candidate of candidates) {
      assert.equal(candidate.predicate, 'SAME_ETF_BASKET');
      assert.equal(candidate.relationKind, 'statistical');
      assert.equal(candidate.policyDecision.decision, 'accepted');
      assert.equal(candidate.metadata['etfEntityId'], 900);
    }
  });

  it('news: co-mention is NEVER promoted and syndication replicas do not multiply corroboration', () => {
    const { candidates } = buildNewsComentionCandidates(
      [
        {
          subjectEntityId: 81,
          objectEntityId: 82,
          articleSourceRevisionId: 7501,
          syndicationClusterId: 'cluster-a',
          availableAt: T0,
          validFrom: T0,
        },
        {
          subjectEntityId: 82,
          objectEntityId: 81,
          articleSourceRevisionId: 7502,
          syndicationClusterId: 'cluster-a',
          availableAt: T0,
          validFrom: T0,
        },
        {
          subjectEntityId: 81,
          objectEntityId: 82,
          articleSourceRevisionId: 7503,
          syndicationClusterId: 'cluster-b',
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(candidates.length, 1);
    const candidate = candidates[0]!;
    assert.equal(candidate.predicate, 'NEWS_COMENTION');
    assert.equal(candidate.subjectEntityId, 81);
    assert.equal(candidate.objectEntityId, 82);
    assert.equal(candidate.policyDecision.decision, 'rejected');
    assert.ok(candidate.policyDecision.reasons.includes('predicate_not_promotable'));
    assert.equal(candidate.targetRevisionStatus, 'quarantined_unverified');
    assert.equal(candidate.metadata['corroborationCount'], 2);
    assert.equal(candidate.evidence.length, 3);
  });

  it('product similarity: statistical relation requires bound model config', () => {
    const modelConfig = { model: 'tnic-cosine-v1', threshold: 0.21 };
    const withConfig = buildProductSimilarityCandidates(
      [
        {
          subjectEntityId: 91,
          objectEntityId: 92,
          similarityScore: 0.87,
          modelConfig,
          sourceRevisionIds: [7601, 7602],
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(withConfig.candidates.length, 1);
    const accepted = withConfig.candidates[0]!;
    assert.equal(accepted.predicate, 'PRODUCT_SIMILARITY');
    assert.equal(accepted.relationKind, 'statistical');
    assert.equal(accepted.policyDecision.decision, 'accepted');
    assert.deepEqual({ ...accepted.modelConfig }, modelConfig);

    const withoutConfig = buildProductSimilarityCandidates(
      [
        {
          subjectEntityId: 91,
          objectEntityId: 92,
          similarityScore: 0.87,
          modelConfig: null,
          sourceRevisionIds: [7601, 7602],
          availableAt: T0,
          validFrom: T0,
        },
      ],
      { asOf: AS_OF },
    );
    const quarantined = withoutConfig.candidates[0]!;
    assert.equal(quarantined.policyDecision.decision, 'quarantined_unverified');
    assert.ok(quarantined.policyDecision.reasons.includes('missing_model_config'));
  });

  it('all builders are deterministic across runs', () => {
    const run = () =>
      buildSupplyChainCandidates(
        [
          {
            supplierEntityId: 11,
            customerEntityId: 22,
            disclosureKind: 'supplier_disclosed',
            sourceRevisionId: 7001,
            availableAt: T0,
            validFrom: T0,
          },
        ],
        { asOf: AS_OF },
      ).candidates.map((c) => `${c.payloadHash}:${c.evidence[0]!.evidenceHash}`);
    assert.deepEqual(run(), run());
  });
});
