import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_WINDOW_DAYS, planMerges } from '../src/knowledge/run-claim-merge.ts';

const DAY = 24 * 60 * 60 * 1000;
const claim = (claimId: number, dayOffset: number, documentId: number) => ({
  claimId,
  observedAtMs: dayOffset * DAY,
  documents: [{ documentId, chunkId: 1, quote: '인용' }],
});

/**
 * Merging is additive into an append-only table: claim_evidence rejects UPDATE and
 * DELETE, so an evidence row written against the wrong claim cannot be taken back.
 * That is why the decision lives in a pure function with tests rather than inside
 * the query that writes it.
 */
describe('claim merge planning', () => {
  it('gives the earliest claim the documents the others carry', () => {
    const plan = planMerges([claim(2, 3, 200), claim(1, 0, 100)], 7);
    assert.equal(plan?.canonicalClaimId, 1, '가장 이른 claim 이 기준이다');
    assert.deepEqual(plan?.absorbedClaimIds, [2]);
    assert.equal(plan?.documentsAfter, 2);
  });

  it('refuses a pair outside the window', () => {
    // 10 days apart: two announcements, not one announcement reported twice.
    assert.equal(planMerges([claim(1, 0, 100), claim(2, 10, 200)], 7), null);
  });

  it('does not chain through the window', () => {
    // 0 → 7 → 14. Neighbour-to-neighbour chaining would merge all three and span
    // 14 days through a 7-day window, which is the over-merge the window exists to
    // prevent. Every claim is measured against the CANONICAL one.
    const plan = planMerges([claim(1, 0, 100), claim(2, 7, 200), claim(3, 14, 300)], 7);
    assert.deepEqual(plan?.absorbedClaimIds, [2], '14일짜리는 들어오면 안 된다');
    assert.equal(plan?.documentsAfter, 2);
  });

  it('adds nothing when both claims cite the same document', () => {
    // Same document twice is not a second source, and ops.verification_policy
    // counts DISTINCT documents. Returning a plan here would write an evidence row
    // that changes no verdict.
    assert.equal(planMerges([claim(1, 0, 100), claim(2, 1, 100)], 7), null);
  });

  it('leaves a lone claim alone', () => {
    assert.equal(planMerges([claim(1, 0, 100)], 7), null);
  });

  it('states the window it was measured at', () => {
    // 0d 33 · 1d 40 · 3d 41 · 7d 44 · 14d 50 · 30d 50 pairs. The flat tail past 14
    // is the corpus being 20 days wide, not evidence that wider is safe.
    assert.equal(DEFAULT_WINDOW_DAYS, 7);
  });
});
