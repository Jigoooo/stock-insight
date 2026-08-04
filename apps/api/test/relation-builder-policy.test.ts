import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RELATION_BUILDER_POLICIES,
  evaluateRelationCandidate,
  getRelationBuilderPolicy,
} from '../src/relations/relation-policy.ts';

const BUILDER_PREDICATES = [
  'CLASSIFIED_AS',
  'PRODUCT_SIMILARITY',
  'SUPPLIES',
  'CUSTOMER_OF',
  'OWNS',
  'HELD_BY',
  'COMMON_OWNER',
  'SAME_ETF_BASKET',
  'NEWS_COMENTION',
  'MACRO_COMOVEMENT',
] as const;

describe('B6 relation builder policy revision', () => {
  it('declares a fail-closed policy row for every B6 builder predicate', () => {
    for (const predicate of BUILDER_PREDICATES) {
      const policy = RELATION_BUILDER_POLICIES.find((row) => row.predicate === predicate);
      assert.ok(policy, `policy required for ${predicate}`);
      assert.ok(
        Number.isSafeInteger(policy.minSourceRevisions) && policy.minSourceRevisions >= 1,
        `${predicate} must require at least one immutable source revision`,
      );
      assert.equal(typeof policy.requiresModelConfig, 'boolean');
      assert.ok(
        policy.superhubDegreeCap === null ||
          (Number.isSafeInteger(policy.superhubDegreeCap) && policy.superhubDegreeCap > 0),
        `${predicate} superhubDegreeCap must be null or a positive integer`,
      );
    }
  });

  it('never allows news co-mention to promote into an accepted structural relation', () => {
    const policy = getRelationBuilderPolicy('NEWS_COMENTION');
    assert.equal(policy.promotionEligible, false);
    const decision = evaluateRelationCandidate({
      predicate: 'NEWS_COMENTION',
      distinctSourceRevisionIds: [1, 2, 3, 4, 5],
      hasModelConfigEvidence: true,
      subjectDegree: 1,
      objectDegree: 1,
    });
    assert.equal(decision.decision, 'rejected');
    assert.ok(decision.reasons.includes('predicate_not_promotable'));
  });

  it('treats product similarity as a statistical association that must bind model config', () => {
    const policy = getRelationBuilderPolicy('PRODUCT_SIMILARITY');
    assert.equal(policy.relationClass, 'association');
    assert.equal(policy.requiresModelConfig, true);

    const withoutModel = evaluateRelationCandidate({
      predicate: 'PRODUCT_SIMILARITY',
      distinctSourceRevisionIds: [11, 12],
      hasModelConfigEvidence: false,
      subjectDegree: 3,
      objectDegree: 3,
    });
    assert.equal(withoutModel.decision, 'quarantined_unverified');
    assert.ok(withoutModel.reasons.includes('missing_model_config'));
  });

  it('treats macro co-movement as a statistical association, never a causal one', () => {
    const policy = getRelationBuilderPolicy('MACRO_COMOVEMENT');
    // The point of the whole predicate: a correlation is an association. If this
    // ever becomes 'causal' or 'exposure' the name stops matching the claim.
    assert.equal(policy.relationClass, 'association');
    assert.equal(policy.requiresModelConfig, true);
    // Two windows produce the number — the macro series and the stock prices.
    assert.ok(policy.minSourceRevisions >= 2);
    assert.ok(
      policy.superhubDegreeCap !== null && policy.superhubDegreeCap > 0,
      'a series correlated with every stock would be an unbounded hub',
    );

    const withoutModel = evaluateRelationCandidate({
      predicate: 'MACRO_COMOVEMENT',
      distinctSourceRevisionIds: [31, 32],
      hasModelConfigEvidence: false,
      subjectDegree: 3,
      objectDegree: 3,
    });
    assert.equal(withoutModel.decision, 'quarantined_unverified');
    assert.ok(withoutModel.reasons.includes('missing_model_config'));

    // One window is not two. A correlation cited against only the macro side
    // would be unre-runnable from its own evidence.
    const oneWindow = evaluateRelationCandidate({
      predicate: 'MACRO_COMOVEMENT',
      distinctSourceRevisionIds: [31, 31],
      hasModelConfigEvidence: true,
      subjectDegree: 3,
      objectDegree: 3,
    });
    assert.equal(oneWindow.decision, 'quarantined_unverified');
    assert.ok(oneWindow.reasons.includes('insufficient_source_revisions'));
  });

  it('keeps the macro model degree cap strictly below the policy backstop', async () => {
    // The policy cap REJECTS rather than trims, so a model that emitted more
    // pairs per series than the policy allows would silently discard all of them.
    const { MACRO_COMOVEMENT_MODEL_CONFIG } =
      await import('../src/relations/macro-comovement-model.ts');
    const policy = getRelationBuilderPolicy('MACRO_COMOVEMENT');
    assert.ok(
      MACRO_COMOVEMENT_MODEL_CONFIG.seriesDegreeCap < (policy.superhubDegreeCap ?? 0),
      'model seriesDegreeCap must stay under the policy superhubDegreeCap',
    );
  });

  it('caps ETF/universal-owner superhubs with a finite degree cap', () => {
    for (const predicate of ['SAME_ETF_BASKET', 'COMMON_OWNER', 'HELD_BY'] as const) {
      const policy = getRelationBuilderPolicy(predicate);
      assert.ok(
        policy.superhubDegreeCap !== null && policy.superhubDegreeCap > 0,
        `${predicate} must carry a finite superhub degree cap`,
      );
    }
    const capped = getRelationBuilderPolicy('SAME_ETF_BASKET');
    const decision = evaluateRelationCandidate({
      predicate: 'SAME_ETF_BASKET',
      distinctSourceRevisionIds: [21],
      hasModelConfigEvidence: false,
      subjectDegree: (capped.superhubDegreeCap ?? 0) + 1,
      objectDegree: 1,
    });
    assert.equal(decision.decision, 'rejected');
    assert.ok(decision.reasons.includes('superhub_cap_exceeded'));
  });

  it('keeps undisclosed supply chains as unknown, never closed-world absence', () => {
    assert.equal(getRelationBuilderPolicy('SUPPLIES').absenceSemantics, 'unknown_not_disclosed');
    assert.equal(getRelationBuilderPolicy('CUSTOMER_OF').absenceSemantics, 'unknown_not_disclosed');
  });

  it('quarantines candidates below the per-predicate minimum source revision count', () => {
    const policy = getRelationBuilderPolicy('CLASSIFIED_AS');
    const decision = evaluateRelationCandidate({
      predicate: 'CLASSIFIED_AS',
      distinctSourceRevisionIds: Array.from(
        { length: policy.minSourceRevisions - 1 },
        (_, index) => index + 1,
      ),
      hasModelConfigEvidence: false,
      subjectDegree: 1,
      objectDegree: 1,
    });
    assert.equal(decision.decision, 'quarantined_unverified');
    assert.ok(decision.reasons.includes('insufficient_source_revisions'));
  });

  it('counts distinct source revisions, not raw evidence rows', () => {
    const decision = evaluateRelationCandidate({
      predicate: 'OWNS',
      distinctSourceRevisionIds: [7, 7, 7],
      hasModelConfigEvidence: false,
      subjectDegree: 1,
      objectDegree: 1,
    });
    if (getRelationBuilderPolicy('OWNS').minSourceRevisions > 1) {
      assert.equal(decision.decision, 'quarantined_unverified');
      assert.ok(decision.reasons.includes('insufficient_source_revisions'));
    } else {
      assert.equal(decision.decision, 'accepted');
    }
  });

  it('accepts a compliant candidate and rejects unknown predicates fail-closed', () => {
    const policy = getRelationBuilderPolicy('PRODUCT_SIMILARITY');
    const accepted = evaluateRelationCandidate({
      predicate: 'PRODUCT_SIMILARITY',
      distinctSourceRevisionIds: Array.from(
        { length: policy.minSourceRevisions },
        (_, index) => 100 + index,
      ),
      hasModelConfigEvidence: true,
      subjectDegree: 2,
      objectDegree: 2,
    });
    assert.equal(accepted.decision, 'accepted');
    assert.deepEqual(accepted.reasons, []);

    assert.throws(
      () =>
        evaluateRelationCandidate({
          predicate: 'TOTALLY_UNKNOWN_PREDICATE',
          distinctSourceRevisionIds: [1],
          hasModelConfigEvidence: false,
          subjectDegree: 1,
          objectDegree: 1,
        }),
      /unknown relation builder predicate/i,
    );
  });
});
