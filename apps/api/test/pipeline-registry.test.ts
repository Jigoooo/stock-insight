import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeSelectiveRecompute } from '../src/ops/pipeline-dag.ts';
import {
  CANONICAL_PIPELINE_EDGES,
  CANONICAL_PIPELINE_NODES,
  buildCanonicalPipelineDag,
  evaluatePipelineSlo,
} from '../src/ops/pipeline-registry.ts';

describe('B9 canonical pipeline registry + SLO evaluation', () => {
  it('canonical registry builds a valid DAG with 100% producer coverage', () => {
    const { dag, coverage } = buildCanonicalPipelineDag();
    assert.ok(dag.topologicalOrder.length >= 8);
    assert.equal(coverage.complete, true);
    assert.deepEqual(coverage.uncovered, []);
  });

  it('canonical registry covers every B0~B8 canonical dataset', () => {
    const keys = new Set(CANONICAL_PIPELINE_NODES.map((n) => n.datasetKey));
    for (const required of [
      'ingestion.source_revision',
      'knowledge.relation_ledger',
      'analytics.graph_snapshot',
      'analytics.impact_path_v2',
      'analytics.relation_measurement',
      'analytics.graph_community',
      'serving.content_pack',
      'ops.outbox_event',
    ]) {
      assert.ok(keys.has(required), `registry must declare ${required}`);
    }
  });

  it('every canonical edge is declared over canonical nodes', () => {
    const keys = new Set(CANONICAL_PIPELINE_NODES.map((n) => n.datasetKey));
    for (const edge of CANONICAL_PIPELINE_EDGES) {
      assert.ok(keys.has(edge.from), `${edge.from} undeclared`);
      assert.ok(keys.has(edge.to), `${edge.to} undeclared`);
    }
  });

  it('every content-pack anchor dataset feeds serving.content_pack (recompute closure completeness)', () => {
    // serving.content_pack_item anchors: relation_revision (knowledge.relation_ledger),
    // impact_path_v2, relation_measurement. Each anchor dataset MUST have a path
    // to serving.content_pack, and the DIRECT consumers must be edges so a
    // leaf-only change (e.g. measurement refresh) recomputes the pack.
    const edgeSet = new Set(CANONICAL_PIPELINE_EDGES.map((e) => `${e.from}->${e.to}`));
    for (const anchorDataset of ['analytics.impact_path_v2', 'analytics.relation_measurement']) {
      assert.ok(
        edgeSet.has(`${anchorDataset}->serving.content_pack`),
        `${anchorDataset} is consumed by content pack items and must edge into serving.content_pack`,
      );
    }
    // Anchor datasets upstream of the snapshot are covered transitively.
    const { dag } = buildCanonicalPipelineDag();
    const recompute = new Set(
      // measurement-only change must include the pack.
      computeSelectiveRecompute(dag, ['analytics.relation_measurement']),
    );
    assert.ok(recompute.has('serving.content_pack'));
  });

  it('SLO evaluation flags stale datasets against per-dataset freshness budgets', () => {
    const now = new Date('2026-07-19T12:00:00.000Z');
    const result = evaluatePipelineSlo(
      [
        {
          datasetKey: 'serving.content_pack',
          lastSuccessAt: '2026-07-19T11:00:00.000Z',
          freshnessBudgetHours: 24,
        },
        {
          datasetKey: 'analytics.graph_snapshot',
          lastSuccessAt: '2026-07-16T00:00:00.000Z',
          freshnessBudgetHours: 24,
        },
      ],
      { now },
    );
    assert.equal(result.healthy.length, 1);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]!.datasetKey, 'analytics.graph_snapshot');
    assert.ok(result.violations[0]!.ageHours > 24);
  });

  it('SLO evaluation treats missing lastSuccessAt as a violation (fail-closed)', () => {
    const result = evaluatePipelineSlo(
      [{ datasetKey: 'serving.content_pack', lastSuccessAt: null, freshnessBudgetHours: 24 }],
      { now: new Date('2026-07-19T12:00:00.000Z') },
    );
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]!.reason, 'never_succeeded');
  });

  it('SLO evaluation rejects nonsensical budgets', () => {
    assert.throws(
      () =>
        evaluatePipelineSlo([{ datasetKey: 'x', lastSuccessAt: null, freshnessBudgetHours: 0 }], {
          now: new Date(),
        }),
      /budget/i,
    );
  });
});
