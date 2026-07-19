import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPipelineDag,
  computeSelectiveRecompute,
  verifyProducerCoverage,
} from '../src/ops/pipeline-dag.ts';

const NODES = [
  { datasetKey: 'ingestion.source_revision', producerKey: 'ingest-workers' },
  { datasetKey: 'knowledge.relation_ledger', producerKey: 'b6-relation-builders' },
  { datasetKey: 'analytics.graph_snapshot', producerKey: 'b7-snapshot-builder' },
  { datasetKey: 'analytics.impact_path_v2', producerKey: 'b7-impact-builder' },
  { datasetKey: 'serving.content_pack', producerKey: 'b8-pack-builder' },
];

const EDGES = [
  { from: 'ingestion.source_revision', to: 'knowledge.relation_ledger' },
  { from: 'knowledge.relation_ledger', to: 'analytics.graph_snapshot' },
  { from: 'analytics.graph_snapshot', to: 'analytics.impact_path_v2' },
  { from: 'analytics.graph_snapshot', to: 'serving.content_pack' },
  { from: 'analytics.impact_path_v2', to: 'serving.content_pack' },
];

describe('B9 pipeline DAG + selective recompute + producer coverage', () => {
  it('builds a DAG with deterministic topological order', () => {
    const dag = buildPipelineDag(NODES, EDGES);
    assert.deepEqual(dag.topologicalOrder, [
      'ingestion.source_revision',
      'knowledge.relation_ledger',
      'analytics.graph_snapshot',
      'analytics.impact_path_v2',
      'serving.content_pack',
    ]);
    const reversed = buildPipelineDag([...NODES].reverse(), [...EDGES].reverse());
    assert.deepEqual(reversed.topologicalOrder, dag.topologicalOrder);
  });

  it('rejects cycles fail-closed', () => {
    assert.throws(
      () =>
        buildPipelineDag(NODES, [
          ...EDGES,
          { from: 'serving.content_pack', to: 'ingestion.source_revision' },
        ]),
      /cycle/i,
    );
  });

  it('rejects edges referencing undeclared datasets', () => {
    assert.throws(
      () => buildPipelineDag(NODES, [{ from: 'ghost.dataset', to: 'serving.content_pack' }]),
      /undeclared/i,
    );
  });

  it('selective recompute returns exactly the downstream closure of changed datasets', () => {
    const dag = buildPipelineDag(NODES, EDGES);
    const fromSnapshot = computeSelectiveRecompute(dag, ['analytics.graph_snapshot']);
    assert.deepEqual(fromSnapshot, [
      'analytics.graph_snapshot',
      'analytics.impact_path_v2',
      'serving.content_pack',
    ]);
    const fromPack = computeSelectiveRecompute(dag, ['serving.content_pack']);
    assert.deepEqual(fromPack, ['serving.content_pack']);
    const fromRoot = computeSelectiveRecompute(dag, ['ingestion.source_revision']);
    assert.equal(fromRoot.length, 5);
  });

  it('selective recompute rejects unknown datasets fail-closed', () => {
    const dag = buildPipelineDag(NODES, EDGES);
    assert.throws(() => computeSelectiveRecompute(dag, ['ghost.dataset']), /unknown dataset/i);
  });

  it('producer coverage passes when every dataset has exactly one producer', () => {
    const dag = buildPipelineDag(NODES, EDGES);
    const report = verifyProducerCoverage(dag);
    assert.equal(report.complete, true);
    assert.deepEqual(report.uncovered, []);
    assert.deepEqual(report.conflicts, []);
    assert.equal(report.coverageRatio, 1);
  });

  it('producer coverage fails when a dataset has no producer or two producers', () => {
    const missing = buildPipelineDag(
      [...NODES, { datasetKey: 'analytics.orphan_dataset', producerKey: null }],
      EDGES,
    );
    const missingReport = verifyProducerCoverage(missing);
    assert.equal(missingReport.complete, false);
    assert.deepEqual(missingReport.uncovered, ['analytics.orphan_dataset']);
    assert.ok(missingReport.coverageRatio < 1);

    assert.throws(
      () =>
        buildPipelineDag(
          [...NODES, { datasetKey: 'serving.content_pack', producerKey: 'rogue-producer' }],
          EDGES,
        ),
      /duplicate dataset/i,
    );
  });
});
