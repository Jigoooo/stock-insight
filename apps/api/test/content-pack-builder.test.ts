import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  buildContentPack,
  type ContentPackSourceItem,
} from '../src/relations/content-pack-builder.ts';

const NOW = new Date('2026-07-19T12:00:00.000Z');

const relationItem = (overrides: Partial<ContentPackSourceItem> = {}): ContentPackSourceItem => ({
  itemKind: 'relation',
  relationRevisionId: 500,
  displayPayload: { predicate: 'SUPPLIES', label: 'A supplies B' },
  rank: 0.9,
  ...overrides,
});

const OPTIONS = {
  packKind: 'entity_relation_graph' as const,
  entityId: 42,
  graphSnapshotId: 7,
  snapshotStatus: 'sealed' as const,
  builderVersion: 'pack-v1',
  freshnessHours: 72,
  maxItems: 50,
  now: NOW,
};

describe('B8 content pack builder', () => {
  it('assembles a pack with ordered items, digest, and freshness envelope', () => {
    const pack = buildContentPack(
      [relationItem({ rank: 0.5, relationRevisionId: 501 }), relationItem({ rank: 0.9 })],
      OPTIONS,
    );
    assert.equal(pack.packKind, 'entity_relation_graph');
    assert.equal(pack.items.length, 2);
    // Ordered by rank desc; itemNo dense from 1.
    assert.deepEqual(
      pack.items.map((i) => i.itemNo),
      [1, 2],
    );
    assert.equal(pack.items[0]!.relationRevisionId, 500);
    assert.match(pack.packDigest, /^[a-f0-9]{64}$/);
    assert.equal(pack.freshUntil, new Date(NOW.getTime() + 72 * 3600 * 1000).toISOString());
    assert.equal(pack.itemCount, 2);
  });

  it('digest is deterministic and input-order-insensitive', () => {
    const items = [
      relationItem({ rank: 0.9 }),
      relationItem({ rank: 0.5, relationRevisionId: 501 }),
      {
        itemKind: 'impact_path' as const,
        impactPathV2Id: 900,
        displayPayload: { hops: 2 },
        rank: 0.7,
      },
    ];
    const a = buildContentPack(items, OPTIONS);
    const b = buildContentPack([...items].reverse(), OPTIONS);
    assert.equal(a.packDigest, b.packDigest);
    assert.deepEqual(a.items, b.items);
  });

  it('digest is independent of display-payload object key insertion order', () => {
    const a = buildContentPack(
      [relationItem({ displayPayload: { predicate: 'SUPPLIES', nested: { a: 1, b: 2 } } })],
      OPTIONS,
    );
    const b = buildContentPack(
      [relationItem({ displayPayload: { nested: { b: 2, a: 1 }, predicate: 'SUPPLIES' } })],
      OPTIONS,
    );

    assert.equal(a.packDigest, b.packDigest);
  });

  it('rejects non-JSON display payloads fail-closed', () => {
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: { values: Array(1) } })], OPTIONS),
      /sparse array/i,
    );
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: { value: Number.NaN } })], OPTIONS),
      /finite/i,
    );
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: { value: undefined } })], OPTIONS),
      /undefined|JSON/i,
    );
    const symbolPayload: Record<string, unknown> = {};
    Object.defineProperty(symbolPayload, Symbol('hidden'), { value: 1, enumerable: true });
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: symbolPayload })], OPTIONS),
      /symbol key/i,
    );
    const dangerous = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as Record<
      string,
      unknown
    >;
    const safeDigest = buildContentPack([relationItem({ displayPayload: { safe: 1 } })], OPTIONS);
    const dangerousDigest = buildContentPack(
      [relationItem({ displayPayload: dangerous })],
      OPTIONS,
    );
    assert.notEqual(safeDigest.packDigest, dangerousDigest.packDigest);
    const accessorPayload: Record<string, unknown> = {};
    Object.defineProperty(accessorPayload, 'value', { enumerable: true, get: () => 1 });
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: accessorPayload })], OPTIONS),
      /accessor/i,
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: cyclic })], OPTIONS),
      /cyclic/i,
    );
  });

  it('snapshots only own data properties from items and options', () => {
    const accessorItem = relationItem();
    Object.defineProperty(accessorItem, 'relationRevisionId', {
      enumerable: true,
      get: () => 500,
    });
    assert.throws(() => buildContentPack([accessorItem], OPTIONS), /accessor/i);
    const inheritedItem = Object.create(relationItem()) as ContentPackSourceItem;
    assert.throws(() => buildContentPack([inheritedItem], OPTIONS), /prototype|inherited/i);
    const accessorOptions = { ...OPTIONS };
    Object.defineProperty(accessorOptions, 'maxItems', { enumerable: true, get: () => 50 });
    assert.throws(() => buildContentPack([relationItem()], accessorOptions), /accessor/i);
  });

  it('does not let Array.prototype.toJSON replace digest items', () => {
    const original = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value: () => [],
    });
    try {
      const first = buildContentPack([relationItem({ relationRevisionId: 500 })], OPTIONS);
      const second = buildContentPack([relationItem({ relationRevisionId: 501 })], OPTIONS);
      assert.notEqual(first.packDigest, second.packDigest);
    } finally {
      if (original) Object.defineProperty(Array.prototype, 'toJSON', original);
      else delete (Array.prototype as unknown as { toJSON?: unknown }).toJSON;
    }
  });

  it('returns the same immutable canonical payload snapshot that it hashes', () => {
    const displayPayload = { nested: { value: 1 } };
    const pack = buildContentPack([relationItem({ displayPayload })], OPTIONS);
    displayPayload.nested.value = 2;
    assert.equal(Object.getPrototypeOf(pack.items[0]!.displayPayload), null);
    assert.equal((pack.items[0]!.displayPayload.nested as { value: number }).value, 1);
    assert.throws(() => {
      (pack.items[0]!.displayPayload.nested as { value: number }).value = 3;
    }, /read only|Cannot assign/i);
  });

  it('serializes integer-like keys in UTF-8 C order', () => {
    const pack = buildContentPack(
      [relationItem({ displayPayload: { '2': 'two', '10': 'ten' } })],
      OPTIONS,
    );
    const canonical =
      '{"builderVersion":"pack-v1","entityId":42,"graphSnapshotId":7,"items":[[1,"relation",500,null,null,null,{"10":"ten","2":"two"}]],"packKind":"entity_relation_graph"}';
    assert.equal(pack.packDigest, createHash('sha256').update(canonical).digest('hex'));
  });

  it('rejects unpaired surrogate keys and values', () => {
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: { '\ud800': 'bad' } })], OPTIONS),
      /surrogate|Unicode/i,
    );
    assert.throws(
      () => buildContentPack([relationItem({ displayPayload: { value: '\ud801' } })], OPTIONS),
      /surrogate|Unicode/i,
    );
  });

  it('refuses to build on an unsealed snapshot (fail-closed serving contract)', () => {
    assert.throws(
      () => buildContentPack([relationItem()], { ...OPTIONS, snapshotStatus: 'building' }),
      /sealed/i,
    );
  });

  it('every item must carry exactly one typed evidence anchor', () => {
    assert.throws(
      () =>
        buildContentPack([{ itemKind: 'relation', displayPayload: {}, rank: 1 } as never], OPTIONS),
      /anchor/i,
    );
    assert.throws(
      () =>
        buildContentPack(
          [
            {
              itemKind: 'relation',
              relationRevisionId: 1,
              impactPathV2Id: 2,
              displayPayload: {},
              rank: 1,
            } as never,
          ],
          OPTIONS,
        ),
      /anchor/i,
    );
  });

  it('anchor type must match item kind', () => {
    assert.throws(
      () =>
        buildContentPack(
          [
            {
              itemKind: 'impact_path',
              relationRevisionId: 1,
              displayPayload: {},
              rank: 1,
            } as never,
          ],
          OPTIONS,
        ),
      /anchor/i,
    );
  });

  it('bounds items at maxItems keeping highest ranks', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      relationItem({ relationRevisionId: 600 + i, rank: i / 20 }),
    );
    const pack = buildContentPack(items, { ...OPTIONS, maxItems: 5 });
    assert.equal(pack.items.length, 5);
    assert.equal(pack.itemCount, 5);
    // Highest rank first.
    assert.equal(pack.items[0]!.relationRevisionId, 619);
  });

  it('rejects duplicate anchors (same evidence served twice)', () => {
    assert.throws(() => buildContentPack([relationItem(), relationItem()], OPTIONS), /duplicate/i);
  });
});
