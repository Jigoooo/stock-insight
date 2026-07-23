import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  optimizeConvexPortfolio,
  type MultiAssetOptimizerInput,
} from '../src/personalization/multi-asset-optimizer.ts';

const baseInput: MultiAssetOptimizerInput = {
  assets: [
    {
      id: 'asset-a',
      currentWeight: 0.3,
      minWeight: 0,
      maxWeight: 0.7,
      transactionCostRate: 0.001,
      turnoverPenalty: 0.1,
    },
    {
      id: 'asset-b',
      currentWeight: 0.3,
      minWeight: 0,
      maxWeight: 0.7,
      transactionCostRate: 0.001,
      turnoverPenalty: 0.1,
    },
  ],
  equilibriumReturns: [0.04, 0.03],
  covariance: [
    [0.04, 0.01],
    [0.01, 0.03],
  ],
  covarianceShrinkage: 0.2,
  blackLittermanTau: 0.05,
  views: [
    {
      id: 'a-outperforms-b',
      weights: [1, -1],
      expectedReturn: 0.05,
      uncertaintyVariance: 0.01,
    },
  ],
  scenarios: [
    { id: 'base', probability: 0.7, losses: [-0.05, -0.03] },
    { id: 'stress', probability: 0.3, losses: [0.25, 0.15] },
  ],
  riskAversion: 2,
  cvarAlpha: 0.8,
  cvarPenalty: 0.2,
  leverageLimit: 0.9,
  cashTargetWeight: 0.1,
  turnoverLimit: 0.4,
  exposureConstraints: [
    { id: 'sector-tech', kind: 'sector', coefficients: [1, 0], min: 0, max: 0.55 },
    { id: 'country-us', kind: 'country', coefficients: [1, 1], min: 0, max: 0.9 },
    { id: 'factor-growth', kind: 'factor', coefficients: [1, -1], min: -0.3, max: 0.3 },
    { id: 'geo-asia', kind: 'geo', coefficients: [0, 1], min: 0, max: 0.5 },
  ],
  goalMinimumExpectedReturn: null,
  planningPeriods: 3,
  periodDiscount: 0.95,
  iterations: 400,
  stepSize: 0.03,
};

function optimize(overrides: Partial<MultiAssetOptimizerInput> = {}) {
  return optimizeConvexPortfolio({ ...baseInput, ...overrides });
}

function l1Turnover(weights: number[]) {
  return weights.reduce(
    (total, weight, index) => total + Math.abs(weight - baseInput.assets[index]!.currentWeight),
    0,
  );
}

describe('P4-B multi-asset convex portfolio optimizer', () => {
  it('computes a Black–Litterman posterior and satisfies all portfolio constraints', () => {
    const result = optimize();
    assert.equal(result.status, 'optimized');
    assert.ok(
      result.posteriorExpectedReturns[0]! - result.posteriorExpectedReturns[1]! >
        baseInput.equilibriumReturns[0]! - baseInput.equilibriumReturns[1]!,
    );
    assert.equal(result.weights.length, 2);
    assert.ok(result.weights.every(Number.isFinite));
    assert.ok(result.weights[0]! <= 0.55 + 1e-7);
    assert.ok(result.weights[1]! <= 0.5 + 1e-7);
    assert.ok(result.weights.reduce((sum, weight) => sum + weight, 0) <= 0.9 + 1e-7);
    assert.ok(l1Turnover(result.weights) <= 0.4 + 1e-7);
    assert.ok(Number.isFinite(result.cvar));
    assert.ok(Number.isFinite(result.objectiveValue));
    assert.deepEqual(result, optimize());
  });

  it('keeps transaction costs inside the objective and suppresses avoidable turnover', () => {
    const zeroCost = optimize({
      assets: baseInput.assets.map((asset) => ({ ...asset, transactionCostRate: 0 })),
    });
    const highCost = optimize({
      assets: baseInput.assets.map((asset) => ({ ...asset, transactionCostRate: 0.5 })),
    });
    assert.equal(zeroCost.status, 'optimized');
    assert.equal(highCost.status, 'optimized');
    assert.ok(l1Turnover(highCost.weights) <= l1Turnover(zeroCost.weights) + 1e-7);
  });

  it('includes probability mass at VaR in the CVaR subgradient', () => {
    const result = optimizeConvexPortfolio({
      assets: [
        {
          id: 'single',
          currentWeight: 1,
          minWeight: 0,
          maxWeight: 1,
          transactionCostRate: 0,
          turnoverPenalty: 0,
        },
      ],
      equilibriumReturns: [0.1],
      covariance: [[0.01]],
      covarianceShrinkage: 0,
      blackLittermanTau: 0.05,
      views: [],
      scenarios: [
        { id: 'low', probability: 0.8, losses: [0] },
        { id: 'tail', probability: 0.2, losses: [1] },
      ],
      riskAversion: 0,
      cvarAlpha: 0.9,
      cvarPenalty: 1,
      leverageLimit: 1,
      cashTargetWeight: 0,
      turnoverLimit: 1,
      exposureConstraints: [],
      goalMinimumExpectedReturn: null,
      planningPeriods: 1,
      periodDiscount: 1,
      iterations: 400,
      stepSize: 0.05,
    });
    assert.equal(result.status, 'optimized');
    assert.ok(result.weights[0]! < 0.05);
  });

  it('enforces a feasible goal/liability return floor as a linear portfolio constraint', () => {
    const baseline = optimize();
    assert.equal(baseline.status, 'optimized');
    const floor = baseline.expectedReturn - 0.001;
    const result = optimize({ goalMinimumExpectedReturn: floor });
    assert.equal(result.status, 'optimized');
    assert.ok(result.expectedReturn >= floor - 1e-7);
  });

  it('fails closed on non-PD covariance, malformed views, and infeasible exposure constraints', () => {
    assert.deepEqual(
      optimize({
        covariance: [
          [1, 2],
          [2, 1],
        ],
      }),
      { status: 'abstained', reason: 'INVALID_COVARIANCE' },
    );
    assert.deepEqual(optimize({ views: [{ ...baseInput.views[0]!, weights: [1] }] }), {
      status: 'abstained',
      reason: 'INVALID_BLACK_LITTERMAN_VIEW',
    });
    assert.deepEqual(optimize({ views: [{ ...baseInput.views[0]!, weights: [0, 0] }] }), {
      status: 'abstained',
      reason: 'INVALID_BLACK_LITTERMAN_VIEW',
    });
    assert.deepEqual(
      optimize({
        exposureConstraints: [
          { id: 'impossible', kind: 'sector', coefficients: [1, 1], min: 1, max: 1 },
        ],
      }),
      { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' },
    );
    const oversized = optimizeConvexPortfolio({
      ...baseInput,
      scenarios: Array.from({ length: 4_097 }, (_, index) => ({
        id: `scenario-${index}`,
        probability: 1 / 4_097,
        losses: [0.1, 0.1],
      })),
    });
    assert.deepEqual(oversized, { status: 'abstained', reason: 'RESOURCE_LIMIT_EXCEEDED' });
  });
});
