import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { classify } from '../src/knowledge/run-claim-corroboration.ts';

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
  assert.match(source, /policy \$\{rule\.policy_version\}/);
});

test('verified is not reached for free', () => {
  assert.match(source, /toStatus: 'corroborated'/);
  assert.doesNotMatch(source, /toStatus: 'verified'/);
});
