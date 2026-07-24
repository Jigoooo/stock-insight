import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileCausalDiscoveryCandidates } from '../src/experimental/causal-discovery-candidate.ts';

const base = {
  method: 'pcmci_plus',
  dataCutoff: '2026-07-23T00:00:00.000Z',
  sampleSize: 240,
  maxLag: 5,
  alpha: 0.05,
  minimumStability: 0.7,
  diagnostics: {
    noLookahead: true,
    stationarityChecked: true,
    missingnessRate: 0.02,
    multipleTestingCorrection: 'fdr_bh',
  },
  artifact: {
    modelVersion: 'pcmci-plus-v1',
    programDigest: 'a'.repeat(64),
    inputSnapshotDigest: 'b'.repeat(64),
    analyzedCutoff: '2026-07-23T00:00:00.000Z',
  },
  candidates: [
    {
      causeEntityId: 1,
      effectEntityId: 2,
      lag: 2,
      association: -0.6,
      adjustedPValue: 0.01,
      stability: 0.9,
    },
    {
      causeEntityId: 1,
      effectEntityId: 3,
      lag: 1,
      association: 0.4,
      adjustedPValue: 0.03,
      stability: 0.8,
    },
    {
      causeEntityId: 4,
      effectEntityId: 5,
      lag: 1,
      association: 0.8,
      adjustedPValue: 0.2,
      stability: 0.9,
    },
  ],
};

describe('P5-3 PCMCI+ discovery candidate contract', () => {
  it('keeps only stable FDR-screened associations and forbids causal language', () => {
    const result = compileCausalDiscoveryCandidates(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.deepEqual(
      result.candidates.map(({ causeEntityId, effectEntityId, rank }) => ({
        causeEntityId,
        effectEntityId,
        rank,
      })),
      [
        { causeEntityId: 1, effectEntityId: 2, rank: 1 },
        { causeEntityId: 1, effectEntityId: 3, rank: 2 },
      ],
    );
    assert.equal(result.claimClass, 'statistical_association');
    assert.equal(result.causalLanguageAllowed, false);
    assert.equal(result.candidateOnly, true);
    assert.equal(result.acceptedFactAllowed, false);
    assert.equal(result.orderExecutable, false);
  });

  it('is deterministic for reversed candidate input', () => {
    assert.deepEqual(
      compileCausalDiscoveryCandidates({ ...base, candidates: [...base.candidates].reverse() }),
      compileCausalDiscoveryCandidates(base),
    );
  });

  it('fails closed without PIT, FDR, stationarity, overlap, or immutable artifact proof', () => {
    for (const input of [
      { ...base, diagnostics: { ...base.diagnostics, noLookahead: false } },
      { ...base, diagnostics: { ...base.diagnostics, stationarityChecked: false } },
      { ...base, diagnostics: { ...base.diagnostics, multipleTestingCorrection: 'none' } },
      { ...base, sampleSize: 20 },
      { ...base, artifact: { ...base.artifact, analyzedCutoff: '2026-07-24T00:00:00.000Z' } },
      {
        ...base,
        candidates: [{ ...base.candidates[0]!, causeEntityId: 1, effectEntityId: 1 }],
      },
    ]) {
      assert.deepEqual(compileCausalDiscoveryCandidates(input), {
        status: 'abstained',
        reason: 'INVALID_CAUSAL_DISCOVERY_INPUT',
        claimClass: 'statistical_association',
        causalLanguageAllowed: false,
        candidateOnly: true,
        acceptedFactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
