import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDynamicProbabilityContext,
  type DynamicProbabilityModelInput,
} from '../src/personalization/dynamic-probability-model.ts';

const baseInput: DynamicProbabilityModelInput = {
  equilibriumExpectedReturn: 0.03,
  hierarchical: {
    priorMean: 0.03,
    priorVariance: 0.04,
    betweenGroupVariance: 0.01,
    groups: [
      {
        id: 'fundamental',
        observations: [
          { value: 0.08, variance: 0.02 },
          { value: 0.06, variance: 0.02 },
        ],
      },
      {
        id: 'event',
        observations: [{ value: -0.01, variance: 0.03 }],
      },
    ],
  },
  bocpd: {
    observations: [0.01, 0.012, 0.009, 0.011, 0.08],
    hazardRate: 0.1,
    observationVariance: 0.0025,
    priorMean: 0,
    priorVariance: 0.04,
  },
  scenarioTree: {
    nodes: [
      {
        id: 'root',
        parentId: null,
        conditionalProbability: 1,
        returnAdjustment: 0,
        downsideCvar: 0,
      },
      {
        id: 'base',
        parentId: 'root',
        conditionalProbability: 0.7,
        returnAdjustment: 0.02,
        downsideCvar: 0.08,
      },
      {
        id: 'stress',
        parentId: 'root',
        conditionalProbability: 0.3,
        returnAdjustment: -0.12,
        downsideCvar: 0.25,
      },
    ],
  },
  conformal: {
    absoluteResiduals: [0.01, 0.02, 0.015, 0.03, 0.025],
    targetCoverage: 0.8,
    recencyDecay: 0.9,
  },
  lifecycle: {
    stage: 'post-catalyst',
    elapsedPeriods: 2,
    baselineResolutionHazard: 0.1,
    baselineAdverseHazard: 0.03,
    covariates: [0.5, -0.2],
    resolutionCoefficients: [0.4, 0.1],
    adverseCoefficients: [0.2, -0.1],
  },
  riskScalingPolicy: {
    changePointMultiplier: 1,
    coverageShortfallMultiplier: 2,
    adverseHazardMultiplier: 1,
  },
};

function build(overrides: Partial<DynamicProbabilityModelInput> = {}) {
  return buildDynamicProbabilityContext({ ...baseInput, ...overrides });
}

describe('P4-B dynamic probability model', () => {
  it('builds a deterministic method-provenanced runtime context', () => {
    const result = build();
    assert.equal(result.status, 'built');
    assert.equal(result.context.scenarios.length, 2);
    assert.ok(
      Math.abs(
        result.context.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0) - 1,
      ) <= 1e-9,
    );
    assert.ok(result.context.evidenceConfidence > 0 && result.context.evidenceConfidence <= 1);
    assert.ok(
      result.context.changePointProbability >= 0 && result.context.changePointProbability <= 1,
    );
    assert.ok(result.context.adverseHazard >= 0 && result.context.adverseHazard <= 1);
    assert.ok(result.context.conformal.lowerReturn < result.context.conformal.upperReturn);
    assert.equal(result.context.methodEvidence.hierarchicalModel, 'normal-normal-hierarchical-v1');
    assert.equal(result.context.methodEvidence.bocpdModel, 'normal-known-variance-bocpd-v1');
    assert.equal(result.context.methodEvidence.scenarioLeafCount, 2);
    assert.deepEqual(result, build());
  });

  it('matches the conjugate hierarchical posterior without counting the prior twice', () => {
    const result = build({
      hierarchical: {
        priorMean: 0,
        priorVariance: 1,
        betweenGroupVariance: 1,
        groups: [{ id: 'single', observations: [{ value: 1, variance: 1 }] }],
      },
    });
    assert.equal(result.status, 'built');
    assert.ok(Math.abs(result.context.methodEvidence.hierarchicalPosteriorMean - 1 / 3) <= 1e-12);
    assert.ok(
      Math.abs(result.context.methodEvidence.hierarchicalPosteriorVariance - 2 / 3) <= 1e-12,
    );
  });

  it('raises BOCPD change probability for an abrupt series relative to a stable series', () => {
    const stable = build({
      bocpd: { ...baseInput.bocpd, observations: [0.01, 0.011, 0.009, 0.01, 0.011] },
    });
    const abrupt = build({
      bocpd: { ...baseInput.bocpd, observations: [0.01, 0.011, 0.009, 0.01, 0.5] },
    });
    assert.equal(stable.status, 'built');
    assert.equal(abrupt.status, 'built');
    assert.ok(abrupt.context.changePointProbability > stable.context.changePointProbability);
  });

  it('gives a recent large conformal residual more influence than an old one', () => {
    const oldShock = build({
      conformal: {
        ...baseInput.conformal,
        absoluteResiduals: [0.5, 0.01, 0.01, 0.01, 0.01],
      },
    });
    const recentShock = build({
      conformal: {
        ...baseInput.conformal,
        absoluteResiduals: [0.01, 0.01, 0.01, 0.01, 0.5],
      },
    });
    assert.equal(oldShock.status, 'built');
    assert.equal(recentShock.status, 'built');
    const oldWidth =
      oldShock.context.conformal.upperReturn - oldShock.context.conformal.lowerReturn;
    const recentWidth =
      recentShock.context.conformal.upperReturn - recentShock.context.conformal.lowerReturn;
    assert.ok(recentWidth > oldWidth);
  });

  it('validates the maximum-size linear scenario tree without superlinear parent scans', () => {
    const nodes = Array.from({ length: 4_096 }, (_, index) => ({
      id: `node-${index}`,
      parentId: index === 0 ? null : `node-${index - 1}`,
      conditionalProbability: 1,
      returnAdjustment: 0,
      downsideCvar: 0,
    }));
    const result = build({ scenarioTree: { nodes } });
    assert.equal(result.status, 'built');
    assert.equal(result.context.methodEvidence.scenarioLeafCount, 1);
  });

  it('prunes underflowed BOCPD run-length mass instead of aborting a valid series', () => {
    const result = build({
      bocpd: {
        ...baseInput.bocpd,
        observations: [0, 0, 0, 100, 0, 0],
      },
    });
    assert.equal(result.status, 'built');
    assert.ok(Number.isFinite(result.context.changePointProbability));
  });

  it('fails closed on an invalid tree, empty residuals, or mismatched hazard vectors', () => {
    assert.deepEqual(
      build({
        scenarioTree: {
          nodes: baseInput.scenarioTree.nodes.map((node) =>
            node.id === 'base' ? { ...node, conditionalProbability: 0.8 } : node,
          ),
        },
      }),
      { status: 'abstained', reason: 'INVALID_SCENARIO_TREE' },
    );
    assert.deepEqual(build({ conformal: { ...baseInput.conformal, absoluteResiduals: [] } }), {
      status: 'abstained',
      reason: 'INVALID_CONFORMAL_INPUT',
    });
    assert.deepEqual(build({ lifecycle: { ...baseInput.lifecycle, adverseCoefficients: [0.1] } }), {
      status: 'abstained',
      reason: 'INVALID_HAZARD_INPUT',
    });
    const oversized = build({
      bocpd: { ...baseInput.bocpd, observations: Array.from({ length: 4_097 }, () => 0) },
    });
    assert.deepEqual(oversized, { status: 'abstained', reason: 'RESOURCE_LIMIT_EXCEEDED' });
  });
});
