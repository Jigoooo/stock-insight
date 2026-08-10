import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NON_INDUSTRY_CODES,
  planSameIndustryCandidates,
  type ClassifiedSecurity,
} from '../src/relations/same-industry-candidates.ts';

function security(overrides: Partial<ClassifiedSecurity> = {}): ClassifiedSecurity {
  return {
    entityId: 1,
    entityKey: 'US:NVDA',
    taxonomySystem: 'SIC',
    code: '3674',
    sourceRevisionId: 100,
    ...overrides,
  };
}

describe('same-industry candidates come from the classification, not from a guess', () => {
  it('pairs every member of a code with every other, in both directions', () => {
    const { candidates } = planSameIndustryCandidates([
      security({ entityId: 1 }),
      security({ entityId: 2, sourceRevisionId: 101 }),
      security({ entityId: 3, sourceRevisionId: 102 }),
    ]);
    assert.equal(candidates.length, 6);
    assert.ok(candidates.every((row) => row.subjectEntityId !== row.objectEntityId));
    assert.ok(candidates.every((row) => row.degree === 2));
  });

  it('never pairs a security with itself', () => {
    const { candidates } = planSameIndustryCandidates([security(), security()]);
    // Two rows for the same entity id are the same security seen twice, not a pair.
    assert.equal(candidates.length, 0);
  });

  it('does not join across classification systems', () => {
    // KSIC 2612 and SIC 2612 are unrelated things that happen to share four digits.
    const { candidates } = planSameIndustryCandidates([
      security({ entityId: 1, taxonomySystem: 'SIC', code: '2612' }),
      security({ entityId: 2, taxonomySystem: 'KSIC', code: '2612', sourceRevisionId: 101 }),
    ]);
    assert.equal(candidates.length, 0);
  });

  it('refuses a code that groups by legal form rather than by business', () => {
    // KSIC 64992 지주회사 is the widest group in the universe and holds six bank groups
    // next to a shipbuilder and a battery materials maker. Left in, it would be the
    // single largest source of edges in the graph and every one would be false.
    const { candidates, skippedCodes } = planSameIndustryCandidates([
      security({ entityId: 1, taxonomySystem: 'KSIC', code: '64992' }),
      security({ entityId: 2, taxonomySystem: 'KSIC', code: '64992', sourceRevisionId: 101 }),
    ]);
    assert.equal(candidates.length, 0);
    assert.equal(skippedCodes.length, 1);
    assert.match(skippedCodes[0]?.reason ?? '', /legal form/);
    assert.equal(skippedCodes[0]?.members, 2);
  });

  it('refuses UNCLASSIFIED, because a shared absence is not a shared industry', () => {
    const { candidates, skippedCodes } = planSameIndustryCandidates([
      security({ entityId: 1, code: 'UNCLASSIFIED' }),
      security({ entityId: 2, code: 'UNCLASSIFIED', sourceRevisionId: 101 }),
    ]);
    assert.equal(candidates.length, 0);
    assert.equal(skippedCodes.length, 1);
  });

  it('reports every skipped code rather than dropping it', () => {
    const { skippedCodes } = planSameIndustryCandidates(
      Object.keys(NON_INDUSTRY_CODES).flatMap((code, index) => [
        security({ entityId: index * 2 + 1, taxonomySystem: 'KSIC', code }),
        security({ entityId: index * 2 + 2, taxonomySystem: 'KSIC', code, sourceRevisionId: 200 }),
      ]),
    );
    assert.equal(skippedCodes.length, Object.keys(NON_INDUSTRY_CODES).length);
    assert.ok(skippedCodes.every((entry) => entry.reason.length > 20));
  });

  it('counts a code with one member instead of silently producing nothing', () => {
    const { candidates, singletonCodes } = planSameIndustryCandidates([security()]);
    assert.equal(candidates.length, 0);
    assert.equal(singletonCodes, 1);
  });
});

describe('the candidate carries what a policy will need, and asserts nothing about it', () => {
  it('counts a distinct revision per traceable side', () => {
    const { candidates } = planSameIndustryCandidates([
      security({ entityId: 1, sourceRevisionId: 100 }),
      security({ entityId: 2, sourceRevisionId: 101 }),
    ]);
    assert.deepEqual(candidates[0]?.distinctSourceRevisionIds, [100, 101]);
  });

  it('counts one when both sides were reported by the same revision', () => {
    // Half an edge, not a whole one: a source-revision minimum exists to catch exactly
    // this, so the count must not double a single observation.
    const { candidates } = planSameIndustryCandidates([
      security({ entityId: 1, sourceRevisionId: 100 }),
      security({ entityId: 2, sourceRevisionId: 100 }),
    ]);
    assert.deepEqual(candidates[0]?.distinctSourceRevisionIds, [100]);
  });

  it('counts none when the classification came from the untraceable legacy import', () => {
    const { candidates } = planSameIndustryCandidates([
      security({ entityId: 1, sourceRevisionId: null }),
      security({ entityId: 2, sourceRevisionId: null }),
    ]);
    assert.deepEqual(candidates[0]?.distinctSourceRevisionIds, []);
  });

  it('reports the per-endpoint degree a superhub rule would read', () => {
    const { candidates } = planSameIndustryCandidates(
      Array.from({ length: 5 }, (_, index) =>
        security({ entityId: index + 1, sourceRevisionId: 100 + index }),
      ),
    );
    assert.ok(candidates.every((row) => row.degree === 4));
  });
});
