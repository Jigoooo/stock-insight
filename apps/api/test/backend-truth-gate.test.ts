import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { publicBlockTypeForVerification, resolveProductAvailability, PRODUCT_STALE_THRESHOLD_HOURS } from '../src/publish/truth-gate.ts';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const reportPublish = read('../src/publish/run-report-publish.ts');
const eventBrief = read('../src/publish/run-event-brief.ts');
const readModel = read('../src/product/read-model.ts');

// B0 RED case 1: unverified event must never publish as a public `fact` block.
test('only verified events may become public fact blocks', () => {
  assert.equal(publicBlockTypeForVerification('verified'), 'fact');
  for (const status of ['unverified', 'corroborated', 'contradicted', 'retracted', 'untrusted_legacy', '', 'anything']) {
    assert.equal(publicBlockTypeForVerification(status), 'reported_claim');
  }
});

test('publishers select verification_status and derive block type through the truth gate', () => {
  for (const source of [reportPublish, eventBrief]) {
    assert.match(source, /event\.verification_status/);
    assert.match(source, /publicBlockTypeForVerification/);
  }
  // No unconditional fact literal may remain in block construction
  // (the type union `'fact' | ...` in type declarations is allowed).
  assert.doesNotMatch(reportPublish, /block_type: 'fact',/);
  assert.doesNotMatch(eventBrief, /block_type: 'fact',/);
});

// B0 RED case 4: stale rows must not be reported as `available`.
test('product availability degrades to stale when the newest row exceeds the freshness threshold', () => {
  const now = new Date('2026-07-19T12:00:00Z');
  const fresh = new Date('2026-07-19T00:00:00Z').toISOString();
  const old = new Date('2026-07-10T00:00:00Z').toISOString();
  assert.equal(resolveProductAvailability(fresh, 5, now, 80), 'available');
  assert.equal(resolveProductAvailability(old, 5, now, 80), 'stale');
  assert.equal(resolveProductAvailability(null, 0, now, 80), 'missing');
  // Fail-closed: unparsable timestamp with rows present must degrade, not pass as available.
  assert.equal(resolveProductAvailability('not-a-date', 3, now, 80), 'stale');
  assert.ok(PRODUCT_STALE_THRESHOLD_HOURS.featureSnapshot >= 24);
});

test('read model routes list availability through the freshness resolver', () => {
  assert.match(readModel, /resolveProductAvailability/);
  // The unconditional length-only availability mapping is the defect; it must be gone
  // from every dataset read (feature/impact/confirmation/reports/calibration).
  assert.doesNotMatch(readModel, /data\.length \? 'available' : 'missing'/);
});
