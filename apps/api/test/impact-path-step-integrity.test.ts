import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildImpactPaths, type ImpactPathEdge } from '../src/analytics/impact-path-builder.ts';

const edge = (
  id: number,
  from: number,
  to: number,
  overrides: Partial<ImpactPathEdge> = {},
): ImpactPathEdge => ({
  graphSnapshotEdgeId: id,
  subjectEntityId: from,
  objectEntityId: to,
  predicate: 'SUPPLIES',
  confidence: 0.9,
  ...overrides,
});

const OPTIONS = {
  maxHops: 2,
  hopDecay: 0.7,
  maxPathsPerEvent: 20,
  maxExpandedStates: 1_000,
  stockEntityIds: new Set([20, 30]),
};

describe('B7 impact path builder (v2)', () => {
  it('expands a 1-hop path with exact step edge FKs and multiplicative score', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 0.8 },
      [edge(100, 10, 20)],
      OPTIONS,
    );
    assert.equal(paths.length, 1);
    const path = paths[0]!;
    assert.equal(path.targetEntityId, 20);
    assert.equal(path.hopCount, 1);
    assert.equal(path.steps.length, 1);
    assert.equal(path.steps[0]!.graphSnapshotEdgeId, 100);
    assert.equal(path.steps[0]!.stepNo, 1);
    assert.ok(Math.abs(path.pathScore - 0.8 * 0.9) < 1e-9);
  });

  it('applies hop decay on the second hop and keeps step order', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(100, 10, 15), edge(101, 15, 20)],
      OPTIONS,
    );
    const twoHop = paths.find((p) => p.hopCount === 2)!;
    assert.ok(twoHop);
    assert.equal(twoHop.targetEntityId, 20);
    assert.deepEqual(
      twoHop.steps.map((s) => s.stepNo),
      [1, 2],
    );
    assert.deepEqual(
      twoHop.steps.map((s) => s.graphSnapshotEdgeId),
      [100, 101],
    );
    assert.ok(Math.abs(twoHop.pathScore - 1 * 0.9 * 0.9 * 0.7) < 1e-9);
  });

  it('never exceeds maxHops and never revisits an entity (no cycles)', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(100, 10, 15), edge(101, 15, 10), edge(102, 15, 16), edge(103, 16, 20)],
      OPTIONS,
    );
    assert.ok(paths.every((p) => p.hopCount <= OPTIONS.maxHops));
    for (const path of paths) {
      const visited = [10, ...path.steps.map((s) => s.toEntityId)];
      assert.equal(new Set(visited).size, visited.length, 'cycle detected');
    }
  });

  it('only terminates on stock entities', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(100, 10, 15), edge(101, 15, 20)],
      OPTIONS,
    );
    assert.ok(paths.every((p) => OPTIONS.stockEntityIds.has(p.targetEntityId)));
  });

  it('never traverses through a terminal stock entity', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(100, 10, 20), edge(101, 20, 30)],
      OPTIONS,
    );
    assert.deepEqual(
      paths.map((path) => [path.targetEntityId, path.hopCount]),
      [[20, 1]],
    );
  });

  it('rejects an event whose source is already a terminal stock', () => {
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 1, sourceEntityId: 20, eventStrength: 1 },
          [edge(100, 20, 15), edge(101, 15, 30)],
          OPTIONS,
        ),
      /source.*stock|terminal/i,
    );
  });

  it('bounds output at maxPathsPerEvent keeping the highest scores', () => {
    const edges: ImpactPathEdge[] = [];
    for (let i = 0; i < 30; i += 1) {
      edges.push(edge(200 + i, 10, 20, { confidence: 0.5 + (i % 10) / 25 }));
    }
    const paths = buildImpactPaths({ eventId: 1, sourceEntityId: 10, eventStrength: 1 }, edges, {
      ...OPTIONS,
      maxPathsPerEvent: 5,
    });
    assert.equal(paths.length, 5);
    for (let i = 1; i < paths.length; i += 1) {
      assert.ok(paths[i - 1]!.pathScore >= paths[i]!.pathScore, 'must be sorted desc');
    }
  });

  it('fails closed when traversal exceeds the expanded-state work budget', () => {
    const edges = Array.from({ length: 100 }, (_, index) => edge(1_000 + index, 10, 100 + index));
    assert.throws(
      () =>
        buildImpactPaths({ eventId: 1, sourceEntityId: 10, eventStrength: 1 }, edges, {
          ...OPTIONS,
          maxHops: 4,
          maxExpandedStates: 50,
        }),
      /work budget/i,
    );
  });

  it('is deterministic across edge input order', () => {
    const edges = [edge(100, 10, 15), edge(101, 15, 20), edge(102, 10, 20)];
    const run = (input: ImpactPathEdge[]) =>
      buildImpactPaths({ eventId: 1, sourceEntityId: 10, eventStrength: 1 }, input, OPTIONS).map(
        (p) =>
          `${p.targetEntityId}:${p.pathScore.toFixed(9)}:${p.steps.map((s) => s.graphSnapshotEdgeId).join('-')}`,
      );
    assert.deepEqual(run(edges), run([...edges].reverse()));
  });

  it('uses numeric edge ids and target ids as a total top-K tie-break', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(10, 10, 20), edge(2, 10, 30)],
      { ...OPTIONS, maxPathsPerEvent: 1 },
    );
    assert.equal(paths[0]!.steps[0]!.graphSnapshotEdgeId, 2);
    assert.equal(paths[0]!.targetEntityId, 30);
  });

  it('rejects invalid inputs fail-closed', () => {
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 0, sourceEntityId: 10, eventStrength: 1 },
          [edge(100, 10, 20)],
          OPTIONS,
        ),
      /eventId/i,
    );
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
          [edge(100, 10, 20), edge(100, 10, 30)],
          OPTIONS,
        ),
      /duplicate.*edge/i,
    );
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
          [edge(-1, 10, 20)],
          OPTIONS,
        ),
      /graphSnapshotEdgeId/i,
    );
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
          [edge(100, 10, 20, { confidence: -0 })],
          OPTIONS,
        ),
      /confidence/i,
    );
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 1, sourceEntityId: 10, eventStrength: 1.5 },
          [edge(100, 10, 20)],
          OPTIONS,
        ),
      /eventStrength/i,
    );
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
          [edge(100, 10, 20)],
          { ...OPTIONS, maxHops: 0 },
        ),
      /maxHops/i,
    );
    // Bounded-graph contract: an exponential walk request is rejected outright.
    assert.throws(
      () =>
        buildImpactPaths(
          { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
          [edge(100, 10, 20)],
          { ...OPTIONS, maxHops: 5 },
        ),
      /must not exceed 4/i,
    );
  });
});
