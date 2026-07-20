import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildImpactPaths, type ImpactPathEdge } from '../src/analytics/impact-path-builder.ts';
import {
  planPriceCorrelations,
  type PriceObservation,
} from '../src/analytics/price-correlation.ts';
import { planRelationMeasurements } from '../src/analytics/relation-measurement.ts';

const edge = (
  id: number,
  from: number,
  to: number,
  overrides: Partial<ImpactPathEdge> = {},
): ImpactPathEdge => ({
  graphSnapshotEdgeId: id,
  subjectEntityId: from,
  objectEntityId: to,
  predicate: 'SAME_ETF_BASKET',
  confidence: 0.8,
  ...overrides,
});

describe('P0-3 undirected impact-path expansion', () => {
  it('reaches a stock through the REVERSE direction of a snapshot edge', () => {
    // Edge stored as 20 -> 10 in the snapshot; event source is 10.
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(100, 20, 10)],
      {
        maxHops: 2,
        hopDecay: 0.7,
        maxPathsPerEvent: 20,
        maxExpandedStates: 1000,
        stockEntityIds: new Set([20]),
        undirectedEdges: true,
      },
    );
    assert.equal(paths.length, 1);
    assert.equal(paths[0]!.targetEntityId, 20);
    // Step evidence keeps the exact snapshot edge FK and actual traversal direction.
    assert.equal(paths[0]!.steps[0]!.graphSnapshotEdgeId, 100);
    assert.equal(paths[0]!.steps[0]!.fromEntityId, 10);
    assert.equal(paths[0]!.steps[0]!.toEntityId, 20);
  });

  it('directed mode (default) does NOT walk the reverse direction', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(100, 20, 10)],
      {
        maxHops: 2,
        hopDecay: 0.7,
        maxPathsPerEvent: 20,
        maxExpandedStates: 1000,
        stockEntityIds: new Set([20]),
      },
    );
    assert.equal(paths.length, 0);
  });

  it('undirected mode never revisits the origin through the same edge (no self cycle)', () => {
    const paths = buildImpactPaths(
      { eventId: 1, sourceEntityId: 10, eventStrength: 1 },
      [edge(100, 10, 15), edge(101, 15, 20)],
      {
        maxHops: 2,
        hopDecay: 0.7,
        maxPathsPerEvent: 20,
        maxExpandedStates: 1000,
        stockEntityIds: new Set([20]),
        undirectedEdges: true,
      },
    );
    const twoHop = paths.find((path) => path.hopCount === 2);
    assert.ok(twoHop);
    assert.deepEqual(
      twoHop.steps.map((step) => step.graphSnapshotEdgeId),
      [100, 101],
    );
    // No path may contain the origin twice.
    for (const path of paths) {
      const nodes = [path.steps[0]!.fromEntityId, ...path.steps.map((step) => step.toEntityId)];
      assert.equal(new Set(nodes).size, nodes.length);
    }
  });
});

const series = (values: ReadonlyArray<[string, number]>): PriceObservation[] =>
  values.map(([date, value]) => ({ date, value }));

describe('P0-3 price correlation planner', () => {
  const asOf = '2026-07-20T00:00:00.000Z';
  const base: ReadonlyArray<[string, number]> = [
    ['2026-07-06', 100],
    ['2026-07-07', 102],
    ['2026-07-08', 101],
    ['2026-07-09', 105],
    ['2026-07-10', 104],
    ['2026-07-13', 108],
    ['2026-07-14', 107],
    ['2026-07-15', 111],
    ['2026-07-16', 110],
    ['2026-07-17', 114],
    ['2026-07-18', 113],
  ];

  it('perfectly co-moving series produce correlation 1 and PIT-valid windows', () => {
    const doubled = base.map(([date, value]) => [date, value * 2] as [string, number]);
    const priceSeries = new Map([
      [1, series(base)],
      [2, series(doubled)],
    ]);
    const inputs = planPriceCorrelations(
      priceSeries,
      [{ subjectEntityId: 2, objectEntityId: 1 }],
      { asOf, windowDays: 45, minOverlappingReturns: 10, modelVersion: 'test-v1' },
    );
    assert.equal(inputs.length, 1);
    const input = inputs[0]!;
    // Canonical pair ordering: subject < object.
    assert.equal(input.subjectEntityId, 1);
    assert.equal(input.objectEntityId, 2);
    assert.ok(Math.abs(input.value - 1) < 1e-9);
    // The full plan must pass the measurement PIT gate with zero rejections.
    const plan = planRelationMeasurements(inputs, { asOf });
    assert.equal(plan.rejected.length, 0);
    assert.equal(plan.accepted.length, 1);
  });

  it('drops pairs below the minimum overlapping-return threshold', () => {
    const priceSeries = new Map([
      [1, series(base)],
      [2, series(base.slice(0, 4))],
    ]);
    const inputs = planPriceCorrelations(
      priceSeries,
      [{ subjectEntityId: 1, objectEntityId: 2 }],
      { asOf, windowDays: 45, minOverlappingReturns: 10, modelVersion: 'test-v1' },
    );
    assert.equal(inputs.length, 0);
  });

  it('ignores observations after asOf (no lookahead)', () => {
    const withFuture = [...base, ['2026-07-25', 999] as [string, number]];
    const priceSeries = new Map([
      [1, series(withFuture)],
      [2, series(withFuture)],
    ]);
    const inputs = planPriceCorrelations(
      priceSeries,
      [{ subjectEntityId: 1, objectEntityId: 2 }],
      { asOf, windowDays: 45, minOverlappingReturns: 10, modelVersion: 'test-v1' },
    );
    assert.equal(inputs.length, 1);
    assert.ok(new Date(inputs[0]!.windowEnd).getTime() <= new Date(asOf).getTime() + 86_400_000);
    assert.ok(!inputs[0]!.windowEnd.startsWith('2026-07-25'));
  });

  it('deduplicates symmetric pairs and skips self-pairs', () => {
    const priceSeries = new Map([
      [1, series(base)],
      [2, series(base)],
    ]);
    const inputs = planPriceCorrelations(
      priceSeries,
      [
        { subjectEntityId: 1, objectEntityId: 2 },
        { subjectEntityId: 2, objectEntityId: 1 },
        { subjectEntityId: 1, objectEntityId: 1 },
      ],
      { asOf, windowDays: 45, minOverlappingReturns: 10, modelVersion: 'test-v1' },
    );
    assert.equal(inputs.length, 1);
  });
});
