import assert from 'node:assert/strict';
import test from 'node:test';

import { getImpactBrief } from '../src/product/read-model.ts';

// getImpactSummaries reads serving.impact_summary_v1, which is empty by
// construction and will stay that way (docs/operations/impact-plane-v1-v2.md).
// This read model serves the v2 plane through impact_brief content packs, which
// is the surface the product should actually render.

const NOW = new Date('2026-08-02T16:00:00.000Z');
const FRESH = new Date('2026-08-04T01:00:00.000Z').toISOString();
const BUILT = new Date('2026-08-02T13:19:00.000Z').toISOString();

function executorFor(rowsBySql: (sql: string) => Record<string, unknown>[]) {
  return {
    queryRows: async <T extends Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsBySql(sql) as T[],
  };
}

function packRow(overrides: Record<string, unknown> = {}) {
  return {
    content_pack_id: 900,
    pack_kind: 'impact_brief',
    entity_id: 42,
    graph_snapshot_id: 9,
    builder_version: 'impact-v2-r1',
    pack_digest: 'a'.repeat(64),
    built_at: BUILT,
    fresh_until: FRESH,
    status: 'published',
    as_of: BUILT,
    known_at: BUILT,
    snapshot_digest: 'b'.repeat(64),
    servable: true,
    ...overrides,
  };
}

function itemRow(itemNo: number, impactPathV2Id: number, pathScore: number) {
  return {
    item_no: itemNo,
    item_kind: 'impact_path',
    relation_revision_id: null,
    relation_evidence_ledger_id: null,
    impact_path_v2_id: impactPathV2Id,
    relation_measurement_id: null,
    display_payload: {
      impact: {
        triggerEventId: 6873,
        sourceEntityId: 242,
        targetEntityId: 42,
        eventType: 'supply_disruption',
        sourceName: 'TSMC',
        sourceEntityKey: 'US:TSM',
        hopCount: 2,
        pathScore,
        note: 'industrial linkage strength; never a price prediction',
      },
    },
  };
}

function route(sql: string, opts: { entity?: boolean; pack?: boolean; items?: boolean } = {}) {
  if (sql.includes('core.entity_identifier'))
    return opts.entity === false ? [] : [{ entity_id: 42 }];
  if (sql.includes('v_relation_graph_freshness')) return opts.pack === false ? [] : [packRow()];
  return opts.items === false ? [] : [itemRow(1, 57865, 0.71), itemRow(2, 57875, 0.44)];
}

test('serves impact paths from the entity content pack with its digest', async () => {
  const result = await getImpactBrief(
    executorFor((sql) => route(sql)),
    {
      entityKey: 'US:AMD',
      now: NOW,
    },
  );

  assert.equal(result.error, null);
  assert.equal(result.availability, 'available');
  assert.equal(result.data?.entityKey, 'US:AMD');
  // The digest and pack id travel with the data: a rendered claim has to be
  // traceable back to the exact sealed pack it came from.
  assert.equal(result.data?.contentPackId, 900);
  assert.equal(result.data?.packDigest, 'a'.repeat(64));
  assert.equal(result.data?.graphSnapshotId, 9);
  assert.equal(result.data?.paths.length, 2);
  assert.deepEqual(result.data?.paths[0], {
    impactPathV2Id: 57865,
    triggerEventId: 6873,
    sourceEntityId: 242,
    eventType: 'supply_disruption',
    sourceName: 'TSMC',
    sourceEntityKey: 'US:TSM',
    hopCount: 2,
    pathScore: 0.71,
    note: 'industrial linkage strength; never a price prediction',
    // This fixture is a pack sealed before steps existed. Null is the honest
    // answer for it — packs are immutable, so an older one can never gain the
    // field, and "no steps recorded" must not read as "this path had no hops".
    steps: null,
  });
});

test('a pack sealed before the source name existed still parses', async () => {
  // Content packs are immutable once published, so packs already serving carry no
  // sourceName until the next pipeline run replaces them. Treating that as a
  // schema violation would take the whole section down for a day.
  const legacyItem = {
    ...itemRow(1, 57865, 0.71),
    display_payload: {
      impact: {
        triggerEventId: 6873,
        sourceEntityId: 242,
        eventType: 'supply_disruption',
        hopCount: 2,
        pathScore: 0.71,
        note: 'industrial linkage strength; never a price prediction',
      },
    },
  };
  const result = await getImpactBrief(
    executorFor((sql) =>
      sql.includes('core.entity_identifier')
        ? [{ entity_id: 42 }]
        : sql.includes('v_relation_graph_freshness')
          ? [packRow()]
          : [legacyItem],
    ),
    { entityKey: 'US:AMD', now: NOW },
  );

  assert.equal(result.error, null);
  assert.equal(result.data?.paths[0]?.sourceName, null);
  assert.equal(result.data?.paths[0]?.sourceEntityKey, null);
});

test('an unknown entity key is "nothing here", not a failure', async () => {
  const result = await getImpactBrief(
    executorFor((sql) => route(sql, { entity: false })),
    { entityKey: 'KR:000000', now: NOW },
  );

  assert.equal(result.error, null);
  assert.equal(result.data, null);
  assert.equal(result.availability, 'missing');
});

test('no servable pack degrades to missing rather than serving stale truth', async () => {
  const result = await getImpactBrief(
    executorFor((sql) => route(sql, { pack: false })),
    { entityKey: 'US:AMD', now: NOW },
  );

  assert.equal(result.error, null);
  assert.equal(result.data, null);
  assert.equal(result.availability, 'missing');
});

test('an expired pack is refused even when the view still calls it servable', async () => {
  // Defense in depth: the freshness view can be computed on a lagging replica,
  // so the read model re-checks fresh_until against its own clock.
  const stale = new Date('2026-08-01T00:00:00.000Z').toISOString();
  const result = await getImpactBrief(
    executorFor((sql) =>
      sql.includes('v_relation_graph_freshness') ? [packRow({ fresh_until: stale })] : route(sql),
    ),
    { entityKey: 'US:AMD', now: NOW },
  );

  assert.equal(result.data, null);
  assert.equal(result.availability, 'missing');
});

test('a read failure returns an error envelope instead of throwing', async () => {
  const result = await getImpactBrief(
    {
      queryRows: async () => {
        throw new Error('connection reset');
      },
    },
    { entityKey: 'US:AMD', now: NOW },
  );

  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'IMPACT_BRIEF_READ_FAILED');
});
