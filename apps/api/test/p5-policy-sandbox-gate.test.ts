import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicySandbox } from '../src/experimental/policy-sandbox-gate.ts';

const base = {
  policyKind: 'offline_rl',
  actionDomain: 'content_ranking',
  dataCutoff: '2026-07-23T00:00:00.000Z',
  trainedCutoff: '2026-07-22T00:00:00.000Z',
  behaviorPolicyDigest: 'a'.repeat(64),
  candidatePolicyDigest: 'b'.repeat(64),
  featureSnapshotDigest: 'c'.repeat(64),
  metrics: {
    sampleSize: 5_000,
    effectiveSampleSize: 900,
    supportCoverage: 0.99,
    maximumImportanceWeight: 4,
    doublyRobustLiftLower95: 0.03,
    fqeLiftLower95: 0.02,
    decisionRegretDelta: -0.04,
    distributionShiftIndex: 0.05,
    safetyConstraintViolations: 0,
  },
  policy: {
    minimumSampleSize: 1_000,
    minimumEffectiveSampleSize: 500,
    minimumSupportCoverage: 0.95,
    maximumImportanceWeight: 10,
    minimumDoublyRobustLiftLower95: 0.01,
    minimumFqeLiftLower95: 0.01,
    maximumDecisionRegretDelta: -0.01,
    maximumDistributionShiftIndex: 0.1,
  },
};

describe('P5-6 decision-focused/offline-RL sandbox gate', () => {
  it('allows an evidence-complete policy to advance only into shadow', () => {
    const result = evaluatePolicySandbox(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.sandboxAdvanceAllowed, true);
    assert.deepEqual(result.failedGates, []);
    assert.equal(result.nextMode, 'shadow');
    assert.equal(result.productionAllowed, false);
    assert.equal(result.policyExecutionAllowed, false);
    assert.equal(result.orderExecutable, false);
  });

  it('keeps a weak or shifted policy offline with machine-readable reasons', () => {
    const result = evaluatePolicySandbox({
      ...base,
      metrics: {
        ...base.metrics,
        supportCoverage: 0.7,
        doublyRobustLiftLower95: -0.02,
        distributionShiftIndex: 0.3,
      },
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.equal(result.sandboxAdvanceAllowed, false);
      assert.deepEqual(result.failedGates, [
        'SUPPORT_COVERAGE',
        'DOUBLY_ROBUST_LIFT',
        'DISTRIBUTION_SHIFT',
      ]);
      assert.equal(result.nextMode, 'offline');
    }
  });

  it('fails closed on trading domains, future-trained artifacts, missing lineage, or non-finite metrics', () => {
    for (const input of [
      { ...base, actionDomain: 'portfolio_weight' },
      { ...base, trainedCutoff: '2026-07-24T00:00:00.000Z' },
      { ...base, candidatePolicyDigest: 'invalid' },
      { ...base, metrics: { ...base.metrics, fqeLiftLower95: Number.NaN } },
      { ...base, metrics: { ...base.metrics, safetyConstraintViolations: 1 } },
    ]) {
      assert.deepEqual(evaluatePolicySandbox(input), {
        status: 'abstained',
        reason: 'INVALID_POLICY_SANDBOX_INPUT',
        productionAllowed: false,
        policyExecutionAllowed: false,
        candidateOnly: true,
        acceptedFactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
