import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  classify,
  selectTier,
  type VerificationTier,
} from '../src/knowledge/run-claim-corroboration.ts';

// knowledge.claim sat at verified 0 / 271 and transitionVerification() had only
// test callers, which read as "verification is unsolved". It was not:
// ops.verification_policy already defined what each status requires, and every
// claim met the rule for 'corroborated'.

const source = readFileSync(
  new URL('../src/knowledge/run-claim-corroboration.ts', import.meta.url).pathname,
  'utf8',
);

const row = (over = {}) => ({
  document_count: 1,
  missing_anchor: 0,
  quote_not_in_source: 0,
  ...over,
});

test('a claim meeting the policy is eligible', () => {
  assert.deepEqual(classify(row(), 1, true), { eligible: true });
});

test('too few source documents blocks it', () => {
  // This is what keeps 'verified' (min 2) out of reach — a data fact, not a
  // judgement call, and it opens on its own when a second source appears.
  assert.deepEqual(classify(row(), 2, true), {
    eligible: false,
    reason: 'too_few_documents',
  });
});

test('a quote that is not in its chunk blocks it', () => {
  // The database trigger only checks a quote is present and non-blank; a claim
  // could carry an invented quote and still pass. Corroboration that never opened
  // the source is not corroboration.
  assert.deepEqual(classify(row({ quote_not_in_source: 1 }), 1, true), {
    eligible: false,
    reason: 'quote_not_in_source',
  });
});

test('a missing anchor blocks it', () => {
  assert.deepEqual(classify(row({ missing_anchor: 1 }), 1, true), {
    eligible: false,
    reason: 'missing_anchor',
  });
});

test('the policy is read from the table, not restated', () => {
  // A hardcoded threshold would drift away from ops.verification_policy without
  // anything failing.
  assert.match(source, /FROM ops\.verification_policy/);
  assert.doesNotMatch(source, /minDistinctDocuments = [0-9]/);
});

test('the transition records who did it and under which rule', () => {
  // The audit trigger demands both; "a job did it" is not auditable.
  assert.match(source, /actor: ACTOR/);
  assert.match(source, /policy \$\{tier\.policyVersion\}/);
});

test('verified is not reached for free', () => {
  // Rewritten 2026-08-06. This asserted the SOURCE TEXT `toStatus: 'corroborated'`
  // and the absence of `toStatus: 'verified'` — it encoded a LIMITATION (the job
  // could only ever mint corroborated) rather than the invariant. The limitation
  // was the defect: ops.verification_policy has defined a verified tier since
  // 2026-07-19 and nothing read it, so verified sat at 0 no matter the evidence.
  //
  // The invariant that actually matters survives, and is now checked as behaviour:
  // one document buys corroborated and nothing more.
  const tiers: VerificationTier[] = [
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
  const oneDocument = { document_count: 1, missing_anchor: 0, quote_not_in_source: 0 };
  assert.equal(selectTier(oneDocument, tiers).tier?.targetStatus, 'corroborated');

  // And the tier is read from the table, never restated in code — a hardcoded
  // threshold here is how the policy row stopped being consulted in the first place.
  assert.doesNotMatch(source, /minDistinctDocuments:\s*\d/);
});
