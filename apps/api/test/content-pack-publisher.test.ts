import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContentPackSourceItem } from '../src/relations/content-pack-builder.ts';
import { publishContentPacks } from '../src/relations/content-pack-publisher.ts';

// Content packs are digest-sealed and immutable once published, so a publisher
// that runs after another cannot append to its packs — it must publish its own.
// That makes packKind the load-bearing parameter: the supersede step at the end
// retires previously published packs, and with two publishers in the same
// pipeline a mis-scoped supersede silently retires the other one's output.

type RecordedQuery = { sql: string; params: readonly unknown[] };

function fakeClient(): { client: never; queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = [];
  let nextPackId = 700;
  let nextDerivationId = 800;
  let nextStepId = 900;

  const query = async (sql: string, params: readonly unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('INSERT INTO serving.content_pack (')) {
      return { rows: [{ content_pack_id: nextPackId++ }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO knowledge.derivation (')) {
      // One row per derivation_key parameter (every 5th value).
      const keys = params.filter((_, index) => index % 5 === 0) as string[];
      return {
        rows: keys.map((derivation_key) => ({
          derivation_id: nextDerivationId++,
          derivation_key,
        })),
        rowCount: keys.length,
      };
    }
    if (sql.includes('INSERT INTO knowledge.derivation_step')) {
      const derivationIds = params.filter((_, index) => index % 3 === 0) as number[];
      return {
        rows: derivationIds.map((derivation_id) => ({
          derivation_step_id: nextStepId++,
          derivation_id,
        })),
        rowCount: derivationIds.length,
      };
    }
    if (sql.includes("SET status='sealed'")) {
      const ids = (params[0] ?? []) as number[];
      return { rows: [], rowCount: ids.length };
    }
    return { rows: [], rowCount: 1 };
  };

  return { client: { query } as never, queries };
}

function impactItem(impactPathV2Id: number, rank: number): ContentPackSourceItem {
  return {
    itemKind: 'impact_path',
    impactPathV2Id,
    displayPayload: { impact: { pathScore: rank / 1000 } },
    rank,
  };
}

const baseOptions = {
  graphSnapshotId: 8,
  builderVersion: 'impact-v2-r1',
  builtAt: new Date('2026-08-02T13:18:59.712Z'),
  freshnessHours: 36,
  createdBy: 'stock-insight-v2-analytics-publisher',
  metadataSource: 'canonical_v2_impact',
  releaseCommit: 'f2ec673',
} as const;

test('impact packs carry impact_path items anchored to the sealed path', async () => {
  const { client, queries } = fakeClient();

  const result = await publishContentPacks(
    client,
    [{ entityId: 42, label: 'impact:42', sourceItems: [impactItem(11, 900), impactItem(12, 800)] }],
    { ...baseOptions, packKind: 'impact_brief', supersedeOrphanSnapshots: false },
  );

  assert.equal(result.packIds.length, 1);
  assert.equal(result.itemCount, 2);

  const packInsert = queries.find((entry) =>
    entry.sql.includes('INSERT INTO serving.content_pack ('),
  );
  assert.ok(packInsert);
  assert.equal(packInsert.params[0], 'impact_brief');

  const itemInsert = queries.find((entry) =>
    entry.sql.includes('INSERT INTO serving.content_pack_item'),
  );
  assert.ok(itemInsert);
  // Columns are (pack, item_no, item_kind, derivation, relation_revision,
  // relation_evidence, impact_path, measurement, payload) — nine per row.
  assert.equal(itemInsert.params[2], 'impact_path');
  assert.equal(itemInsert.params[6], 11, 'impact_path_v2_id must be the anchor');
  // The other three anchor columns must stay empty. migration 026 CHECKs that an
  // item carries exactly one, so a stray relation id here would fail the insert.
  assert.equal(itemInsert.params[4] ?? null, null, 'relation_revision_id must be empty');
  assert.equal(itemInsert.params[5] ?? null, null, 'relation_evidence_ledger_id must be empty');
  assert.equal(itemInsert.params[7] ?? null, null, 'relation_measurement_id must be empty');

  // The lineage anchor must be typed as impact_path too, or the derivation would
  // claim the item came from a relation.
  const inputInsert = queries.find((entry) =>
    entry.sql.includes('INSERT INTO knowledge.derivation_input'),
  );
  assert.ok(inputInsert);
  assert.equal(inputInsert.params[1], 'impact_path');
  assert.equal(inputInsert.params[4], 11);
});

test('a publisher supersedes only its own pack kind and leaves snapshots alone', async () => {
  const { client, queries } = fakeClient();

  await publishContentPacks(
    client,
    [{ entityId: 42, label: 'impact:42', sourceItems: [impactItem(11, 900)] }],
    { ...baseOptions, packKind: 'impact_brief', supersedeOrphanSnapshots: false },
  );

  const supersede = queries.find((entry) => entry.sql.includes("SET status='superseded'"));
  assert.ok(supersede);
  assert.deepEqual(supersede.params, ['impact_brief', 8]);

  // The graph publisher owns snapshot lifecycle. If this publisher retired
  // snapshots too it would race the publisher that created them.
  assert.equal(
    queries.some((entry) => entry.sql.includes('UPDATE analytics.graph_snapshot')),
    false,
  );
});

test('the snapshot-owning publisher still retires orphan snapshots', async () => {
  const { client, queries } = fakeClient();

  await publishContentPacks(
    client,
    [
      {
        entityId: 42,
        label: 'KR:005930',
        sourceItems: [
          { itemKind: 'relation', relationRevisionId: 5, displayPayload: {}, rank: 1000 },
        ],
      },
    ],
    { ...baseOptions, packKind: 'entity_relation_graph', supersedeOrphanSnapshots: true },
  );

  const supersede = queries.find((entry) => entry.sql.includes("SET status='superseded'"));
  assert.deepEqual(supersede?.params, ['entity_relation_graph', 8]);
  assert.ok(queries.some((entry) => entry.sql.includes('UPDATE analytics.graph_snapshot')));
});

test('a pack whose items lose their anchors fails rather than publishing short', async () => {
  const { client } = fakeClient();

  await assert.rejects(
    publishContentPacks(
      client,
      [
        {
          entityId: 42,
          label: 'impact:42',
          // No typed anchor: the builder drops it, and publishing the remainder
          // would serve a pack whose lineage was quietly discarded.
          sourceItems: [{ itemKind: 'impact_path', displayPayload: {}, rank: 100 }],
        },
      ],
      { ...baseOptions, packKind: 'impact_brief', supersedeOrphanSnapshots: false },
    ),
    /lost typed lineage anchors|needs one typed anchor|anchor/i,
  );
});
