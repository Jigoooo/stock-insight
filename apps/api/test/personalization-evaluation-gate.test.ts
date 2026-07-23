import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePersonalizationReleaseGate } from '../src/personalization/evaluation-gate.ts';

const policy = {
  maximumDownsideCvar: 0.12,
  minimumShadowSampleSize: 1_000,
  maximumShadowDisagreementRate: 0.1,
  maximumShadowCalibrationError: 0.05,
  minimumShadowCoverage: 0.85,
  maximumShadowAbstentionRate: 0.4,
  maximumLimitedActionWeightCap: 0.02,
};

const metrics = {
  offline: {
    pointInTimeValidated: true,
    costsIncluded: true,
    netUtility: 0.08,
    holdBaselineNetUtility: 0.05,
    downsideCvar: 0.1,
  },
  shadow: {
    sampleSize: 2_000,
    disagreementRate: 0.05,
    calibrationError: 0.02,
    coverage: 0.9,
    abstentionRate: 0.2,
    privateIsolationPassed: true,
    reproducibilityPassed: true,
  },
  limited: {
    actionWeightCap: 0.01,
    highRiskBlocked: true,
    lowLiquidityBlocked: true,
    confirmationRequired: true,
  },
};

describe('P4-C personalization release evaluation gate', () => {
  it('promotes a limited read-only cohort only when every prior gate passes', () => {
    const result = evaluatePersonalizationReleaseGate({
      evaluationId: '44444444-4444-4444-8444-444444444444',
      stage: 'limited',
      evaluatedAt: '2026-07-23T00:00:00.000Z',
      metrics,
      policy,
    });
    assert.equal(result.promoted, true);
    assert.deepEqual(result.blockers, []);
    assert.equal(result.limited.orderExecutable, false);
    assert.equal(result.offline.holdBaselineOutperformed, true);
  });

  it('blocks shadow promotion when hold baseline or sample/calibration gates fail', () => {
    const result = evaluatePersonalizationReleaseGate({
      evaluationId: '55555555-5555-4555-8555-555555555555',
      stage: 'shadow',
      evaluatedAt: '2026-07-23T00:00:00.000Z',
      metrics: {
        ...metrics,
        offline: { ...metrics.offline, netUtility: 0.04 },
        shadow: { ...metrics.shadow, sampleSize: 999, calibrationError: 0.08 },
      },
      policy,
    });
    assert.equal(result.promoted, false);
    assert.deepEqual(result.blockers, [
      'OFFLINE_HOLD_BASELINE_NOT_OUTPERFORMED',
      'SHADOW_SAMPLE_SIZE_INSUFFICIENT',
      'SHADOW_CALIBRATION_ERROR_EXCEEDED',
    ]);
  });

  it('validates finite monotone policy thresholds fail closed', () => {
    assert.throws(
      () =>
        evaluatePersonalizationReleaseGate({
          evaluationId: '66666666-6666-4666-8666-666666666666',
          stage: 'offline',
          evaluatedAt: '2026-07-23T00:00:00.000Z',
          metrics,
          policy: { ...policy, maximumDownsideCvar: Number.NaN },
        }),
      /policy/i,
    );
  });
});
