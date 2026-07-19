import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeSnapshotDigest,
  computeSnapshotDegrees,
  planGraphSnapshotFromDatabase,
  SNAPSHOT_EDGE_SELECTOR_SQL,
  type SnapshotEdgeInput,
  type SnapshotPlanOptions,
} from '../src/analytics/graph-snapshot.ts';

const edge = (overrides: Partial<SnapshotEdgeInput> = {}): SnapshotEdgeInput => {
  const relationRevisionId = overrides.relationRevisionId ?? 100;
  return {
    relationRevisionId,
    relationIdentityId: relationRevisionId,
    revisionStatus: 'accepted',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    knownFrom: '2026-01-02T00:00:00.000Z',
    subjectEntityId: 1,
    objectEntityId: 2,
    predicate: 'SUPPLIES',
    relationKind: 'structural',
    confidence: 0.9,
    ...overrides,
  };
};

const OPTIONS: SnapshotPlanOptions = {
  asOf: '2026-07-19T00:00:00.000Z',
  knownAt: '2026-07-19T00:00:00.000Z',
  builderVersion: 'snapshot-v1',
  superhubDegreeThreshold: 100,
};

const plan = (edges: readonly SnapshotEdgeInput[], options: SnapshotPlanOptions = OPTIONS) =>
  planGraphSnapshotFromDatabase(
    {
      async query(sql, params) {
        assert.equal(sql, SNAPSHOT_EDGE_SELECTOR_SQL);
        assert.deepEqual(params, [
          new Date(options.asOf).toISOString(),
          new Date(options.knownAt).toISOString(),
        ]);
        return { rows: [...edges] };
      },
    },
    options,
  );

describe('B7 graph snapshot planner', () => {
  it('derives membership from the authoritative latest-accepted PIT ledger query', () => {
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, /JOIN knowledge\.relation_identity identity_row/i);
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, /revision\.revision_status = 'accepted'/i);
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, /revision\.valid_from <= \$1::timestamptz/i);
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, /revision\.known_from <= \$2::timestamptz/i);
    assert.match(
      SNAPSHOT_EDGE_SELECTOR_SQL,
      /NOT EXISTS[\s\S]*newer\.relation_identity_id = revision\.relation_identity_id[\s\S]*newer\.revision_no > revision\.revision_no/i,
    );
  });

  it('digest is deterministic and order-insensitive over the revision set', () => {
    const edges = [
      edge({ relationRevisionId: 300 }),
      edge({ relationRevisionId: 100 }),
      edge({ relationRevisionId: 200, subjectEntityId: 3 }),
    ];
    const d1 = computeSnapshotDigest(edges);
    const d2 = computeSnapshotDigest([...edges].reverse());
    assert.match(d1, /^[a-f0-9]{64}$/);
    assert.equal(d1, d2);
  });

  it('digest changes when the revision set changes', () => {
    const base = [edge({ relationRevisionId: 100 })];
    const extended = [edge({ relationRevisionId: 100 }), edge({ relationRevisionId: 101 })];
    assert.notEqual(computeSnapshotDigest(base), computeSnapshotDigest(extended));
  });

  it('duplicate relation revisions are rejected fail-closed', () => {
    assert.throws(() => computeSnapshotDigest([edge(), edge()]), /duplicate relation revision/i);
  });

  it('degree ledger counts total cross-predicate degree per entity', () => {
    const edges = [
      edge({ relationRevisionId: 1, subjectEntityId: 1, objectEntityId: 2, predicate: 'SUPPLIES' }),
      edge({
        relationRevisionId: 2,
        subjectEntityId: 1,
        objectEntityId: 3,
        predicate: 'SAME_ETF_BASKET',
      }),
      edge({
        relationRevisionId: 3,
        subjectEntityId: 4,
        objectEntityId: 1,
        predicate: 'COMMON_OWNER',
      }),
    ];
    const degrees = computeSnapshotDegrees(edges, { superhubDegreeThreshold: 100 });
    const one = degrees.find((d) => d.entityId === 1)!;
    assert.equal(one.totalDegree, 3);
    assert.deepEqual(
      { ...one.degreeByPredicate },
      {
        SUPPLIES: 1,
        SAME_ETF_BASKET: 1,
        COMMON_OWNER: 1,
      },
    );
    assert.equal(one.superhubFlag, false);
    const two = degrees.find((d) => d.entityId === 2)!;
    assert.equal(two.totalDegree, 1);
  });

  it('flags cross-hub superhubs above the threshold (B6 carry-over)', () => {
    const edges = Array.from({ length: 101 }, (_, i) =>
      edge({
        relationRevisionId: 1000 + i,
        subjectEntityId: 7,
        objectEntityId: 2000 + i,
        predicate: i % 2 === 0 ? 'SAME_ETF_BASKET' : 'COMMON_OWNER',
      }),
    );
    const degrees = computeSnapshotDegrees(edges, { superhubDegreeThreshold: 100 });
    const hub = degrees.find((d) => d.entityId === 7)!;
    assert.equal(hub.totalDegree, 101);
    assert.equal(hub.superhubFlag, true);
  });

  it('authoritative DB planner assembles one immutable digest/edge/degree snapshot', async () => {
    const edges = [
      edge({ relationRevisionId: 10 }),
      edge({ relationRevisionId: 11, subjectEntityId: 3, objectEntityId: 4 }),
    ];
    const snapshot = await plan(edges);
    assert.equal(snapshot.header.snapshotDigest, computeSnapshotDigest(edges));
    assert.equal(snapshot.header.edgeCount, 2);
    assert.equal(snapshot.header.entityCount, 4);
    assert.equal(snapshot.edges.length, 2);
    assert.equal(snapshot.degrees.length, 4);
    // Replay must be byte-identical.
    const replay = await plan([...edges].reverse());
    assert.deepEqual(replay.header, snapshot.header);
    assert.deepEqual(replay.edges, snapshot.edges);
    assert.deepEqual(replay.degrees, snapshot.degrees);
    edges[0]!.confidence = 0.1;
    assert.equal(snapshot.edges[0]!.confidence, 0.9);
    assert.throws(() => {
      (snapshot.edges[0] as SnapshotEdgeInput).confidence = 0.2;
    }, /read only|Cannot assign/i);
  });

  it('rejects malformed rows returned across the authoritative PIT query boundary', async () => {
    await assert.rejects(
      () => plan([edge({ revisionStatus: 'quarantined_unverified' })]),
      /accepted/i,
    );
    await assert.rejects(() => plan([edge({ knownFrom: '2026-07-20T00:00:00.000Z' })]), /knownAt/i);
    await assert.rejects(() => plan([edge({ validFrom: '2026-07-20T00:00:00.000Z' })]), /asOf/i);
    await assert.rejects(() => plan([edge({ validTo: '2026-07-19T00:00:00.000Z' })]), /validTo/i);
    await assert.rejects(
      () =>
        plan([
          edge({ relationRevisionId: 10, relationIdentityId: 5 }),
          edge({ relationRevisionId: 11, relationIdentityId: 5 }),
        ]),
      /duplicate relation identity/i,
    );
  });

  it('rejects invalid cutoffs and empty confidence bounds fail-closed', async () => {
    await assert.rejects(() => plan([edge()], { ...OPTIONS, asOf: 'bad' }), /asOf/i);
    await assert.rejects(
      () => plan([edge()], { ...OPTIONS, asOf: '2026-07-19T00:00:00' }),
      /offset|RFC3339/i,
    );
    await assert.rejects(
      () => plan([edge()], { ...OPTIONS, asOf: '2026-02-30T00:00:00Z' }),
      /calendar|timestamp/i,
    );
    await assert.rejects(
      () => plan([edge()], { ...OPTIONS, asOf: '2026-07-19T00:00:00.0009Z' }),
      /millisecond|RFC3339/i,
    );
    const canonical = await plan([edge()], {
      ...OPTIONS,
      asOf: '2026-07-19T09:00:00+09:00',
    });
    assert.equal(canonical.header.asOf, '2026-07-19T00:00:00.000Z');
    assert.throws(() => computeSnapshotDigest([edge({ confidence: 1.5 })]), /confidence/i);
    assert.throws(
      () => computeSnapshotDigest([edge({ relationKind: undefined as never })]),
      /relationKind/i,
    );
    assert.throws(
      () => computeSnapshotDigest([edge({ relationKind: 'causal' as never })]),
      /relationKind/i,
    );
    await assert.rejects(
      () => plan([edge({ relationRevisionId: true as never })]),
      /relationRevisionId/i,
    );
    await assert.rejects(() => plan([edge({ confidence: '' as never })]), /confidence/i);
    await assert.rejects(() => plan([edge({ confidence: '-0' as never })]), /confidence/i);
    assert.throws(() => computeSnapshotDigest([edge({ confidence: -0 })]), /confidence/i);
  });

  it('digest survives a float32 (REAL) round-trip of confidence values', () => {
    // DB stores confidence as REAL; replay reads back a float32-truncated
    // value. Digest must not change across that precision boundary.
    const original = 0.9;
    const roundTripped = Math.fround(original);
    const d1 = computeSnapshotDigest([edge({ confidence: original })]);
    const d2 = computeSnapshotDigest([edge({ confidence: roundTripped })]);
    assert.equal(d1, d2);
    const precise = 0.123456789; // beyond float32 precision
    const d3 = computeSnapshotDigest([edge({ confidence: precise })]);
    const d4 = computeSnapshotDigest([edge({ confidence: Math.fround(precise) })]);
    assert.equal(d3, d4);
  });

  it('keeps adjacent float32 confidence values distinct in the digest', () => {
    const lower = Math.fround(0.5);
    const next = Math.fround(0.5000000596046448);
    assert.notEqual(lower, next, 'fixture must use adjacent distinct float32 values');
    assert.notEqual(
      computeSnapshotDigest([edge({ confidence: lower })]),
      computeSnapshotDigest([edge({ confidence: next })]),
    );
  });
});
