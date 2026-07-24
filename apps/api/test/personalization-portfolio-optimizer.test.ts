import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  optimizeTargetWeight,
  type ConvexTargetOptimizerInput,
} from '../src/personalization/portfolio-optimizer.ts';

const baseInput: ConvexTargetOptimizerInput = {
  currentWeight: 0.1,
  expectedReturn: 0.08,
  variance: 0.04,
  cvarPerWeight: 0.2,
  cvarBudget: 0.04,
  riskAversion: 2,
  cvarPenalty: 5,
  transactionCostRate: 0.001,
  turnoverPenalty: 0.2,
  minWeight: 0,
  maxWeight: 0.25,
  maxTradeWeight: 0.1,
  cashAvailableWeight: 0.1,
  liquidityMaxTradeWeight: 0.05,
};

function optimize(overrides: Partial<ConvexTargetOptimizerInput> = {}) {
  return optimizeTargetWeight({ ...baseInput, ...overrides });
}

describe('P4-B bounded convex target-weight optimizer', () => {
  it('optimizes inside position, cash, trade, and liquidity bounds', () => {
    const result = optimize();
    assert.equal(result.status, 'optimized');
    assert.ok(result.targetWeight > baseInput.currentWeight);
    assert.ok(result.targetWeight <= 0.15 + 1e-9);
    assert.ok(result.tradeWeight <= baseInput.liquidityMaxTradeWeight + 1e-9);
    assert.ok(result.objectiveImprovement >= 0);
    assert.ok(result.bindingConstraints.includes('LIQUIDITY_MAX_TRADE'));
  });

  it('embeds transaction cost in the objective instead of subtracting it afterward', () => {
    const result = optimize({ transactionCostRate: 0.2, turnoverPenalty: 0 });
    assert.equal(result.status, 'optimized');
    assert.ok(Math.abs(result.targetWeight - baseInput.currentWeight) <= 1e-9);
    assert.ok(Math.abs(result.tradeWeight) <= 1e-9);
  });

  it('cannot add beyond spendable cash and can still reduce a negative-return holding', () => {
    const noCash = optimize({ cashAvailableWeight: 0 });
    assert.equal(noCash.status, 'optimized');
    assert.ok(noCash.targetWeight <= baseInput.currentWeight + 1e-9);

    const reduce = optimize({ expectedReturn: -0.2 });
    assert.equal(reduce.status, 'optimized');
    assert.ok(reduce.targetWeight < baseInput.currentWeight);
    assert.ok(reduce.targetWeight >= 0.05 - 1e-9);
  });

  it('is deterministic for the same immutable input', () => {
    assert.deepEqual(optimize(), optimize());
  });

  it('fails closed on invalid or infeasible convex inputs', () => {
    assert.deepEqual(optimize({ variance: -1 }), {
      status: 'abstained',
      reason: 'INVALID_OPTIMIZER_INPUT',
    });
    assert.deepEqual(optimize({ minWeight: 0.2, maxWeight: 0.1 }), {
      status: 'abstained',
      reason: 'INFEASIBLE_CONSTRAINTS',
    });
    assert.deepEqual(optimizeTargetWeight({ ...baseInput, transactionCostRate: Number.NaN }), {
      status: 'abstained',
      reason: 'INVALID_OPTIMIZER_INPUT',
    });
  });

  it('treats a zero CVaR penalty as a zero term without 0 × Infinity poisoning', () => {
    const result = optimize({
      currentWeight: 0,
      expectedReturn: 1,
      variance: 0,
      cvarPerWeight: 1e200,
      cvarBudget: 0,
      riskAversion: 0,
      cvarPenalty: 0,
      transactionCostRate: 0,
      turnoverPenalty: 0,
      minWeight: 0,
      maxWeight: 1,
      maxTradeWeight: 1,
      cashAvailableWeight: 1,
      liquidityMaxTradeWeight: 1,
    });
    assert.equal(result.status, 'optimized');
    assert.equal(result.targetWeight, 1);
    assert.ok(Number.isFinite(result.objectiveValue));
    assert.ok(Number.isFinite(result.objectiveImprovement));
  });

  it('abstains when a finite input vector produces non-finite objective arithmetic', () => {
    assert.deepEqual(
      optimize({
        currentWeight: 1,
        expectedReturn: 0,
        variance: 0,
        cvarPerWeight: 1e200,
        cvarBudget: 0,
        riskAversion: 0,
        cvarPenalty: 1,
        transactionCostRate: 0,
        turnoverPenalty: 0,
        minWeight: 0,
        maxWeight: 0,
        maxTradeWeight: 1,
        cashAvailableWeight: 0,
        liquidityMaxTradeWeight: 1,
      }),
      { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' },
    );
    assert.deepEqual(optimize({ riskAversion: Number.MAX_VALUE, variance: Number.MAX_VALUE }), {
      status: 'abstained',
      reason: 'INVALID_OPTIMIZER_INPUT',
    });
  });

  it('preserves a nonzero risk term across equivalent subnormal and rescaled coefficients', () => {
    const shared = {
      currentWeight: 0,
      expectedReturn: 2e-16,
      cvarPerWeight: 0,
      cvarBudget: 0,
      cvarPenalty: 0,
      transactionCostRate: 0,
      turnoverPenalty: 0,
      minWeight: 0,
      maxWeight: 1,
      maxTradeWeight: 1,
      cashAvailableWeight: 1,
      liquidityMaxTradeWeight: 1,
    };
    const subnormal = optimize({
      ...shared,
      riskAversion: Number.MIN_VALUE,
      variance: 1e308,
    });
    const rescaled = optimize({
      ...shared,
      riskAversion: Number.MIN_VALUE * 1e308,
      variance: 1,
    });
    assert.equal(subnormal.status, 'optimized');
    assert.equal(rescaled.status, 'optimized');
    assert.ok(subnormal.targetWeight > 0 && subnormal.targetWeight < 0.9);
    assert.ok(Math.abs(subnormal.targetWeight - rescaled.targetWeight) <= 1e-9);
  });

  it('returns the evaluated weight without rounding it outside narrow bounds', () => {
    const result = optimize({
      currentWeight: 0,
      expectedReturn: 1,
      variance: 0,
      cvarPerWeight: 0,
      cvarBudget: 0,
      riskAversion: 0,
      cvarPenalty: 0,
      transactionCostRate: 0,
      turnoverPenalty: 0,
      minWeight: 4e-13,
      maxWeight: 5e-13,
      maxTradeWeight: 1,
      cashAvailableWeight: 1,
      liquidityMaxTradeWeight: 1,
    });
    assert.equal(result.status, 'optimized');
    assert.ok(result.targetWeight >= 4e-13);
    assert.ok(result.targetWeight <= 5e-13);
  });

  it('rejects an empty derived feasible interval even below Number.EPSILON', () => {
    assert.deepEqual(
      optimize({
        currentWeight: 0.5,
        minWeight: 0,
        maxWeight: 0.5 - Number.EPSILON / 2,
        maxTradeWeight: 0,
        liquidityMaxTradeWeight: 1,
        cashAvailableWeight: 1,
      }),
      { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' },
    );
  });
});
