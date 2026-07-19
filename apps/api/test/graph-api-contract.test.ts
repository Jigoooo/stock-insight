import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getServableContentPack,
  type ContentPackQueryExecutor,
} from '../src/relations/graph-read-model-v2.ts';

const NOW = new Date('2026-07-19T12:00:00.000Z');

type Row = Record<string, unknown>;

const packRow = (overrides: Row = {}): Row => ({
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
  ...overrides,
});

const itemRow = (overrides: Row = {}): Row => ({
  item_no: 1,
  item_kind: 'relation',
  relation_revision_id: 500,
  relation_evidence_ledger_id: null,
  impact_path_v2_id: null,
  relation_measurement_id: null,
  display_payload: { predicate: 'SUPPLIES' },
  ...overrides,
});

function makeExecutor(rowsBySql: Array<{ match: RegExp; rows: Row[] }>): ContentPackQueryExecutor {
  return {
    async queryRows(sql: string) {
      const found = rowsBySql.find((entry) => entry.match.test(sql));
      return (found?.rows ?? []) as never;
    },
  };
}

describe('B8 graph read model v2 (content pack serving)', () => {
  it('serves a fresh published pack with items in itemNo order', async () => {
    const executor = makeExecutor([
      { match: /v_relation_graph_freshness/, rows: [packRow()] },
      {
        match: /content_pack_item/,
        rows: [itemRow({ item_no: 2, relation_revision_id: 501 }), itemRow()],
      },
    ]);
    const result = await getServableContentPack(executor, {
      packKind: 'entity_relation_graph',
      entityId: 42,
      now: NOW,
    });
    assert.equal(result.status, 'served');
    if (result.status !== 'served') return;
    assert.equal(result.pack.packDigest, 'a'.repeat(64));
    assert.deepEqual(
      result.pack.items.map((i) => i.itemNo),
      [1, 2],
    );
    assert.equal(result.pack.snapshot.snapshotDigest, 'b'.repeat(64));
  });

  it('returns unavailable (never stale data) when no servable pack exists', async () => {
    const executor = makeExecutor([
      { match: /v_relation_graph_freshness/, rows: [] },
      { match: /content_pack_item/, rows: [] },
    ]);
    const result = await getServableContentPack(executor, {
      packKind: 'entity_relation_graph',
      entityId: 42,
      now: NOW,
    });
    assert.equal(result.status, 'unavailable');
    if (result.status !== 'unavailable') return;
    assert.equal(result.reason, 'no_servable_pack');
  });

  it('refuses a pack the DB flags non-servable even if returned', async () => {
    const executor = makeExecutor([
      { match: /v_relation_graph_freshness/, rows: [packRow({ servable: false })] },
      { match: /content_pack_item/, rows: [itemRow()] },
    ]);
    const result = await getServableContentPack(executor, {
      packKind: 'entity_relation_graph',
      entityId: 42,
      now: NOW,
    });
    assert.equal(result.status, 'unavailable');
  });

  it('double-checks freshness in process (defense in depth vs view lag)', async () => {
    const executor = makeExecutor([
      {
        match: /v_relation_graph_freshness/,
        rows: [packRow({ fresh_until: '2026-07-19T11:00:00.000Z' })], // expired vs NOW
      },
      { match: /content_pack_item/, rows: [itemRow()] },
    ]);
    const result = await getServableContentPack(executor, {
      packKind: 'entity_relation_graph',
      entityId: 42,
      now: NOW,
    });
    assert.equal(result.status, 'unavailable');
    if (result.status !== 'unavailable') return;
    assert.equal(result.reason, 'pack_expired');
  });

  it('rejects an item violating the one-anchor contract at read time', async () => {
    const executor = makeExecutor([
      { match: /v_relation_graph_freshness/, rows: [packRow()] },
      {
        match: /content_pack_item/,
        rows: [itemRow({ relation_evidence_ledger_id: 9 })], // two anchors
      },
    ]);
    await assert.rejects(
      () =>
        getServableContentPack(executor, {
          packKind: 'entity_relation_graph',
          entityId: 42,
          now: NOW,
        }),
      /anchor/i,
    );
  });

  it('passes exact parameters to the freshness query (no cross-entity leak)', async () => {
    const captured: Array<readonly unknown[]> = [];
    const executor: ContentPackQueryExecutor = {
      async queryRows(sql: string, params: readonly unknown[] = []) {
        captured.push(params);
        return [] as never;
      },
    };
    await getServableContentPack(executor, {
      packKind: 'impact_brief',
      entityId: 77,
      now: NOW,
    });
    assert.deepEqual(captured[0], ['impact_brief', 77]);
  });
});
