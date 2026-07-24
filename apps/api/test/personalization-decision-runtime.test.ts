import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DECISION_REASON_CODES,
  compileDecisionRuntimePacket,
  type DecisionRuntimeInput,
} from '../src/personalization/decision-runtime.ts';

const baseInput: DecisionRuntimeInput = {
  generatedAt: '2026-07-22T00:00:00.000Z',
  horizon: 'medium',
  confirmationContextKey: 'context-current',
  profile: {
    maxPositionWeight: 0.2,
    noTradeBand: 0.01,
    minimumCoverage: 0.7,
    cashTargetWeight: 0.1,
    riskBudget: 0.05,
    riskAversion: 2,
    cvarPenalty: 5,
    turnoverPenalty: 0.2,
    actionEntryThresholdWeight: 0.01,
    actionReleaseThresholdWeight: 0.005,
    materialityUtilityThreshold: 0.0001,
    cooldownMinutes: 1_440,
    requiredConfirmations: 2,
    emergencyValidityMinutes: 60,
  },
  decisionPolicy: {
    thesisReturnAdjustments: {
      improved: 0.02,
      intact: 0,
      weakened: -0.08,
      broken: -1,
      unknown: 0,
    },
    eventReturnMultiplier: 0.05,
    catalystExpiredReturnAdjustment: -0.05,
    geoCvarMultiplier: 1,
    valuationCvarMultiplier: 1,
  },
  portfolio: {
    hasPosition: true,
    currentWeight: 0.02,
    cashWeight: 0.15,
    marginalRiskPerWeight: 0.2,
    liquidityMaxTradeWeight: 0.05,
    maxTradeWeight: 0.1,
    allocatedCashRecoveryWeight: 0,
  },
  thesis: { state: 'intact', catalystExpired: false },
  commonView: {
    availability: 'available',
    asOf: '2026-07-21T23:30:00.000Z',
    maxAgeMinutes: 120,
    coverage: 0.95,
    calibration: 'sufficient',
    modelConflict: false,
    rumorOrProvisional: false,
    direction: 'neutral',
    eventTransmission: 0,
    geoConcentrationRisk: 0,
    valuationRisk: 0,
    dataQualityDegraded: false,
    betterAlternative: false,
    alternativeExpectedReturn: null,
  },
  probabilityContext: {
    equilibriumExpectedReturn: 0.01,
    evidenceConfidence: 0.8,
    changePointProbability: 0.1,
    adverseHazard: 0.05,
    scenarios: [
      { id: 'base', probability: 0.7, expectedReturn: 0.01, downsideCvar: 0.08 },
      { id: 'bear', probability: 0.3, expectedReturn: -0.02, downsideCvar: 0.2 },
    ],
    conformal: {
      targetCoverage: 0.9,
      empiricalCoverage: 0.92,
      lowerReturn: -0.15,
      upperReturn: 0.2,
    },
    riskScalingPolicy: {
      changePointMultiplier: 1,
      coverageShortfallMultiplier: 2,
      adverseHazardMultiplier: 1,
    },
    methodEvidence: {
      hierarchicalModel: 'normal-normal-hierarchical-v1',
      hierarchicalPosteriorMean: 0.01,
      hierarchicalPosteriorVariance: 0.01,
      hierarchicalGroupCount: 2,
      bocpdModel: 'normal-known-variance-bocpd-v1',
      bocpdObservationCount: 5,
      scenarioModel: 'conditional-probability-tree-v1',
      scenarioLeafCount: 2,
      conformalModel: 'recency-weighted-absolute-residual-v1',
      conformalSampleCount: 5,
      hazardModel: 'proportional-hazard-v1',
      lifecycleStage: 'monitoring',
      resolutionHazard: 0.2,
    },
  },
  costs: { complete: true, transactionCostRate: 0.002, taxCostRate: 0 },
  emergency: {
    tradingHalt: false,
    bankruptcy: false,
    materialLegalEvent: false,
    sourceState: 'none',
    verifiedAt: null,
  },
  previousDecision: null,
  evidence: {
    supporting: ['공통 view와 사용자 제약이 동일 정보시점에 결속됨'],
    counter: ['약세 scenario의 하방 위험이 남아 있음'],
    unknowns: ['다음 실적 발표 결과'],
    eventAndGeoPaths: ['event → company → security'],
    invalidationTriggers: ['논지 핵심 조건 훼손'],
    nextReviewConditions: ['새 공시 또는 가격 정보 갱신'],
  },
};

function compile(overrides: Partial<DecisionRuntimeInput> = {}) {
  return compileDecisionRuntimePacket({
    ...baseInput,
    ...overrides,
    profile: { ...baseInput.profile, ...overrides.profile },
    decisionPolicy: {
      ...baseInput.decisionPolicy,
      ...overrides.decisionPolicy,
      thesisReturnAdjustments: {
        ...baseInput.decisionPolicy.thesisReturnAdjustments,
        ...overrides.decisionPolicy?.thesisReturnAdjustments,
      },
    },
    portfolio: { ...baseInput.portfolio, ...overrides.portfolio },
    thesis: { ...baseInput.thesis, ...overrides.thesis },
    commonView: { ...baseInput.commonView, ...overrides.commonView },
    probabilityContext: {
      ...baseInput.probabilityContext,
      ...overrides.probabilityContext,
      conformal: {
        ...baseInput.probabilityContext.conformal,
        ...overrides.probabilityContext?.conformal,
      },
      riskScalingPolicy: {
        ...baseInput.probabilityContext.riskScalingPolicy,
        ...overrides.probabilityContext?.riskScalingPolicy,
      },
    },
    costs: { ...baseInput.costs, ...overrides.costs },
    emergency: { ...baseInput.emergency, ...overrides.emergency },
    evidence: { ...baseInput.evidence, ...overrides.evidence },
  });
}

const positiveScenarios = [
  { id: 'base', probability: 0.8, expectedReturn: 0.2, downsideCvar: 0.05 },
  { id: 'bear', probability: 0.2, expectedReturn: -0.02, downsideCvar: 0.15 },
];

const negativeScenarios = [
  { id: 'base', probability: 0.5, expectedReturn: -0.1, downsideCvar: 0.15 },
  { id: 'bear', probability: 0.5, expectedReturn: -0.3, downsideCvar: 0.4 },
];

describe('P4-B personalized decision runtime', () => {
  it('freezes exactly 18 action reason codes and keeps degraded data out of action reasons', () => {
    assert.equal(DECISION_REASON_CODES.length, 18);
    assert.equal(new Set(DECISION_REASON_CODES).size, 18);
    assert.deepEqual(DECISION_REASON_CODES, [
      'THESIS_WEAKENED',
      'THESIS_BROKEN',
      'NEGATIVE_EVENT_TRANSMISSION',
      'GEO_CONCENTRATION_RISK',
      'VALUATION_RISK',
      'RISK_BUDGET_BREACH',
      'PORTFOLIO_CONCENTRATION',
      'LIQUIDITY_NEED',
      'CATALYST_EXPIRED',
      'BETTER_RISK_ADJUSTED_ALTERNATIVE',
      'THESIS_INTACT',
      'POSITIVE_SCENARIO_ASYMMETRY',
      'MARGIN_OF_SAFETY',
      'DIVERSIFICATION_BENEFIT',
      'UNDER_TARGET_WEIGHT',
      'POSITIVE_EVENT_TRANSMISSION',
      'COST_OF_TRADING_EXCEEDS_BENEFIT',
      'WAIT_FOR_CONFIRMATION',
    ]);
    assert.ok(!DECISION_REASON_CODES.includes('DATA_QUALITY_DEGRADED' as never));
  });

  it('returns the exact nine-part explanation without executable advice', () => {
    const packet = compile();
    assert.equal(packet.orderExecutable, false);
    assert.equal(packet.adviceProhibited, true);
    assert.deepEqual(Object.keys(packet.explanation).sort(), [
      'commonAssetView',
      'costAndConcentration',
      'counterEvidenceAndUnknowns',
      'eventAndGeoPath',
      'expiresAt',
      'invalidationAndNextReview',
      'personalizedRationale',
      'returnRiskHorizon',
      'whatChanged',
    ]);
    assert.deepEqual(packet.dynamicProbability, {
      scenarioProbabilityTotal: 1,
      scenarioExpectedReturn: 0.001,
      blendedExpectedReturn: 0.0028,
      decisionExpectedReturn: 0.0028,
      scenarioCvar: 0.116,
      scaledCvarPerWeight: 0.1334,
      decisionCvarPerWeight: 0.1334,
      scenarioVariance: 0.000189,
      coverageShortfall: 0,
      riskScale: 1.15,
    });
    assert.deepEqual(packet.explanation.commonAssetView.supportingEvidence, [
      '공통 view와 사용자 제약이 동일 정보시점에 결속됨',
    ]);
    assert.equal(packet.explanation.costAndConcentration.totalTransactionCostRate, 0.002);
    assert.equal(
      packet.explanation.costAndConcentration.maxPositionWeight,
      baseInput.profile.maxPositionWeight,
    );
    assert.equal(packet.explanation.costAndConcentration.riskBudget, baseInput.profile.riskBudget);
    assert.ok(packet.expiresAt > baseInput.generatedAt);
  });

  it('uses thesis and alternative-opportunity signals to drive actions before attaching reasons', () => {
    const broken = compile({
      profile: { requiredConfirmations: 0 },
      thesis: { state: 'broken' },
    });
    assert.equal(broken.action, 'EXIT');
    assert.deepEqual(broken.reasonCodes, ['THESIS_BROKEN']);

    const weakened = compile({
      profile: { requiredConfirmations: 0 },
      thesis: { state: 'weakened' },
      decisionPolicy: { thesisReturnAdjustments: { weakened: -0.5 } },
    });
    assert.equal(weakened.action, 'REDUCE');
    assert.ok(weakened.reasonCodes.includes('THESIS_WEAKENED'));

    const alternative = compile({
      profile: { requiredConfirmations: 0 },
      commonView: { betterAlternative: true, alternativeExpectedReturn: 0.5 },
    });
    assert.equal(alternative.action, 'REDUCE');
    assert.ok(alternative.reasonCodes.includes('BETTER_RISK_ADJUSTED_ALTERNATIVE'));
  });

  it('feeds event, geo, and valuation signals into expected return and risk', () => {
    const packet = compile({
      commonView: {
        eventTransmission: -0.5,
        geoConcentrationRisk: 0.4,
        valuationRisk: 0.6,
      },
      decisionPolicy: {
        eventReturnMultiplier: 0.1,
        geoCvarMultiplier: 2,
        valuationCvarMultiplier: 3,
      },
    });
    assert.equal(packet.dynamicProbability.decisionExpectedReturn, -0.0472);
    assert.ok(packet.dynamicProbability.decisionCvarPerWeight > 0.1334);
  });

  it('does not invent a reduction or cost reason without a matching driver', () => {
    const noDriver = compile({
      profile: { requiredConfirmations: 0 },
      probabilityContext: { scenarios: negativeScenarios },
    });
    assert.equal(noDriver.action, 'HOLD');
    assert.ok(!noDriver.reasonCodes.includes('BETTER_RISK_ADJUSTED_ALTERNATIVE'));

    const noCost = compile({
      costs: { transactionCostRate: 0, taxCostRate: 0 },
    });
    assert.ok(!noCost.reasonCodes.includes('COST_OF_TRADING_EXCEEDS_BENEFIT'));
  });

  it('requires a first confirmation before an unconstrained directional action', () => {
    const packet = compile({ probabilityContext: { scenarios: positiveScenarios } });
    assert.equal(packet.action, 'HOLD');
    assert.deepEqual(packet.reasonCodes, ['WAIT_FOR_CONFIRMATION']);
  });

  it('reduces an overweight holding and binds concentration and risk reasons', () => {
    const packet = compile({
      portfolio: { currentWeight: 0.22 },
      profile: { riskBudget: 0.035 },
    });
    assert.equal(packet.action, 'REDUCE');
    assert.ok(packet.targetWeight.high <= 0.2);
    assert.ok(packet.reasonCodes.includes('PORTFOLIO_CONCENTRATION'));
    assert.ok(packet.reasonCodes.includes('RISK_BUDGET_BREACH'));
  });

  it('takes the maximum feasible staged reduction when policy bounds cannot be reached in one step', () => {
    const packet = compile({
      portfolio: {
        currentWeight: 0.9,
        cashWeight: 0.1,
        maxTradeWeight: 0.1,
        liquidityMaxTradeWeight: 0.05,
      },
      profile: { maxPositionWeight: 0.2, riskBudget: 0.02 },
    });
    assert.equal(packet.action, 'REDUCE');
    assert.equal(packet.targetWeight.high, 0.85);
    assert.ok(packet.reasonCodes.includes('PORTFOLIO_CONCENTRATION'));
    assert.ok(packet.optimizer.bindingConstraints.includes('LIQUIDITY_MAX_TRADE'));
  });

  it('does not let cooldown suppress a hard portfolio constraint reduction', () => {
    const packet = compile({
      portfolio: { currentWeight: 0.22 },
      previousDecision: {
        action: 'ADD',
        generatedAt: '2026-07-21T23:30:00.000Z',
        confirmationCount: 0,
        confirmationCandidateAction: null,
        confirmationContextKey: null,
      },
    });
    assert.equal(packet.action, 'REDUCE');
    assert.ok(packet.reasonCodes.includes('PORTFOLIO_CONCENTRATION'));
  });

  it('abstains instead of emitting REDUCE when a hard breach cannot be reduced', () => {
    const packet = compile({
      portfolio: {
        currentWeight: 0.22,
        maxTradeWeight: 0,
        liquidityMaxTradeWeight: 0,
      },
    });
    assert.equal(packet.action, 'INSUFFICIENT_DATA');
    assert.equal(packet.abstentionReason, 'HARD_CONSTRAINT_REDUCTION_INFEASIBLE');
    assert.equal(packet.optimizer.tradeWeight, 0);
  });

  it('restores a cash deficit subject to the liquidity trade cap', () => {
    const packet = compile({
      portfolio: {
        currentWeight: 0.1,
        cashWeight: 0.03,
        allocatedCashRecoveryWeight: 0.05,
      },
    });
    assert.equal(packet.action, 'REDUCE');
    assert.ok(packet.reasonCodes.includes('LIQUIDITY_NEED'));
    assert.ok(packet.targetWeight.high >= 0.05 - 1e-9);
    assert.ok(packet.targetWeight.high <= 0.05 + 1e-9);
  });

  it('does not repeat a portfolio cash deficit onto an unheld security', () => {
    const packet = compile({
      portfolio: {
        hasPosition: false,
        currentWeight: 0,
        cashWeight: 0.03,
        allocatedCashRecoveryWeight: 0,
      },
    });
    assert.equal(packet.action, 'WATCH');
    assert.ok(!packet.reasonCodes.includes('LIQUIDITY_NEED'));
  });

  it('lets a thesis-breaking emergency bypass cooldown and confirmation without creating orders', () => {
    const packet = compile({
      thesis: { state: 'broken' },
      emergency: {
        bankruptcy: true,
        sourceState: 'verified',
        verifiedAt: '2026-07-21T23:55:00.000Z',
      },
      previousDecision: {
        action: 'ADD',
        generatedAt: '2026-07-21T23:30:00.000Z',
        confirmationCount: 0,
        confirmationCandidateAction: null,
        confirmationContextKey: null,
      },
    });
    assert.equal(packet.action, 'EXIT');
    assert.deepEqual(packet.reasonCodes, ['THESIS_BROKEN']);
    assert.equal(packet.targetWeight.high, 0);
    assert.equal(packet.optimizer.tradeWeight, 0);
    assert.equal(packet.orderExecutable, false);
  });

  it('treats a trading halt as non-tradable instead of manufacturing an exit trade', () => {
    const exactWeight = 5e-13;
    const packet = compile({
      portfolio: { currentWeight: exactWeight },
      emergency: {
        tradingHalt: true,
        sourceState: 'verified',
        verifiedAt: '2026-07-21T23:55:00.000Z',
      },
    });
    assert.equal(packet.action, 'NO_ACTION');
    assert.equal(packet.targetWeight.high, exactWeight);
    assert.equal(packet.optimizer.tradeWeight, 0);
    assert.deepEqual(packet.reasonCodes, ['NEGATIVE_EVENT_TRANSMISSION']);
  });

  it('lets emergency override stale forecast and incomplete-cost gates for an existing holding', () => {
    const packet = compile({
      commonView: {
        asOf: '2026-07-21T20:00:00.000Z',
        calibration: 'insufficient',
      },
      costs: { complete: false },
      thesis: { state: 'broken' },
      emergency: {
        bankruptcy: true,
        sourceState: 'verified',
        verifiedAt: '2026-07-21T23:55:00.000Z',
      },
    });
    assert.equal(packet.action, 'EXIT');
    assert.deepEqual(packet.reasonCodes, ['THESIS_BROKEN']);
    assert.equal(packet.expiresAt, '2026-07-22T00:55:00.000Z');
  });

  it('never converts an emergency on an unheld security into ADD', () => {
    const packet = compile({
      portfolio: { hasPosition: false, currentWeight: 0 },
      probabilityContext: { scenarios: positiveScenarios },
      emergency: {
        bankruptcy: true,
        sourceState: 'verified',
        verifiedAt: '2026-07-21T23:55:00.000Z',
      },
    });
    assert.equal(packet.action, 'NO_ACTION');
    assert.equal(packet.targetWeight.high, 0);
    assert.equal(packet.orderExecutable, false);
  });

  it('rejects unverified or stale emergency overrides', () => {
    const unverified = compile({ emergency: { bankruptcy: true } });
    assert.equal(unverified.action, 'INSUFFICIENT_DATA');
    assert.equal(unverified.abstentionReason, 'INVALID_EMERGENCY_PROVENANCE');

    const stale = compile({
      emergency: {
        bankruptcy: true,
        sourceState: 'verified',
        verifiedAt: '2026-07-21T22:00:00.000Z',
      },
    });
    assert.equal(stale.action, 'INSUFFICIENT_DATA');
    assert.equal(stale.abstentionReason, 'STALE_EMERGENCY_SIGNAL');
  });

  it('keeps a verified bankruptcy override when probability arithmetic overflows', () => {
    const packet = compile({
      emergency: {
        bankruptcy: true,
        sourceState: 'verified',
        verifiedAt: '2026-07-21T23:55:00.000Z',
      },
      probabilityContext: {
        scenarios: [
          {
            id: 'positive-overflow',
            probability: 0.5,
            expectedReturn: Number.MAX_VALUE,
            downsideCvar: 0.1,
          },
          {
            id: 'negative-overflow',
            probability: 0.5,
            expectedReturn: -Number.MAX_VALUE,
            downsideCvar: 0.1,
          },
        ],
      },
    });
    assert.equal(packet.action, 'EXIT');
    assert.equal(packet.abstentionReason, null);
    assert.equal(packet.dynamicProbability.decisionExpectedReturn, 0);
  });

  it('requires confirmation and cooldown release before a positive directional change', () => {
    const waiting = compile({
      probabilityContext: { scenarios: positiveScenarios },
      previousDecision: {
        action: 'HOLD',
        generatedAt: '2026-07-21T23:30:00.000Z',
        confirmationCount: 1,
        confirmationCandidateAction: 'ADD',
        confirmationContextKey: 'context-current',
      },
    });
    assert.equal(waiting.action, 'HOLD');
    assert.deepEqual(waiting.reasonCodes, ['WAIT_FOR_CONFIRMATION']);

    const confirmed = compile({
      probabilityContext: { scenarios: positiveScenarios },
      previousDecision: {
        action: 'HOLD',
        generatedAt: '2026-07-20T00:00:00.000Z',
        confirmationCount: 2,
        confirmationCandidateAction: 'ADD',
        confirmationContextKey: 'context-current',
      },
    });
    assert.equal(confirmed.action, 'ADD');
    assert.ok(confirmed.reasonCodes.includes('UNDER_TARGET_WEIGHT'));
  });

  it('does not reuse confirmation counts across a different action or context', () => {
    for (const previousDecision of [
      {
        action: 'HOLD' as const,
        generatedAt: '2026-07-20T00:00:00.000Z',
        confirmationCount: 99,
        confirmationCandidateAction: 'REDUCE' as const,
        confirmationContextKey: 'context-current',
      },
      {
        action: 'HOLD' as const,
        generatedAt: '2026-07-20T00:00:00.000Z',
        confirmationCount: 99,
        confirmationCandidateAction: 'ADD' as const,
        confirmationContextKey: 'context-stale',
      },
    ]) {
      const packet = compile({
        probabilityContext: { scenarios: positiveScenarios },
        previousDecision,
      });
      assert.equal(packet.action, 'HOLD');
      assert.deepEqual(packet.reasonCodes, ['WAIT_FOR_CONFIRMATION']);
    }
  });

  it('abstains when embedded trading costs exceed the modeled benefit', () => {
    const packet = compile({
      probabilityContext: { scenarios: positiveScenarios },
      costs: { transactionCostRate: 0.5 },
    });
    assert.equal(packet.action, 'INSUFFICIENT_DATA');
    assert.equal(packet.abstentionReason, 'COST_OF_TRADING_EXCEEDS_BENEFIT');
    assert.deepEqual(packet.reasonCodes, ['COST_OF_TRADING_EXCEEDS_BENEFIT']);
    assert.ok(Math.abs(packet.optimizer.tradeWeight) <= 1e-9);
  });

  it('fails closed on stale, rumor, degraded, miscalibrated, or malformed probability context', () => {
    for (const overrides of [
      { commonView: { asOf: '2026-07-21T20:00:00.000Z' } },
      { commonView: { rumorOrProvisional: true } },
      { commonView: { dataQualityDegraded: true } },
      { commonView: { calibration: 'insufficient' as const } },
      {
        commonView: { betterAlternative: true, alternativeExpectedReturn: -0.5 },
      },
      { evidence: { supporting: [], counter: [] } },
      {
        commonView: { eventTransmission: 0.5 },
        evidence: { eventAndGeoPaths: [] },
      },
      { profile: { minimumCoverage: 0.8 }, commonView: { coverage: 0.75 } },
      {
        previousDecision: {
          action: 'HOLD' as const,
          generatedAt: '2026-07-23T00:00:00.000Z',
          confirmationCount: 2,
          confirmationCandidateAction: 'ADD' as const,
          confirmationContextKey: 'context-current',
        },
      },
      { probabilityContext: { scenarios: [{ ...positiveScenarios[0]!, probability: 0.2 }] } },
      {
        probabilityContext: {
          scenarios: [
            { ...positiveScenarios[0]!, id: 'duplicate', probability: 0.5 },
            { ...positiveScenarios[1]!, id: 'duplicate', probability: 0.5 },
          ],
        },
      },
      {
        probabilityContext: {
          scenarios: [
            {
              id: 'positive-overflow',
              probability: 0.5,
              expectedReturn: Number.MAX_VALUE,
              downsideCvar: 0.1,
            },
            {
              id: 'negative-overflow',
              probability: 0.5,
              expectedReturn: -Number.MAX_VALUE,
              downsideCvar: 0.1,
            },
          ],
        },
      },
    ]) {
      const packet = compile(overrides as Partial<DecisionRuntimeInput>);
      assert.equal(packet.action, 'INSUFFICIENT_DATA');
      assert.ok(packet.abstentionReason);
      assert.deepEqual(packet.reasonCodes, []);
    }
  });

  it('derives the same packet from the same immutable context', () => {
    assert.deepEqual(
      compile({ probabilityContext: { scenarios: negativeScenarios } }),
      compile({ probabilityContext: { scenarios: negativeScenarios } }),
    );
  });
});
