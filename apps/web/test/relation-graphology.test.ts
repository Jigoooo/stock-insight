import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRelationGraph } from '../src/pages/research-workspace/model/relation-graphology.ts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

const fixture: EntityRelationGraph = {
  meta: {
    snapshotRevision: 'rev-p1-sigma',
    generatedAt: '2026-07-20T00:00:00.000Z',
    knownThroughAt: '2026-07-20T00:00:00.000Z',
    sourceRunIds: ['run-p1-sigma'],
    sourceSnapshotIds: ['snapshot-p1-sigma'],
    isStale: false,
  },
  rootEntityKey: 'KR:005930',
  depth: 1,
  nodes: [
    {
      entityKey: 'KR:005930',
      label: '삼성전자',
      market: 'KR',
      watched: true,
      holding: true,
    },
    {
      entityKey: 'KR:000660',
      label: 'SK하이닉스',
      market: 'KR',
      watched: true,
      holding: false,
    },
    {
      entityKey: 'US:NVDA',
      label: 'NVIDIA',
      market: 'US',
      watched: false,
      holding: false,
    },
  ],
  edges: [
    {
      edgeId: 'edge-peer',
      from: 'KR:005930',
      to: 'KR:000660',
      relationType: 'peer',
      direction: 'undirected',
      weight: 0.8,
      approved: true,
      inferred: false,
      evidenceQuality: 'high',
      evidenceCount: 3,
      clickableSourceCount: 2,
    },
    {
      edgeId: 'edge-news',
      from: 'KR:005930',
      to: 'US:NVDA',
      relationType: 'news_co_mention',
      direction: 'directed',
      weight: 0.4,
      approved: true,
      inferred: false,
      evidenceQuality: 'medium',
      evidenceCount: 2,
      clickableSourceCount: 1,
    },
  ],
  evidenceSummary: {
    evidenceCount: 5,
    clickableSourceCount: 3,
    limitation: '검증된 관계만 표시합니다.',
  },
};

describe('buildRelationGraph', () => {
  it('preserves exact entity and edge identities without inventing graph data', () => {
    const graph = buildRelationGraph(fixture);

    assert.deepEqual(
      new Set(graph.nodes()),
      new Set(fixture.nodes.map(({ entityKey }) => entityKey)),
    );
    assert.deepEqual(new Set(graph.edges()), new Set(fixture.edges.map(({ edgeId }) => edgeId)));
    assert.equal(graph.order, fixture.nodes.length);
    assert.equal(graph.size, fixture.edges.length);
  });

  it('pins the root and carries personal/evidence display attributes', () => {
    const graph = buildRelationGraph(fixture);
    const root = graph.getNodeAttributes('KR:005930');
    const watched = graph.getNodeAttributes('KR:000660');
    const highEvidence = graph.getEdgeAttributes('edge-peer');

    assert.equal(root.isRoot, true);
    assert.equal(root.fixed, true);
    assert.equal(root.holding, true);
    assert.equal(root.x, 0);
    assert.equal(root.y, 0);
    for (const node of graph.nodes()) {
      const { x, y } = graph.getNodeAttributes(node);
      assert.ok(x >= -1 && x <= 1);
      assert.ok(y >= -1 && y <= 1);
    }
    assert.equal(watched.watched, true);
    assert.equal(highEvidence.evidenceQuality, 'high');
    assert.equal(highEvidence.relationType, 'peer');
    assert.ok(highEvidence.size >= 0.35 && highEvidence.size <= 1.1);
  });

  it('preserves directedness from the API contract', () => {
    const graph = buildRelationGraph(fixture);

    assert.equal(graph.isUndirected('edge-peer'), true);
    assert.equal(graph.isDirected('edge-news'), true);
    assert.equal(graph.source('edge-news'), 'KR:005930');
    assert.equal(graph.target('edge-news'), 'US:NVDA');
    assert.equal(graph.getEdgeAttribute('edge-peer', 'type'), 'line');
    assert.equal(graph.getEdgeAttribute('edge-news', 'type'), 'arrow');
  });

  it('lays out every API node across the 20/21 boundary', () => {
    const nodes: EntityRelationGraph['nodes'] = Array.from({ length: 21 }, (_, index) => ({
      entityKey: `US:NODE-${index}`,
      label: `Node ${index}`,
      market: 'US',
      watched: false,
      holding: false,
    }));
    const graph = buildRelationGraph({
      ...fixture,
      rootEntityKey: nodes[0]!.entityKey,
      nodes,
      edges: [],
    });

    assert.equal(graph.order, 21);
    for (const node of graph.nodes()) {
      const { x, y } = graph.getNodeAttributes(node);
      assert.ok(Number.isFinite(x));
      assert.ok(Number.isFinite(y));
      assert.ok(x >= -1 && x <= 1);
      assert.ok(y >= -1 && y <= 1);
    }
  });

  it('fails closed when an edge is not human-approved or is inferred', () => {
    for (const edgePatch of [{ approved: false }, { inferred: true }]) {
      const edge = { ...fixture.edges[0]!, ...edgePatch };
      assert.throws(
        () => buildRelationGraph({ ...fixture, edges: [edge] }),
        /verified relation edge/i,
      );
    }
  });
});
