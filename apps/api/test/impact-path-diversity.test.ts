import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildImpactPaths, type ImpactPathEdge } from '../src/analytics/impact-path-builder.ts';

/**
 * The per-event path budget must be spent across kinds of connection.
 *
 * Measured on production 2026-08-05: 502 of 655 events produced paths that all
 * used a single predicate, and only 2 events reached three. A UAL event had 68
 * SAME_ETF_BASKET edges at a flat 0.800 against 2 MACRO_COMOVEMENT at 0.391, so
 * every one of its 20 paths said "same ETF" and the macro edge — the one that
 * explains something the other 19 do not — was unreachable no matter how many
 * macro edges the graph gained.
 */
const SOURCE = 1;

function edge(
  id: number,
  from: number,
  to: number,
  predicate: string,
  confidence: number,
): ImpactPathEdge {
  return {
    graphSnapshotEdgeId: id,
    subjectEntityId: from,
    objectEntityId: to,
    predicate,
    confidence,
  };
}

describe('impact path budget diversity', () => {
  it('does not let one predicate take every slot when another is available', () => {
    // 30 high-confidence basket edges and 2 lower-confidence macro edges, the
    // shape production actually has.
    const edges: ImpactPathEdge[] = [];
    const stocks = new Set<number>();
    for (let i = 0; i < 30; i += 1) {
      const target = 100 + i;
      edges.push(edge(i + 1, SOURCE, target, 'SAME_ETF_BASKET', 0.8));
      stocks.add(target);
    }
    for (let i = 0; i < 2; i += 1) {
      const target = 200 + i;
      edges.push(edge(500 + i, SOURCE, target, 'MACRO_COMOVEMENT', 0.391));
      stocks.add(target);
    }

    const paths = buildImpactPaths(
      { eventId: 7, sourceEntityId: SOURCE, eventStrength: 1 },
      edges,
      {
        maxHops: 2,
        hopDecay: 0.7,
        maxPathsPerEvent: 20,
        maxExpandedStates: 10_000,
        stockEntityIds: stocks,
        undirectedEdges: true,
      },
    );

    assert.equal(paths.length, 20, 'the budget is still spent in full');
    const used = new Set(
      paths.flatMap((path) =>
        path.steps.map(
          (step) =>
            edges.find((e) => e.graphSnapshotEdgeId === step.graphSnapshotEdgeId)!.predicate,
        ),
      ),
    );
    assert.ok(
      used.has('MACRO_COMOVEMENT'),
      'the scarce predicate must reach the selection; ranking by score alone drops it',
    );
    assert.ok(used.has('SAME_ETF_BASKET'), 'the dominant predicate is not excluded either');
  });

  it('leaves confidence alone — the strongest path is still first', () => {
    const stocks = new Set([100, 200]);
    const edges = [
      edge(1, SOURCE, 100, 'SAME_ETF_BASKET', 0.8),
      edge(2, SOURCE, 200, 'MACRO_COMOVEMENT', 0.3),
    ];
    const paths = buildImpactPaths(
      { eventId: 8, sourceEntityId: SOURCE, eventStrength: 1 },
      edges,
      {
        maxHops: 2,
        hopDecay: 0.7,
        maxPathsPerEvent: 20,
        maxExpandedStates: 10_000,
        stockEntityIds: stocks,
        undirectedEdges: true,
      },
    );
    // Diversity changes which paths are kept, never their order or their score.
    assert.equal(paths[0]!.targetEntityId, 100);
    assert.ok(paths[0]!.pathScore > paths[1]!.pathScore);
  });

  it('is unchanged when only one predicate exists', () => {
    const stocks = new Set<number>();
    const edges: ImpactPathEdge[] = [];
    for (let i = 0; i < 25; i += 1) {
      const target = 100 + i;
      edges.push(edge(i + 1, SOURCE, target, 'SAME_ETF_BASKET', 0.9 - i * 0.01));
      stocks.add(target);
    }
    const paths = buildImpactPaths(
      { eventId: 9, sourceEntityId: SOURCE, eventStrength: 1 },
      edges,
      {
        maxHops: 2,
        hopDecay: 0.7,
        maxPathsPerEvent: 20,
        maxExpandedStates: 10_000,
        stockEntityIds: stocks,
        undirectedEdges: true,
      },
    );
    assert.equal(paths.length, 20);
    // Highest confidence first, exactly as before the change.
    assert.equal(paths[0]!.targetEntityId, 100);
  });
});
