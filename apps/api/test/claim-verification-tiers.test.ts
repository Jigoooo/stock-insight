import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isPromotion,
  selectTier,
  type VerificationTier,
} from '../src/knowledge/run-claim-corroboration.ts';

/**
 * `ops.verification_policy` has defined a `verified` tier since 2026-07-19 and no
 * code read it. The job selected `WHERE target_status = 'corroborated'` and
 * examined only `unverified`/`untrusted_legacy` claims, so a claim could gather any
 * amount of evidence and never rise. verified sat at 0 for that reason, not because
 * the criteria were missing — the third instance of "declared, never read" found in
 * one night.
 *
 * Re-examining already-corroborated claims is what makes promotion possible, and it
 * is also what makes DEMOTION possible for the first time. Claim status transitions
 * are guarded and audited; walking one backwards would be the worst outcome here,
 * so the rank comparison is a separate pure function with its own tests.
 */
const TIERS: VerificationTier[] = [
  {
    targetStatus: 'verified',
    minDistinctDocuments: 2,
    requireChunkQuote: true,
    policyVersion: 'b4-v1',
  },
  {
    targetStatus: 'corroborated',
    minDistinctDocuments: 1,
    requireChunkQuote: true,
    policyVersion: 'b4-v1',
  },
];

const evidence = (documents: number, missingAnchor = 0, quoteNotInSource = 0) => ({
  document_count: documents,
  missing_anchor: missingAnchor,
  quote_not_in_source: quoteNotInSource,
});

describe('verification tier selection', () => {
  it('picks the strongest tier the evidence supports', () => {
    assert.equal(selectTier(evidence(2), TIERS).tier?.targetStatus, 'verified');
    assert.equal(selectTier(evidence(5), TIERS).tier?.targetStatus, 'verified');
    assert.equal(selectTier(evidence(1), TIERS).tier?.targetStatus, 'corroborated');
  });

  it('reports why a claim reached no tier, using the weakest tier`s reason', () => {
    const none = selectTier(evidence(0), TIERS);
    assert.equal(none.tier, null);
    assert.equal(none.reason, 'too_few_documents');
  });

  it('refuses on anchor and quote failures at every tier', () => {
    // A quote that is not in the chunk it points at is not evidence, however many
    // documents there are. The database trigger only checks presence.
    assert.equal(selectTier(evidence(5, 1, 0), TIERS).tier, null);
    assert.equal(selectTier(evidence(5, 0, 1), TIERS).tier, null);
    assert.equal(selectTier(evidence(5, 0, 1), TIERS).reason, 'quote_not_in_source');
  });
});

describe('promotion only — never a demotion', () => {
  it('moves a claim up', () => {
    assert.equal(isPromotion('unverified', 'corroborated'), true);
    assert.equal(isPromotion('corroborated', 'verified'), true);
    assert.equal(isPromotion('untrusted_legacy', 'verified'), true);
  });

  it('never moves a claim down or sideways', () => {
    // The case this guard exists for: corroborated claims are re-examined every
    // cycle now, so a tier whose rule tightened must leave them where they are
    // rather than walking a guarded, audited transition backwards.
    assert.equal(isPromotion('verified', 'corroborated'), false);
    assert.equal(isPromotion('corroborated', 'corroborated'), false);
    assert.equal(isPromotion('verified', 'verified'), false);
  });

  it('treats untrusted_legacy as unjudged, not as rejected', () => {
    // Both mean "not yet judged". Ranking untrusted_legacy above unverified would
    // strand those claims below corroborated forever.
    assert.equal(isPromotion('untrusted_legacy', 'corroborated'), true);
    assert.equal(isPromotion('unverified', 'corroborated'), true);
  });

  it('refuses to promote into a status it does not know', () => {
    assert.equal(isPromotion('corroborated', 'invented_status'), false);
  });
});
