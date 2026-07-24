import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankGraphCandidates } from '../src/experimental/graph-candidate-ranker.ts';

const base = {
  graphSnapshotId: 42,
  dataCutoff: '2026-07-23T00:00:00.000Z',
  seedEntityId: 1,
  maxCandidates: 10,
};

describe('P5-2 graph candidate ranking', () => {
  it('computes deterministic bounded PathSim scores and stable ranks', () => {
    const result = rankGraphCandidates({
      ...base,
      method: 'pathsim',
      candidates: [
        { targetEntityId: 3, crossPathCount: 2, seedSelfPathCount: 4, targetSelfPathCount: 4 },
        { targetEntityId: 2, crossPathCount: 3, seedSelfPathCount: 4, targetSelfPathCount: 5 },
      ],
    });
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.deepEqual(
      result.candidates.map(({ targetEntityId, score, rank }) => ({ targetEntityId, score, rank })),
      [
        { targetEntityId: 2, score: 2 / 3, rank: 1 },
        { targetEntityId: 3, score: 0.5, rank: 2 },
      ],
    );
    assert.equal(result.candidateOnly, true);
    assert.equal(result.acceptedFactAllowed, false);
    assert.equal(result.orderExecutable, false);
  });

  it('accepts learned-model scores only with immutable artifact and cutoff lineage', () => {
    const result = rankGraphCandidates({
      ...base,
      method: 'hgt',
      modelArtifact: {
        modelVersion: 'hgt-v1',
        modelArtifactDigest: 'a'.repeat(64),
        featureSnapshotDigest: 'b'.repeat(64),
        trainedCutoff: '2026-07-22T00:00:00.000Z',
      },
      candidates: [
        { targetEntityId: 2, score: 0.8 },
        { targetEntityId: 3, score: 0.4 },
      ],
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.equal(result.method, 'hgt');
      assert.equal(result.modelArtifactDigest, 'a'.repeat(64));
    }
  });

  it('fails closed on unbound learned scores or impossible PathSim counts', () => {
    for (const input of [
      { ...base, method: 'tgn', candidates: [{ targetEntityId: 2, score: 0.8 }] },
      {
        ...base,
        method: 'pathsim',
        candidates: [
          { targetEntityId: 2, crossPathCount: 5, seedSelfPathCount: 1, targetSelfPathCount: 1 },
        ],
      },
    ]) {
      assert.deepEqual(rankGraphCandidates(input), {
        status: 'abstained',
        reason: 'INVALID_GRAPH_RANKING_INPUT',
        candidateOnly: true,
        acceptedFactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
