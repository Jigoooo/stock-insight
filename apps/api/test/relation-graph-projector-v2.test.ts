import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRelationGraphProjections } from '../src/relations/relation-graph-projector-v2.ts';

const context = {
  graphSnapshotId: 7,
  asOf: '2026-07-20T00:00:00.000Z',
  knownAt: '2026-07-20T00:00:00.000Z',
  builderVersion: 'v2-test',
  freshUntil: '2026-07-22T00:00:00.000Z',
  marketDataAsOf: null,
};
const entities = [
  { entityId: 1, entityKey: 'KR:000001', label: 'A', market: 'KR' as const },
  { entityId: 2, entityKey: 'KR:000002', label: 'B', market: 'KR' as const },
  { entityId: 3, entityKey: 'US:CCC', label: 'C', market: 'US' as const },
  { entityId: 50, entityKey: 'INDUSTRY:SIC:1000', label: '산업', market: null },
  { entityId: 60, entityKey: 'COMPANY:KR:000001', label: 'A사', market: null },
];

const edge = (overrides = {}) => ({
  relationRevisionId: 101,
  relationIdentityId: 201,
  predicate: 'SAME_ETF_BASKET',
  subjectEntityId: 1,
  objectEntityId: 2,
  confidence: 0.8,
  evidenceIds: [301],
  ...overrides,
});

describe('B8 production relation graph projector v2', () => {
  it('projects canonical ETF pairs into deterministic depth-1/depth-2 peer graphs', () => {
    const projections = buildRelationGraphProjections(
      [
        edge(),
        edge({
          relationRevisionId: 102,
          relationIdentityId: 202,
          subjectEntityId: 2,
          objectEntityId: 3,
          evidenceIds: [302],
        }),
      ],
      entities,
      context,
    );
    const root = projections.find((row) => row.entityKey === 'KR:000001');
    assert.ok(root);
    assert.equal(root.depth1.depth, 1);
    assert.deepEqual(
      root.depth1.nodes.map((node) => node.entityKey),
      ['KR:000001', 'KR:000002'],
    );
    assert.equal(root.depth1.edges.length, 1);
    assert.equal(root.depth1.edges[0]!.relationType, 'peer');
    assert.deepEqual(
      root.depth2.nodes.map((node) => node.entityKey),
      ['KR:000001', 'KR:000002', 'US:CCC'],
    );
    assert.equal(root.depth2.edges.length, 2);
    assert.deepEqual(root.relationRevisionIds, [101, 102]);
    assert.deepEqual(root.relationEvidenceLedgerIds, [301, 302]);
  });

  it('derives stock-stock same_industry edges from shared CLASSIFIED_AS taxonomy anchors', () => {
    const projections = buildRelationGraphProjections(
      [
        edge({
          relationRevisionId: 111,
          relationIdentityId: 211,
          predicate: 'CLASSIFIED_AS',
          subjectEntityId: 1,
          objectEntityId: 50,
          evidenceIds: [311],
        }),
        edge({
          relationRevisionId: 112,
          relationIdentityId: 212,
          predicate: 'CLASSIFIED_AS',
          subjectEntityId: 2,
          objectEntityId: 50,
          evidenceIds: [312],
        }),
      ],
      entities,
      context,
    );
    const root = projections.find((row) => row.entityKey === 'KR:000001');
    assert.ok(root);
    assert.equal(root.depth1.edges[0]!.relationType, 'same_industry');
    assert.deepEqual(
      root.depth1.nodes.map((node) => node.entityKey),
      ['KR:000001', 'KR:000002'],
    );
    assert.ok(root.depth1.nodes.every((node) => !node.entityKey.startsWith('INDUSTRY:')));
    assert.deepEqual(root.relationRevisionIds, [111, 112]);
  });

  it('does not publish root-only packs for non-displayable ISSUED_BY identity edges', () => {
    const projections = buildRelationGraphProjections(
      [edge({ predicate: 'ISSUED_BY', objectEntityId: 60 })],
      entities,
      context,
    );
    assert.deepEqual(projections, []);
  });

  it('preserves root reachability when dense internal edges exceed the 80-edge cap', () => {
    const denseEntities = Array.from({ length: 20 }, (_, index) => ({
      entityId: index + 1,
      entityKey: `KR:${String(index + 1).padStart(6, '0')}`,
      label: `E${index + 1}`,
      market: 'KR' as const,
    }));
    let relationRevisionId = 1_000;
    const denseEdges = [];
    for (let neighbor = 2; neighbor <= 20; neighbor += 1) {
      relationRevisionId += 1;
      denseEdges.push(
        edge({
          relationRevisionId,
          relationIdentityId: relationRevisionId + 10_000,
          subjectEntityId: 1,
          objectEntityId: neighbor,
          confidence: 0.1,
          evidenceIds: [relationRevisionId + 20_000],
        }),
      );
    }
    for (let left = 2; left <= 20; left += 1) {
      for (let right = left + 1; right <= 20; right += 1) {
        relationRevisionId += 1;
        denseEdges.push(
          edge({
            relationRevisionId,
            relationIdentityId: relationRevisionId + 10_000,
            subjectEntityId: left,
            objectEntityId: right,
            confidence: 0.9,
            evidenceIds: [relationRevisionId + 20_000],
          }),
        );
      }
    }
    const root = buildRelationGraphProjections(denseEdges, denseEntities, context).find(
      (row) => row.entityKey === 'KR:000001',
    );
    assert.ok(root);
    assert.equal(root.depth1.nodes.length, 20);
    assert.equal(root.depth1.edges.length, 80);
    const reachable = new Set([root.depth1.rootEntityKey]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const projected of root.depth1.edges) {
        if (reachable.has(projected.from) && !reachable.has(projected.to)) {
          reachable.add(projected.to);
          expanded = true;
        }
        if (reachable.has(projected.to) && !reachable.has(projected.from)) {
          reachable.add(projected.from);
          expanded = true;
        }
      }
    }
    assert.equal(reachable.size, root.depth1.nodes.length);
    assert.ok(
      root.depth1.edges.some(
        (projected) =>
          projected.from === root.depth1.rootEntityKey ||
          projected.to === root.depth1.rootEntityKey,
      ),
    );
  });
  it('caps pack lineage per projection and spends the budget across relation kinds', () => {
    // The COMMON_OWNER shape that took the pipeline down on 2026-08-07: a clique
    // of mutually-connected stocks where every edge drags a fat evidence set.
    // 20 nodes, all pairs, 12 evidence rows each — position-grain source revisions
    // are why that number is large, and why edge count never predicted pack size.
    const cliqueEntities = Array.from({ length: 20 }, (_, index) => ({
      entityId: index + 1,
      entityKey: `KR:${String(index + 1).padStart(6, '0')}`,
      label: `E${index + 1}`,
      market: 'KR' as const,
    }));
    let revisionId = 5_000;
    const cliqueEdges = [];
    for (let left = 1; left <= 20; left += 1) {
      for (let right = left + 1; right <= 20; right += 1) {
        revisionId += 1;
        cliqueEdges.push(
          edge({
            relationRevisionId: revisionId,
            relationIdentityId: revisionId + 10_000,
            // corroborates, so it lands in a different bucket than the peer edges
            // added below and the round-robin has something to alternate with.
            predicate: 'COMMON_OWNER',
            subjectEntityId: left,
            objectEntityId: right,
            confidence: 0.9,
            evidenceIds: Array.from({ length: 12 }, (_, k) => revisionId * 100 + k),
          }),
        );
      }
    }
    // A thinner peer layer at LOWER confidence. Taking edges by confidence alone
    // would never reach these; the round-robin must.
    for (let neighbour = 2; neighbour <= 20; neighbour += 1) {
      revisionId += 1;
      cliqueEdges.push(
        edge({
          relationRevisionId: revisionId,
          relationIdentityId: revisionId + 10_000,
          predicate: 'SAME_ETF_BASKET',
          subjectEntityId: 1,
          objectEntityId: neighbour,
          confidence: 0.2,
          evidenceIds: [revisionId + 20_000],
        }),
      );
    }

    const projections = buildRelationGraphProjections(cliqueEdges, cliqueEntities, context);
    assert.ok(projections.length > 0);

    // The cap the publisher enforces. Nothing may exceed it — that failure is a
    // thrown apply, not a shorter pack.
    for (const projection of projections) {
      assert.ok(
        projection.itemCount <= 512,
        `${projection.entityKey} costs ${projection.itemCount} lineage items`,
      );
    }

    // Without a budget this shape blows past the cap, so a passing assertion above
    // has to be the budget working rather than the fixture being too small.
    const unbudgeted = projections[0]!.depth2.edges.length * 13;
    assert.ok(unbudgeted > 512, `fixture too small to exercise the budget: ${unbudgeted}`);

    // Diversity: the budget is spent across kinds, not drained by the dense
    // high-confidence clique. The root sees both.
    const root = projections.find((row) => row.entityKey === 'KR:000001');
    assert.ok(root);
    const kinds = new Set(root.depth2.edges.map((projected) => projected.relationType));
    assert.ok(kinds.has('corroborates'), 'clique edges should be present');
    assert.ok(
      kinds.has('peer'),
      'lower-confidence peer edges must still be reachable — that is the whole point of the round-robin',
    );
  });
});
