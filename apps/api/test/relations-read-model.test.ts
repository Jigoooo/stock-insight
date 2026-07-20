import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getEntityRelations,
  type RelationGraphQueryExecutor,
} from '../src/relations/read-model.ts';

const userScope = { userId: '11111111-1111-4111-8111-111111111111' } as const;

function createStaleExecutor() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const executor: RelationGraphQueryExecutor = {
    async queryRows(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('publication_projection_status')) {
        return [
          {
            analysis_run_id: 'stock:2026-07-16:us_premarket',
            analysis_revision: 1,
            cutoff_at: '2026-07-16T13:05:26.678Z',
            source_watermark_at: '2026-07-16T12:47:35.000Z',
            fresh_until: '2026-07-17T07:05:26.678Z',
            projection_status: 'stale',
          },
        ];
      }
      if (sql.includes('FROM public.entities root_entity')) {
        return [
          {
            id: 1,
            entity_key: 'US:NVDA',
            label: 'NVIDIA',
            market: 'US',
            watched: true,
            holding: false,
          },
        ];
      }
      if (sql.includes('ops.temporal_graph_edge')) {
        return [
          {
            edge_id: 'peer:nvda:amd:4',
            relation_type: 'peer',
            direction: 'undirected',
            normalized_weight: 0.8,
            evidence_quality: 'high',
            evidence_count: 2,
            clickable_source_count: 1,
            src_entity_key: 'US:NVDA',
            src_label: 'NVIDIA',
            src_market: 'US',
            src_watched: true,
            src_holding: false,
            dst_entity_key: 'US:AMD',
            dst_label: 'AMD',
            dst_market: 'US',
            dst_watched: false,
            dst_holding: false,
          },
        ];
      }
      if (sql.includes('market_snapshots')) {
        return [{ market_data_as_of: '2026-07-16T12:40:00.000Z' }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return { calls, executor };
}

describe('entity relation graph', () => {
  it('serves approved relation evidence from the requested stale publication snapshot', async () => {
    const { calls, executor } = createStaleExecutor();
    const graph = await getEntityRelations(executor, {
      userScope,
      entityKey: 'US:NVDA',
      depth: 1,
      now: new Date('2026-07-16T15:55:00.000Z'),
      snapshot: {
        analysisRunId: 'stock:2026-07-16:us_premarket',
        analysisRevision: 1,
      },
    });

    if (!graph) assert.fail('expected stale relation graph');
    assert.equal(graph.meta.freshness, 'stale');
    assert.deepEqual(graph.meta.contentSnapshot, {
      analysisRunId: 'stock:2026-07-16:us_premarket',
      analysisRevision: 1,
      analysisCutoffAt: '2026-07-16T13:05:26.678Z',
      sourceWatermarkAt: '2026-07-16T12:47:35.000Z',
      freshUntil: '2026-07-17T07:05:26.678Z',
    });
    assert.equal(graph.rootEntityKey, 'US:NVDA');
    assert.deepEqual(
      graph.nodes.map(({ entityKey }) => entityKey),
      ['US:NVDA', 'US:AMD'],
    );
    assert.deepEqual(graph.edges[0], {
      edgeId: 'peer:nvda:amd:4',
      from: 'US:NVDA',
      to: 'US:AMD',
      relationType: 'peer',
      direction: 'undirected',
      weight: 0.8,
      approved: true,
      inferred: false,
      evidenceQuality: 'high',
      evidenceCount: 2,
      clickableSourceCount: 1,
    });
    assert.equal(graph.evidenceSummary.evidenceCount, 2);
    const projectionCall = calls.find(({ sql }) => sql.includes('publication_projection_status'));
    assert.match(projectionCall?.sql ?? '', /projection_status\s+IN\s+\('available',\s*'stale'\)/);
    assert.ok(calls.some(({ params }) => params.includes('2026-07-16T13:05:26.678Z')));
    assert.deepEqual(projectionCall?.params, ['stock:2026-07-16:us_premarket', 1]);
  });
});
