import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileDecisionPacket,
  type DecisionEngineInput,
} from '../src/personalization/decision-engine.ts';

const baseInput: DecisionEngineInput = {
  generatedAt: '2026-07-22T00:00:00.000Z',
  profile: {
    maxPositionWeight: 0.2,
    noTradeBand: 0.01,
  },
  position: {
    hasPosition: true,
    portfolioWeight: 0.02,
  },
  commonView: {
    availability: 'available',
    asOf: '2026-07-21T23:30:00.000Z',
    maxAgeMinutes: 120,
    coverage: 0.95,
    calibration: 'sufficient',
    direction: 'neutral',
    strength: 0.5,
    thesisInvalidated: false,
    expectedBenefitBps: 80,
    modelConflict: false,
  },
  costs: {
    complete: true,
    roundTripBps: 12,
    taxBps: 0,
  },
  previousDecision: null,
};

function decide(overrides: Partial<DecisionEngineInput> = {}) {
  return compileDecisionPacket({
    ...baseInput,
    ...overrides,
    profile: { ...baseInput.profile, ...overrides.profile },
    position: { ...baseInput.position, ...overrides.position },
    commonView: { ...baseInput.commonView, ...overrides.commonView },
    costs: { ...baseInput.costs, ...overrides.costs },
  });
}

describe('P4 abstention-first decision engine', () => {
  it('reduces a 22% holding above the user maximum and no-trade band', () => {
    const packet = decide({
      position: { hasPosition: true, portfolioWeight: 0.22 },
      commonView: { direction: 'neutral', strength: 0.5 },
    });
    assert.equal(packet.action, 'REDUCE');
  });

  it('holds a 2% position when evidence does not justify changing it', () => {
    assert.equal(decide().action, 'HOLD');
  });

  it('watches an unheld security without manufacturing an ADD action', () => {
    const packet = decide({ position: { hasPosition: false, portfolioWeight: 0 } });
    assert.equal(packet.action, 'WATCH');
  });

  it('abstains before action logic on stale, incomplete, or conflicting evidence', () => {
    for (const commonView of [
      { asOf: '2026-07-21T20:00:00.000Z' },
      { coverage: 0.4 },
      { calibration: 'insufficient' as const },
      { modelConflict: true },
    ]) {
      const packet = decide({ commonView });
      assert.equal(packet.action, 'INSUFFICIENT_DATA');
      assert.ok(packet.abstentionReason);
    }
  });

  it('fails closed on runtime-invalid booleans and discriminants', () => {
    const malformedInputs = [
      { position: { hasPosition: 0, portfolioWeight: 0.22 } },
      { commonView: { modelConflict: 0 }, position: { portfolioWeight: 0.22 } },
      {
        commonView: { thesisInvalidated: 1, direction: 'negative', strength: 0.95 },
      },
      { commonView: { direction: 'sideways' }, position: { portfolioWeight: 0.22 } },
      { costs: { complete: 0 } },
      {
        previousDecision: {
          action: 'BUY',
          generatedAt: '2026-07-21T23:30:00.000Z',
          confirmationCount: 0,
        },
      },
    ];

    for (const overrides of malformedInputs) {
      const packet = decide(overrides as unknown as Partial<DecisionEngineInput>);
      assert.equal(packet.action, 'INSUFFICIENT_DATA');
      assert.equal(packet.abstentionReason, 'INVALID_DISCRIMINANT_INPUT');
    }
  });

  it('fails closed without throwing when the runtime envelope is malformed', () => {
    for (const malformed of [
      null,
      {},
      { ...baseInput, commonView: undefined },
      { ...baseInput, costs: undefined },
      { ...baseInput, previousDecision: undefined },
    ]) {
      const packet = compileDecisionPacket(malformed as unknown as DecisionEngineInput);
      assert.equal(packet.action, 'INSUFFICIENT_DATA');
      assert.equal(packet.abstentionReason, 'INVALID_INPUT_SHAPE');
      assert.ok(Number.isFinite(Date.parse(packet.expiresAt)));
    }
  });

  it('normalizes malformed cost scalars without throwing on an early abstention path', () => {
    for (const roundTripBps of [Symbol('invalid-cost'), 1n]) {
      const packet = compileDecisionPacket({
        ...baseInput,
        generatedAt: 'not-a-date',
        costs: { ...baseInput.costs, roundTripBps },
      });
      assert.equal(packet.action, 'INSUFFICIENT_DATA');
      assert.deepEqual(packet.estimatedCosts, {
        roundTripBps: null,
        taxBps: null,
        totalBps: null,
      });
    }
  });

  it('expires at the common-view freshness deadline when it is earlier than 24 hours', () => {
    const packet = decide({
      commonView: {
        asOf: '2026-07-21T22:01:00.000Z',
        maxAgeMinutes: 120,
      },
    });
    assert.equal(packet.expiresAt, '2026-07-22T00:01:00.000Z');
  });

  it('keeps a causal fail-closed expiry near the maximum representable timestamp', () => {
    const generatedAt = '9999-12-31T23:59:59.998Z';
    const packet = decide({
      generatedAt,
      commonView: { asOf: generatedAt, maxAgeMinutes: 1 },
    });
    assert.equal(packet.action, 'INSUFFICIENT_DATA');
    assert.equal(packet.abstentionReason, 'INVALID_TIMESTAMP');
    assert.ok(Date.parse(packet.expiresAt) > Date.parse(generatedAt));
  });

  it('emits EXIT for a strongly invalidated thesis and NO_ACTION when costs erase benefit', () => {
    assert.equal(
      decide({
        position: { hasPosition: true, portfolioWeight: 0.1 },
        commonView: {
          direction: 'negative',
          strength: 0.9,
          thesisInvalidated: true,
          expectedBenefitBps: 0,
        },
        costs: { complete: true, roundTripBps: 10, taxBps: 0 },
      }).action,
      'EXIT',
    );
    assert.equal(
      decide({
        position: { hasPosition: true, portfolioWeight: 0.22 },
        commonView: { expectedBenefitBps: 10 },
        costs: { complete: true, roundTripBps: 12, taxBps: 3 },
      }).action,
      'NO_ACTION',
    );
  });

  it('suppresses one-run directional flips but releases a confirmed change', () => {
    const previousDecision = {
      action: 'ADD' as const,
      generatedAt: '2026-07-21T23:00:00.000Z',
      confirmationCount: 1,
    };
    const changed = {
      position: { hasPosition: true, portfolioWeight: 0.22 },
      commonView: { direction: 'negative' as const, strength: 0.8, expectedBenefitBps: 100 },
    };
    assert.equal(decide({ ...changed, previousDecision }).action, 'HOLD');
    assert.equal(
      decide({
        ...changed,
        previousDecision: { ...previousDecision, confirmationCount: 2 },
      }).action,
      'REDUCE',
    );
  });

  it('does not let an expired prior decision suppress a new confirmed direction', () => {
    const packet = decide({
      position: { hasPosition: true, portfolioWeight: 0.22 },
      commonView: { direction: 'negative', strength: 0.8, expectedBenefitBps: 100 },
      previousDecision: {
        action: 'ADD',
        generatedAt: '2026-07-19T00:00:00.000Z',
        confirmationCount: 1,
      },
    });
    assert.equal(packet.action, 'REDUCE');
  });

  it('treats a prior decision at the exact 24-hour boundary as expired', () => {
    const packet = decide({
      position: { hasPosition: true, portfolioWeight: 0.22 },
      commonView: { direction: 'negative', strength: 0.8, expectedBenefitBps: 100 },
      previousDecision: {
        action: 'ADD',
        generatedAt: '2026-07-21T00:00:00.000Z',
        confirmationCount: 1,
      },
    });
    assert.equal(packet.action, 'REDUCE');
  });

  it('abstains without throwing on invalid timestamps, costs, or contradictory positions', () => {
    for (const overrides of [
      { generatedAt: 'not-a-date' },
      { generatedAt: '2026-07-22' },
      { commonView: { asOf: '2026-07-21' } },
      { commonView: { maxAgeMinutes: Number.MAX_VALUE } },
      { costs: { complete: true, roundTripBps: Number.NaN, taxBps: 0 } },
      {
        costs: {
          complete: true,
          roundTripBps: Number.MAX_VALUE,
          taxBps: Number.MAX_VALUE,
        },
      },
      { position: { hasPosition: false, portfolioWeight: 0.1 } },
      { position: { hasPosition: true, portfolioWeight: 0 } },
      {
        previousDecision: {
          action: 'ADD' as const,
          generatedAt: 'not-a-date',
          confirmationCount: 1,
        },
      },
      {
        previousDecision: {
          action: 'ADD' as const,
          generatedAt: '2026-07-21',
          confirmationCount: 1,
        },
      },
    ]) {
      const packet = decide(overrides);
      assert.equal(packet.action, 'INSUFFICIENT_DATA');
      assert.ok(Number.isFinite(Date.parse(packet.expiresAt)));
    }
    assert.deepEqual(
      decide({ costs: { complete: true, roundTripBps: Number.NaN, taxBps: 0 } }).estimatedCosts,
      { roundTripBps: null, taxBps: null, totalBps: null },
    );
    const invalidCoverage = decide({ commonView: { coverage: Number.NaN } });
    assert.equal(invalidCoverage.action, 'INSUFFICIENT_DATA');
    assert.equal(invalidCoverage.uncertainty.coverage, 0);
  });

  it('always returns a non-executable, advice-prohibited, expiring packet', () => {
    const packet = decide();
    assert.equal(packet.adviceProhibited, true);
    assert.equal(packet.orderExecutable, false);
    assert.equal(packet.legalReviewStatus, 'required');
    assert.ok(Date.parse(packet.expiresAt) > Date.parse(baseInput.generatedAt));
    assert.ok(packet.actionReason.length > 0);
    assert.ok(Array.isArray(packet.counterEvidence));
    assert.ok(Array.isArray(packet.failureConditions));
  });
});
