import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assignCommunities } from '../src/analytics/graph-community.ts';
import type { SnapshotEdgeInput } from '../src/analytics/graph-snapshot.ts';

const edge = (
  id: number,
  from: number,
  to: number,
  overrides: Partial<SnapshotEdgeInput> = {},
): SnapshotEdgeInput => ({
  relationRevisionId: id,
  subjectEntityId: from,
  objectEntityId: to,
  predicate: 'SUPPLIES',
  relationKind: 'structural',
  confidence: 0.9,
  ...overrides,
});

describe('B7 graph community assignment', () => {
  it('separates disconnected components into distinct communities', () => {
    const result = assignCommunities([edge(1, 1, 2), edge(2, 2, 3), edge(3, 10, 11)], {
      minCommunitySize: 2,
    });
    assert.equal(result.communities.length, 2);
    const sizes = result.communities.map((c) => c.memberEntityIds.length).sort();
    assert.deepEqual(sizes, [2, 3]);
    assert.equal(result.algorithm, 'connected-components-v1');
    assert.ok(result.parameters);
  });

  it('community keys are deterministic across input order (stability)', () => {
    const edges = [edge(1, 1, 2), edge(2, 2, 3), edge(3, 10, 11), edge(4, 11, 12)];
    const a = assignCommunities(edges, { minCommunitySize: 2 });
    const b = assignCommunities([...edges].reverse(), { minCommunitySize: 2 });
    assert.deepEqual(
      a.communities.map((c) => `${c.communityKey}:${c.memberEntityIds.join(',')}`),
      b.communities.map((c) => `${c.communityKey}:${c.memberEntityIds.join(',')}`),
    );
  });

  it('drops singleton components below minCommunitySize', () => {
    const result = assignCommunities([edge(1, 1, 2)], { minCommunitySize: 3 });
    assert.equal(result.communities.length, 0);
  });

  it('community labels never masquerade as themes — no theme fields emitted', () => {
    const result = assignCommunities([edge(1, 1, 2)], { minCommunitySize: 2 });
    for (const community of result.communities) {
      assert.ok(!('themeId' in community));
      assert.ok(!('themeKey' in community));
      assert.match(community.communityKey, /^cc-v1-/);
    }
  });

  it('adding one edge only changes the affected component key', () => {
    const base = [edge(1, 1, 2), edge(3, 10, 11)];
    const before = assignCommunities(base, { minCommunitySize: 2 });
    const after = assignCommunities([...base, edge(4, 2, 3)], { minCommunitySize: 2 });
    const beforeKeys = new Map(
      before.communities.map((c) => [c.memberEntityIds[0], c.communityKey]),
    );
    const afterKeys = new Map(after.communities.map((c) => [c.memberEntityIds[0], c.communityKey]));
    // The untouched {10,11} component keeps its exact key.
    assert.equal(beforeKeys.get(10), afterKeys.get(10));
    // The grown component's key changes because membership changed.
    assert.notEqual(beforeKeys.get(1), afterKeys.get(1));
  });
});
