import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getEntityRelationsWithV2Preference,
  type EntityRelationSourceExecutor,
} from '../src/relations/entity-relation-adapter.ts';

const NOW = new Date('2026-07-19T12:00:00.000Z');
const USER_ID = '00000000-0000-4000-8000-000000000001';

const VALID_META = {
  schemaVersion: 'v3',
  visibility: 'internal',
  generatedAt: '2026-07-19T00:00:00.000Z',
  freshness: 'available',
  contentSnapshot: {
    analysisRunId: 'run-1',
    analysisRevision: 1,
    analysisCutoffAt: '2026-07-19T00:00:00.000Z',
    sourceWatermarkAt: '2026-07-19T00:00:00.000Z',
    freshUntil: '2026-07-22T00:00:00.000Z',
  },
  graphSnapshot: {
    requestedAsOf: '2026-07-19T00:00:00.000Z',
    knownThroughAt: '2026-07-19T00:00:00.000Z',
    edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
  },
  marketSnapshot: { marketDataAsOf: null },
  sourceCoverage: { linked: 0, clickable: 0, total: 0 },
  qualityFlags: [],
};

const V1_GRAPH = {
  meta: VALID_META,
  rootEntityKey: 'KR:005930',
  depth: 1,
  nodes: [
    { entityKey: 'KR:005930', label: '삼성전자', market: 'KR', watched: true, holding: false },
  ],
  edges: [],
  evidenceSummary: { evidenceCount: 0, clickableSourceCount: 0, limitation: 'v1 legacy path' },
};

type Row = Record<string, unknown>;

function makeExecutor(config: {
  packRows?: Row[];
  itemRows?: Row[];
  entityRows?: Row[];
  userStateRows?: Row[];
  onQuery?: (sql: string) => void;
}): EntityRelationSourceExecutor {
  return {
    async queryRows(sql: string, params: readonly unknown[] = []) {
      config.onQuery?.(sql);
      if (/v_relation_graph_freshness/.test(sql)) return (config.packRows ?? []) as never;
      if (/content_pack_item/.test(sql)) return (config.itemRows ?? []) as never;
      if (/entity_identifier/.test(sql)) return (config.entityRows ?? []) as never;
      if (/user_watchlist/.test(sql)) {
        const entityKeys = Array.isArray(params[0]) ? params[0] : [];
        return (config.userStateRows ??
          entityKeys.map((entityKey) => ({
            entity_key: entityKey,
            watched: false,
            holding: false,
          }))) as never;
      }
      return [] as never;
    },
  };
}

describe('B8/UI — entity relation adapter (v2 preference, v1 fallback)', () => {
  it('falls back to v1 when the entity has no internal-key mapping', async () => {
    const executor = makeExecutor({ entityRows: [] });
    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => V1_GRAPH as never,
    });
    assert.equal(result.source, 'v1_fallback');
    assert.equal(result.graph, V1_GRAPH);
  });

  it('falls back to v1 when no servable content pack exists', async () => {
    const executor = makeExecutor({
      entityRows: [{ entity_id: 42 }],
      packRows: [],
    });
    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => V1_GRAPH as never,
    });
    assert.equal(result.source, 'v1_fallback');
    assert.equal(result.graph, V1_GRAPH);
  });

  it('serves the v2 pack graph when a servable pack carries a valid graph payload', async () => {
    const graphPayload = {
      ...V1_GRAPH,
      evidenceSummary: { evidenceCount: 0, clickableSourceCount: 0, limitation: 'v2 content pack' },
    };
    const executor = makeExecutor({
      entityRows: [{ entity_id: 42 }],
      packRows: [
        {
          content_pack_id: 1,
          pack_kind: 'entity_relation_graph',
          entity_id: 42,
          graph_snapshot_id: 7,
          builder_version: 'pack-v1',
          pack_digest: 'a'.repeat(64),
          built_at: '2026-07-19T00:00:00.000Z',
          fresh_until: '2026-07-22T00:00:00.000Z',
          status: 'published',
          as_of: '2026-07-19T00:00:00.000Z',
          known_at: '2026-07-19T00:00:00.000Z',
          snapshot_digest: 'b'.repeat(64),
          servable: true,
        },
      ],
      itemRows: [
        {
          item_no: 1,
          item_kind: 'relation',
          relation_revision_id: 500,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: graphPayload },
        },
      ],
    });
    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => {
        throw new Error('v1 must not be called when v2 serves');
      },
    });
    assert.equal(result.source, 'v2_content_pack');
    if (result.source !== 'v2_content_pack') return;
    assert.equal(result.graph.evidenceSummary.limitation, 'v2 content pack');
    assert.equal(result.packDigest, 'a'.repeat(64));
  });

  it('overlays user-specific watched and holding state instead of trusting shared pack values', async () => {
    const executor = makeExecutor({
      entityRows: [{ entity_id: 42 }],
      packRows: [
        {
          content_pack_id: 1,
          pack_kind: 'entity_relation_graph',
          entity_id: 42,
          graph_snapshot_id: 7,
          builder_version: 'pack-v1',
          pack_digest: 'a'.repeat(64),
          built_at: '2026-07-19T00:00:00.000Z',
          fresh_until: '2026-07-22T00:00:00.000Z',
          status: 'published',
          as_of: '2026-07-19T00:00:00.000Z',
          known_at: '2026-07-19T00:00:00.000Z',
          snapshot_digest: 'b'.repeat(64),
          servable: true,
        },
      ],
      itemRows: [
        {
          item_no: 1,
          item_kind: 'relation',
          relation_revision_id: 500,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: V1_GRAPH },
        },
      ],
      userStateRows: [{ entity_key: 'KR:005930', watched: false, holding: true }],
    });

    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => {
        throw new Error('v1 must not be called when a personalized v2 graph is available');
      },
    });

    assert.equal(result.source, 'v2_content_pack');
    assert.equal(result.graph.nodes[0]?.watched, false);
    assert.equal(result.graph.nodes[0]?.holding, true);
  });

  it('rejects Zod-valid v2 graphs that do not match the requested root and depth', async () => {
    const executor = makeExecutor({
      entityRows: [{ entity_id: 42 }],
      packRows: [
        {
          content_pack_id: 1,
          pack_kind: 'entity_relation_graph',
          entity_id: 42,
          graph_snapshot_id: 7,
          builder_version: 'pack-v1',
          pack_digest: 'a'.repeat(64),
          built_at: '2026-07-19T00:00:00.000Z',
          fresh_until: '2026-07-22T00:00:00.000Z',
          status: 'published',
          as_of: '2026-07-19T00:00:00.000Z',
          known_at: '2026-07-19T00:00:00.000Z',
          snapshot_digest: 'b'.repeat(64),
          servable: true,
        },
      ],
      itemRows: [
        {
          item_no: 1,
          item_kind: 'relation',
          relation_revision_id: 500,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: { ...V1_GRAPH, rootEntityKey: 'US:AAPL' } },
        },
        {
          item_no: 2,
          item_kind: 'relation',
          relation_revision_id: 501,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: { ...V1_GRAPH, depth: 2 } },
        },
      ],
    });

    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => V1_GRAPH,
    });

    assert.equal(result.source, 'v1_fallback');
    assert.equal(result.graph, V1_GRAPH);
  });

  it('skips stale and internally expired graph payloads even when the pack envelope is fresh', async () => {
    const staleGraph = {
      ...V1_GRAPH,
      meta: { ...VALID_META, freshness: 'stale' as const },
      evidenceSummary: { ...V1_GRAPH.evidenceSummary, limitation: 'stale graph' },
    };
    const expiredGraph = {
      ...V1_GRAPH,
      meta: {
        ...VALID_META,
        contentSnapshot: {
          ...VALID_META.contentSnapshot,
          freshUntil: '2026-07-19T11:59:59.000Z',
        },
      },
      evidenceSummary: { ...V1_GRAPH.evidenceSummary, limitation: 'expired graph' },
    };
    const availableGraph = {
      ...V1_GRAPH,
      evidenceSummary: { ...V1_GRAPH.evidenceSummary, limitation: 'available graph' },
    };
    const executor = makeExecutor({
      entityRows: [{ entity_id: 42 }],
      packRows: [
        {
          content_pack_id: 1,
          pack_kind: 'entity_relation_graph',
          entity_id: 42,
          graph_snapshot_id: 7,
          builder_version: 'pack-v1',
          pack_digest: 'a'.repeat(64),
          built_at: '2026-07-19T00:00:00.000Z',
          fresh_until: '2026-07-22T00:00:00.000Z',
          status: 'published',
          as_of: '2026-07-19T00:00:00.000Z',
          known_at: '2026-07-19T00:00:00.000Z',
          snapshot_digest: 'b'.repeat(64),
          servable: true,
        },
      ],
      itemRows: [
        {
          item_no: 1,
          item_kind: 'relation',
          relation_revision_id: 500,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: staleGraph },
        },
        {
          item_no: 2,
          item_kind: 'relation',
          relation_revision_id: 501,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: expiredGraph },
        },
        {
          item_no: 3,
          item_kind: 'relation',
          relation_revision_id: 502,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: availableGraph },
        },
      ],
    });

    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => null,
    });

    assert.equal(result.source, 'v2_content_pack');
    assert.equal(result.graph?.evidenceSummary.limitation, 'available graph');
  });

  it('finds a valid graph payload after higher-ranked non-graph items', async () => {
    const graphPayload = {
      ...V1_GRAPH,
      evidenceSummary: { evidenceCount: 0, clickableSourceCount: 0, limitation: 'v2 later item' },
    };
    const executor = makeExecutor({
      entityRows: [{ entity_id: 42 }],
      packRows: [
        {
          content_pack_id: 1,
          pack_kind: 'entity_relation_graph',
          entity_id: 42,
          graph_snapshot_id: 7,
          builder_version: 'pack-v1',
          pack_digest: 'a'.repeat(64),
          built_at: '2026-07-19T00:00:00.000Z',
          fresh_until: '2026-07-22T00:00:00.000Z',
          status: 'published',
          as_of: '2026-07-19T00:00:00.000Z',
          known_at: '2026-07-19T00:00:00.000Z',
          snapshot_digest: 'b'.repeat(64),
          servable: true,
        },
      ],
      itemRows: [
        {
          item_no: 1,
          item_kind: 'relation',
          relation_revision_id: 500,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { label: 'higher-ranked relation' },
        },
        {
          item_no: 2,
          item_kind: 'relation',
          relation_revision_id: 501,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { graph: graphPayload },
        },
      ],
    });

    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => null,
    });

    assert.equal(result.source, 'v2_content_pack');
    assert.equal(result.graph?.evidenceSummary.limitation, 'v2 later item');
  });

  it('falls back to v1 (fail-safe) when the v2 payload does not carry a graph', async () => {
    const executor = makeExecutor({
      entityRows: [{ entity_id: 42 }],
      packRows: [
        {
          content_pack_id: 1,
          pack_kind: 'entity_relation_graph',
          entity_id: 42,
          graph_snapshot_id: 7,
          builder_version: 'pack-v1',
          pack_digest: 'a'.repeat(64),
          built_at: '2026-07-19T00:00:00.000Z',
          fresh_until: '2026-07-22T00:00:00.000Z',
          status: 'published',
          as_of: '2026-07-19T00:00:00.000Z',
          known_at: '2026-07-19T00:00:00.000Z',
          snapshot_digest: 'b'.repeat(64),
          servable: true,
        },
      ],
      itemRows: [
        {
          item_no: 1,
          item_kind: 'relation',
          relation_revision_id: 500,
          relation_evidence_ledger_id: null,
          impact_path_v2_id: null,
          relation_measurement_id: null,
          display_payload: { notAGraph: true },
        },
      ],
    });
    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => V1_GRAPH as never,
    });
    assert.equal(result.source, 'v1_fallback');
    assert.equal(result.graph, V1_GRAPH);
  });

  it('never lets a v2 read failure break the page — falls back to v1', async () => {
    const executor: EntityRelationSourceExecutor = {
      async queryRows(sql: string) {
        if (/^(?:SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)\b/.test(sql)) {
          return [] as never;
        }
        if (/entity_identifier/.test(sql)) return [{ entity_id: 42 }] as never;
        throw new Error('v2 storage outage');
      },
    };
    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => V1_GRAPH as never,
    });
    assert.equal(result.source, 'v1_fallback');
    assert.equal(result.graph, V1_GRAPH);
  });

  it('recovers an aborted PostgreSQL snapshot before loading v1 on the same executor', async () => {
    let aborted = false;
    let savepointActive = false;
    const executor: EntityRelationSourceExecutor = {
      async queryRows(sql: string) {
        if (/^SAVEPOINT\b/.test(sql)) {
          savepointActive = true;
          return [] as never;
        }
        if (/^ROLLBACK TO SAVEPOINT\b/.test(sql)) {
          assert.equal(savepointActive, true);
          aborted = false;
          return [] as never;
        }
        if (/^RELEASE SAVEPOINT\b/.test(sql)) {
          assert.equal(savepointActive, true);
          savepointActive = false;
          return [] as never;
        }
        if (aborted) {
          const error = new Error('current transaction is aborted');
          Object.assign(error, { code: '25P02' });
          throw error;
        }
        if (/entity_identifier/.test(sql)) return [{ entity_id: 42 }] as never;
        if (/v_relation_graph_freshness/.test(sql)) {
          aborted = true;
          throw new Error('relation v2 is not deployed yet');
        }
        if (/legacy_relation_graph/.test(sql)) return [] as never;
        return [] as never;
      },
    };

    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey: 'KR:005930',
      depth: 1,
      userId: USER_ID,
      now: NOW,
      loadV1: async () => {
        await executor.queryRows('SELECT * FROM legacy_relation_graph');
        return V1_GRAPH;
      },
    });

    assert.equal(result.source, 'v1_fallback');
    assert.equal(result.graph, V1_GRAPH);
    assert.equal(aborted, false);
    assert.equal(savepointActive, false);
  });
});
