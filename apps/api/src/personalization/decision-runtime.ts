import type { DecisionAction } from './decision-engine.ts';
import type { DynamicProbabilityRuntimeContext } from './dynamic-probability-model.ts';
import {
  optimizeTargetWeight,
  type ConvexTargetOptimizerResult,
  type OptimizerBindingConstraint,
} from './portfolio-optimizer.ts';

export const DECISION_REASON_CODES = [
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
] as const;

export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number];
export type ThesisState = 'improved' | 'intact' | 'weakened' | 'broken' | 'unknown';

export type DecisionRuntimeInput = {
  generatedAt: string;
  horizon: string;
  confirmationContextKey: string;
  profile: {
    maxPositionWeight: number;
    noTradeBand: number;
    minimumCoverage: number;
    cashTargetWeight: number;
    riskBudget: number;
    riskAversion: number;
    cvarPenalty: number;
    turnoverPenalty: number;
    actionEntryThresholdWeight: number;
    actionReleaseThresholdWeight: number;
    materialityUtilityThreshold: number;
    cooldownMinutes: number;
    requiredConfirmations: number;
    emergencyValidityMinutes: number;
  };
  decisionPolicy: {
    thesisReturnAdjustments: Record<ThesisState, number>;
    eventReturnMultiplier: number;
    catalystExpiredReturnAdjustment: number;
    geoCvarMultiplier: number;
    valuationCvarMultiplier: number;
  };
  portfolio: {
    hasPosition: boolean;
    currentWeight: number;
    cashWeight: number;
    marginalRiskPerWeight: number;
    liquidityMaxTradeWeight: number;
    maxTradeWeight: number;
    allocatedCashRecoveryWeight: number;
  };
  thesis: {
    state: ThesisState;
    catalystExpired: boolean;
  };
  commonView: {
    availability: 'available' | 'empty' | 'missing' | 'error';
    asOf: string;
    maxAgeMinutes: number;
    coverage: number;
    calibration: 'sufficient' | 'insufficient' | 'missing';
    modelConflict: boolean;
    rumorOrProvisional: boolean;
    direction: 'positive' | 'neutral' | 'negative' | 'mixed';
    eventTransmission: number;
    geoConcentrationRisk: number;
    valuationRisk: number;
    dataQualityDegraded: boolean;
    betterAlternative: boolean;
    alternativeExpectedReturn: number | null;
    marginOfSafety?: boolean;
    diversificationBenefit?: boolean;
  };
  probabilityContext: DynamicProbabilityRuntimeContext;
  costs: {
    complete: boolean;
    transactionCostRate: number;
    taxCostRate: number;
  };
  emergency: {
    tradingHalt: boolean;
    bankruptcy: boolean;
    materialLegalEvent: boolean;
    sourceState: 'none' | 'verified';
    verifiedAt: string | null;
  };
  previousDecision: {
    action: DecisionAction;
    generatedAt: string;
    confirmationCount: number;
    confirmationCandidateAction: 'ADD' | 'REDUCE' | 'EXIT' | null;
    confirmationContextKey: string | null;
  } | null;
  evidence: {
    supporting: string[];
    counter: string[];
    unknowns: string[];
    eventAndGeoPaths: string[];
    invalidationTriggers: string[];
    nextReviewConditions: string[];
  };
};

export type DecisionRuntimePacket = {
  action: DecisionAction;
  reasonCodes: DecisionReasonCode[];
  abstentionReason: string | null;
  targetWeight: { low: number; high: number; maxTrade: number };
  thesisState: ThesisState;
  optimizer: {
    status: 'optimized' | 'not_run';
    targetWeight: number;
    tradeWeight: number;
    objectiveImprovement: number;
    bindingConstraints: OptimizerBindingConstraint[];
  };
  dynamicProbability: {
    scenarioProbabilityTotal: number;
    scenarioExpectedReturn: number;
    blendedExpectedReturn: number;
    decisionExpectedReturn: number;
    scenarioCvar: number;
    scaledCvarPerWeight: number;
    decisionCvarPerWeight: number;
    scenarioVariance: number;
    coverageShortfall: number;
    riskScale: number;
  };
  explanation: {
    whatChanged: string;
    commonAssetView: {
      summary: string;
      direction: DecisionRuntimeInput['commonView']['direction'];
      asOf: string;
      supportingEvidence: string[];
    };
    personalizedRationale: string;
    eventAndGeoPath: string[];
    returnRiskHorizon: {
      expectedReturn: number;
      conformalInterval: [number, number];
      scaledCvarPerWeight: number;
      horizon: string;
    };
    costAndConcentration: {
      transactionCostRate: number | null;
      taxCostRate: number | null;
      currentWeight: number;
      targetWeight: number;
      cashTargetWeight: number;
      totalTransactionCostRate: number | null;
      maxPositionWeight: number;
      riskBudget: number;
      allocatedCashRecoveryWeight: number;
    };
    counterEvidenceAndUnknowns: { counterEvidence: string[]; unknowns: string[] };
    invalidationAndNextReview: {
      invalidationTriggers: string[];
      nextReviewConditions: string[];
    };
    expiresAt: string;
  };
  expiresAt: string;
  adviceProhibited: true;
  orderExecutable: false;
  legalReviewStatus: 'required';
  engineVersion: 'decision-runtime-v1';
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_TIMESTAMP_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
const PROBABILITY_TOLERANCE = 1e-9;
const WEIGHT_TOLERANCE = 1e-9;
const ACTIONS: readonly DecisionAction[] = [
  'ADD',
  'HOLD',
  'REDUCE',
  'EXIT',
  'WATCH',
  'NO_ACTION',
  'INSUFFICIENT_DATA',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBounded(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalize(value: number): number {
  const rounded = Number(value.toFixed(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeWeight(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasEnvelope(value: unknown): value is DecisionRuntimeInput {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.profile) &&
    isRecord(value.decisionPolicy) &&
    isRecord(value.decisionPolicy.thesisReturnAdjustments) &&
    isRecord(value.portfolio) &&
    isRecord(value.thesis) &&
    isRecord(value.commonView) &&
    isRecord(value.probabilityContext) &&
    isRecord(value.probabilityContext.conformal) &&
    isRecord(value.probabilityContext.riskScalingPolicy) &&
    isRecord(value.probabilityContext.methodEvidence) &&
    Array.isArray(value.probabilityContext.scenarios) &&
    isRecord(value.costs) &&
    isRecord(value.emergency) &&
    (value.previousDecision === null || isRecord(value.previousDecision)) &&
    isRecord(value.evidence)
  );
}

function emptyProbability() {
  return {
    scenarioProbabilityTotal: 0,
    scenarioExpectedReturn: 0,
    blendedExpectedReturn: 0,
    decisionExpectedReturn: 0,
    scenarioCvar: 0,
    scaledCvarPerWeight: 0,
    decisionCvarPerWeight: 0,
    scenarioVariance: 0,
    coverageShortfall: 0,
    riskScale: 0,
  };
}

function safeTimestamp(value: unknown): number {
  const parsed = parseTimestamp(value);
  return Number.isFinite(parsed) && parsed < MAX_TIMESTAMP_MS ? parsed : 0;
}

function buildFailClosedPacket(value: unknown, reason: string): DecisionRuntimePacket {
  const generatedAt = isRecord(value) ? safeTimestamp(value.generatedAt) : 0;
  const currentWeight =
    isRecord(value) && isRecord(value.portfolio) && isBounded(value.portfolio.currentWeight, 0, 1)
      ? value.portfolio.currentWeight
      : 0;
  const thesisState =
    isRecord(value) &&
    isRecord(value.thesis) &&
    ['improved', 'intact', 'weakened', 'broken', 'unknown'].includes(String(value.thesis.state))
      ? (value.thesis.state as ThesisState)
      : 'unknown';
  const expiresAt = new Date(Math.min(MAX_TIMESTAMP_MS, generatedAt + DAY_MS)).toISOString();
  return {
    action: 'INSUFFICIENT_DATA',
    reasonCodes: [],
    abstentionReason: reason,
    targetWeight: { low: currentWeight, high: currentWeight, maxTrade: 0 },
    thesisState,
    optimizer: {
      status: 'not_run',
      targetWeight: currentWeight,
      tradeWeight: 0,
      objectiveImprovement: 0,
      bindingConstraints: [],
    },
    dynamicProbability: emptyProbability(),
    explanation: {
      whatChanged: '검증 가능한 입력이 부족해 판단을 생성하지 않았습니다.',
      commonAssetView: {
        summary: '공통 종목 view를 안전하게 확정할 수 없습니다.',
        direction: 'neutral',
        asOf: new Date(generatedAt).toISOString(),
        supportingEvidence: [],
      },
      personalizedRationale: reason,
      eventAndGeoPath: [],
      returnRiskHorizon: {
        expectedReturn: 0,
        conformalInterval: [0, 0],
        scaledCvarPerWeight: 0,
        horizon: 'unknown',
      },
      costAndConcentration: {
        transactionCostRate: null,
        taxCostRate: null,
        currentWeight,
        targetWeight: currentWeight,
        cashTargetWeight: 0,
        totalTransactionCostRate: null,
        maxPositionWeight: 0,
        riskBudget: 0,
        allocatedCashRecoveryWeight: 0,
      },
      counterEvidenceAndUnknowns: { counterEvidence: [], unknowns: [reason] },
      invalidationAndNextReview: {
        invalidationTriggers: [],
        nextReviewConditions: ['입력 계약과 정보시점을 다시 검증'],
      },
      expiresAt,
    },
    expiresAt,
    adviceProhibited: true,
    orderExecutable: false,
    legalReviewStatus: 'required',
    engineVersion: 'decision-runtime-v1',
  };
}

function validateInput(input: DecisionRuntimeInput): string | null {
  const generatedAt = parseTimestamp(input.generatedAt);
  const commonAsOf = parseTimestamp(input.commonView.asOf);
  if (
    !Number.isFinite(generatedAt) ||
    !Number.isFinite(commonAsOf) ||
    generatedAt >= MAX_TIMESTAMP_MS ||
    commonAsOf > generatedAt ||
    typeof input.horizon !== 'string' ||
    input.horizon.length === 0 ||
    typeof input.confirmationContextKey !== 'string' ||
    input.confirmationContextKey.trim().length === 0
  ) {
    return 'INVALID_TIMESTAMP_OR_HORIZON';
  }

  const profileNumbers = [
    input.profile.maxPositionWeight,
    input.profile.noTradeBand,
    input.profile.minimumCoverage,
    input.profile.cashTargetWeight,
    input.profile.riskBudget,
    input.profile.riskAversion,
    input.profile.cvarPenalty,
    input.profile.turnoverPenalty,
    input.profile.actionEntryThresholdWeight,
    input.profile.actionReleaseThresholdWeight,
    input.profile.materialityUtilityThreshold,
    input.profile.cooldownMinutes,
    input.profile.requiredConfirmations,
    input.profile.emergencyValidityMinutes,
  ];
  const portfolioNumbers = [
    input.portfolio.currentWeight,
    input.portfolio.cashWeight,
    input.portfolio.marginalRiskPerWeight,
    input.portfolio.liquidityMaxTradeWeight,
    input.portfolio.maxTradeWeight,
    input.portfolio.allocatedCashRecoveryWeight,
  ];
  const decisionPolicyNumbers = [
    input.decisionPolicy.thesisReturnAdjustments.improved,
    input.decisionPolicy.thesisReturnAdjustments.intact,
    input.decisionPolicy.thesisReturnAdjustments.weakened,
    input.decisionPolicy.thesisReturnAdjustments.broken,
    input.decisionPolicy.thesisReturnAdjustments.unknown,
    input.decisionPolicy.eventReturnMultiplier,
    input.decisionPolicy.catalystExpiredReturnAdjustment,
    input.decisionPolicy.geoCvarMultiplier,
    input.decisionPolicy.valuationCvarMultiplier,
  ];
  if (
    profileNumbers.some((value) => !isFiniteNumber(value) || value < 0) ||
    portfolioNumbers.some((value) => !isFiniteNumber(value) || value < 0) ||
    decisionPolicyNumbers.some((value) => !isFiniteNumber(value)) ||
    input.decisionPolicy.eventReturnMultiplier < 0 ||
    input.decisionPolicy.catalystExpiredReturnAdjustment > 0 ||
    input.decisionPolicy.geoCvarMultiplier < 0 ||
    input.decisionPolicy.valuationCvarMultiplier < 0 ||
    !isBounded(input.profile.maxPositionWeight, 0, 1) ||
    !isBounded(input.profile.noTradeBand, 0, 1) ||
    !isBounded(input.profile.minimumCoverage, 0, 1) ||
    !isBounded(input.profile.cashTargetWeight, 0, 1) ||
    !isBounded(input.profile.riskBudget, 0, 1) ||
    !isBounded(input.profile.actionEntryThresholdWeight, 0, 1) ||
    !isBounded(input.profile.actionReleaseThresholdWeight, 0, 1) ||
    input.profile.actionReleaseThresholdWeight > input.profile.actionEntryThresholdWeight ||
    !Number.isInteger(input.profile.requiredConfirmations) ||
    input.profile.emergencyValidityMinutes <= 0 ||
    !isBounded(input.portfolio.currentWeight, 0, 1) ||
    !isBounded(input.portfolio.cashWeight, 0, 1) ||
    !isBounded(input.portfolio.liquidityMaxTradeWeight, 0, 1) ||
    !isBounded(input.portfolio.maxTradeWeight, 0, 1) ||
    !isBounded(input.portfolio.allocatedCashRecoveryWeight, 0, 1) ||
    input.portfolio.allocatedCashRecoveryWeight > input.portfolio.currentWeight ||
    input.portfolio.allocatedCashRecoveryWeight >
      Math.max(0, input.profile.cashTargetWeight - input.portfolio.cashWeight) ||
    typeof input.portfolio.hasPosition !== 'boolean' ||
    (!input.portfolio.hasPosition && input.portfolio.currentWeight !== 0) ||
    (input.portfolio.hasPosition && input.portfolio.currentWeight <= 0) ||
    (!input.portfolio.hasPosition && input.portfolio.allocatedCashRecoveryWeight !== 0)
  ) {
    return 'INVALID_PROFILE_OR_PORTFOLIO';
  }

  if (
    !['improved', 'intact', 'weakened', 'broken', 'unknown'].includes(input.thesis.state) ||
    typeof input.thesis.catalystExpired !== 'boolean' ||
    !['available', 'empty', 'missing', 'error'].includes(input.commonView.availability) ||
    !['sufficient', 'insufficient', 'missing'].includes(input.commonView.calibration) ||
    !['positive', 'neutral', 'negative', 'mixed'].includes(input.commonView.direction) ||
    typeof input.commonView.modelConflict !== 'boolean' ||
    typeof input.commonView.rumorOrProvisional !== 'boolean' ||
    typeof input.commonView.dataQualityDegraded !== 'boolean' ||
    typeof input.commonView.betterAlternative !== 'boolean' ||
    (input.commonView.betterAlternative &&
      (!isFiniteNumber(input.commonView.alternativeExpectedReturn) ||
        input.commonView.alternativeExpectedReturn < 0)) ||
    (!input.commonView.betterAlternative && input.commonView.alternativeExpectedReturn !== null) ||
    !isFiniteNumber(input.commonView.maxAgeMinutes) ||
    input.commonView.maxAgeMinutes <= 0 ||
    !isBounded(input.commonView.coverage, 0, 1) ||
    !isBounded(input.commonView.eventTransmission, -1, 1) ||
    !isBounded(input.commonView.geoConcentrationRisk, 0, 1) ||
    !isBounded(input.commonView.valuationRisk, 0, 1)
  ) {
    return 'INVALID_COMMON_VIEW';
  }

  const probability = input.probabilityContext;
  const methodEvidence = probability.methodEvidence;
  if (
    !isFiniteNumber(probability.equilibriumExpectedReturn) ||
    !isBounded(probability.evidenceConfidence, 0, 1) ||
    !isBounded(probability.changePointProbability, 0, 1) ||
    !isBounded(probability.adverseHazard, 0, 1) ||
    probability.scenarios.length === 0 ||
    !isBounded(probability.conformal.targetCoverage, 0, 1) ||
    !isBounded(probability.conformal.empiricalCoverage, 0, 1) ||
    !isFiniteNumber(probability.conformal.lowerReturn) ||
    !isFiniteNumber(probability.conformal.upperReturn) ||
    probability.conformal.lowerReturn > probability.conformal.upperReturn ||
    !isFiniteNumber(probability.riskScalingPolicy.changePointMultiplier) ||
    probability.riskScalingPolicy.changePointMultiplier < 0 ||
    !isFiniteNumber(probability.riskScalingPolicy.coverageShortfallMultiplier) ||
    probability.riskScalingPolicy.coverageShortfallMultiplier < 0 ||
    !isFiniteNumber(probability.riskScalingPolicy.adverseHazardMultiplier) ||
    probability.riskScalingPolicy.adverseHazardMultiplier < 0 ||
    methodEvidence.hierarchicalModel !== 'normal-normal-hierarchical-v1' ||
    !isFiniteNumber(methodEvidence.hierarchicalPosteriorMean) ||
    !isFiniteNumber(methodEvidence.hierarchicalPosteriorVariance) ||
    methodEvidence.hierarchicalPosteriorVariance <= 0 ||
    !Number.isInteger(methodEvidence.hierarchicalGroupCount) ||
    methodEvidence.hierarchicalGroupCount <= 0 ||
    methodEvidence.bocpdModel !== 'normal-known-variance-bocpd-v1' ||
    !Number.isInteger(methodEvidence.bocpdObservationCount) ||
    methodEvidence.bocpdObservationCount < 2 ||
    methodEvidence.scenarioModel !== 'conditional-probability-tree-v1' ||
    !Number.isInteger(methodEvidence.scenarioLeafCount) ||
    methodEvidence.scenarioLeafCount !== probability.scenarios.length ||
    methodEvidence.conformalModel !== 'recency-weighted-absolute-residual-v1' ||
    !Number.isInteger(methodEvidence.conformalSampleCount) ||
    methodEvidence.conformalSampleCount <= 0 ||
    methodEvidence.hazardModel !== 'proportional-hazard-v1' ||
    typeof methodEvidence.lifecycleStage !== 'string' ||
    methodEvidence.lifecycleStage.trim().length === 0 ||
    !isBounded(methodEvidence.resolutionHazard, 0, 1)
  ) {
    return 'INVALID_PROBABILITY_CONTEXT';
  }
  for (const scenario of probability.scenarios) {
    if (
      !isRecord(scenario) ||
      typeof scenario.id !== 'string' ||
      scenario.id.trim().length === 0 ||
      !isBounded(scenario.probability, 0, 1) ||
      !isFiniteNumber(scenario.expectedReturn) ||
      !isFiniteNumber(scenario.downsideCvar) ||
      scenario.downsideCvar < 0
    ) {
      return 'INVALID_PROBABILITY_CONTEXT';
    }
  }
  if (
    new Set(probability.scenarios.map((scenario) => scenario.id)).size !==
    probability.scenarios.length
  ) {
    return 'INVALID_PROBABILITY_CONTEXT';
  }
  const probabilityTotal = probability.scenarios.reduce(
    (total, scenario) => total + scenario.probability,
    0,
  );
  if (
    !Number.isFinite(probabilityTotal) ||
    Math.abs(probabilityTotal - 1) > PROBABILITY_TOLERANCE
  ) {
    return 'INVALID_PROBABILITY_CONTEXT';
  }

  if (
    typeof input.costs.complete !== 'boolean' ||
    !isFiniteNumber(input.costs.transactionCostRate) ||
    input.costs.transactionCostRate < 0 ||
    !isFiniteNumber(input.costs.taxCostRate) ||
    input.costs.taxCostRate < 0 ||
    typeof input.emergency.tradingHalt !== 'boolean' ||
    typeof input.emergency.bankruptcy !== 'boolean' ||
    typeof input.emergency.materialLegalEvent !== 'boolean' ||
    !['none', 'verified'].includes(input.emergency.sourceState) ||
    (input.emergency.verifiedAt !== null &&
      !Number.isFinite(parseTimestamp(input.emergency.verifiedAt)))
  ) {
    return 'INVALID_COST_OR_EMERGENCY';
  }

  if (input.previousDecision !== null) {
    const previousGeneratedAt = parseTimestamp(input.previousDecision.generatedAt);
    const confirmationIsUnbound =
      input.previousDecision.confirmationCount === 0 &&
      input.previousDecision.confirmationCandidateAction === null &&
      input.previousDecision.confirmationContextKey === null;
    const confirmationIsBound =
      input.previousDecision.confirmationCount > 0 &&
      ['ADD', 'REDUCE', 'EXIT'].includes(
        input.previousDecision.confirmationCandidateAction ?? '',
      ) &&
      typeof input.previousDecision.confirmationContextKey === 'string' &&
      input.previousDecision.confirmationContextKey.trim().length > 0;
    if (
      !ACTIONS.includes(input.previousDecision.action) ||
      !Number.isFinite(previousGeneratedAt) ||
      previousGeneratedAt > generatedAt ||
      !Number.isInteger(input.previousDecision.confirmationCount) ||
      input.previousDecision.confirmationCount < 0 ||
      (!confirmationIsUnbound && !confirmationIsBound)
    ) {
      return 'INVALID_PREVIOUS_DECISION';
    }
  }

  const evidence = input.evidence;
  if (
    !hasStringArray(evidence.supporting) ||
    !hasStringArray(evidence.counter) ||
    !hasStringArray(evidence.unknowns) ||
    !hasStringArray(evidence.eventAndGeoPaths) ||
    !hasStringArray(evidence.invalidationTriggers) ||
    !hasStringArray(evidence.nextReviewConditions) ||
    evidence.supporting.length + evidence.counter.length === 0 ||
    ((input.commonView.eventTransmission !== 0 || input.commonView.geoConcentrationRisk > 0) &&
      evidence.eventAndGeoPaths.length === 0)
  ) {
    return 'INVALID_EVIDENCE';
  }
  return null;
}

function deriveProbability(input: DecisionRuntimeInput) {
  const context = input.probabilityContext;
  const scenarioProbabilityTotal = context.scenarios.reduce(
    (total, scenario) => total + scenario.probability,
    0,
  );
  const scenarioExpectedReturn = context.scenarios.reduce(
    (total, scenario) => total + scenario.probability * scenario.expectedReturn,
    0,
  );
  const scenarioCvar = context.scenarios.reduce(
    (total, scenario) => total + scenario.probability * scenario.downsideCvar,
    0,
  );
  const scenarioVariance = context.scenarios.reduce(
    (total, scenario) =>
      total + scenario.probability * (scenario.expectedReturn - scenarioExpectedReturn) ** 2,
    0,
  );
  const coverageShortfall = Math.max(
    0,
    context.conformal.targetCoverage - context.conformal.empiricalCoverage,
  );
  const riskScale =
    1 +
    context.changePointProbability * context.riskScalingPolicy.changePointMultiplier +
    coverageShortfall * context.riskScalingPolicy.coverageShortfallMultiplier +
    context.adverseHazard * context.riskScalingPolicy.adverseHazardMultiplier;
  const blendedExpectedReturn =
    context.equilibriumExpectedReturn +
    context.evidenceConfidence * (scenarioExpectedReturn - context.equilibriumExpectedReturn);
  const scaledCvarPerWeight = scenarioCvar * riskScale;
  const thesisReturnAdjustment = input.decisionPolicy.thesisReturnAdjustments[input.thesis.state];
  const eventReturnAdjustment =
    input.commonView.eventTransmission * input.decisionPolicy.eventReturnMultiplier;
  const catalystReturnAdjustment = input.thesis.catalystExpired
    ? input.decisionPolicy.catalystExpiredReturnAdjustment
    : 0;
  const alternativeReturnHurdle = input.commonView.betterAlternative
    ? (input.commonView.alternativeExpectedReturn ?? 0)
    : 0;
  const decisionExpectedReturn =
    blendedExpectedReturn +
    thesisReturnAdjustment +
    eventReturnAdjustment +
    catalystReturnAdjustment -
    alternativeReturnHurdle;
  const decisionCvarPerWeight =
    scaledCvarPerWeight *
    (1 +
      input.commonView.geoConcentrationRisk * input.decisionPolicy.geoCvarMultiplier +
      input.commonView.valuationRisk * input.decisionPolicy.valuationCvarMultiplier);
  const values = [
    scenarioProbabilityTotal,
    scenarioExpectedReturn,
    scenarioCvar,
    scenarioVariance,
    coverageShortfall,
    riskScale,
    blendedExpectedReturn,
    scaledCvarPerWeight,
    decisionExpectedReturn,
    decisionCvarPerWeight,
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;
  return {
    scenarioProbabilityTotal: normalize(scenarioProbabilityTotal),
    scenarioExpectedReturn: normalize(scenarioExpectedReturn),
    blendedExpectedReturn: normalize(blendedExpectedReturn),
    decisionExpectedReturn: normalize(decisionExpectedReturn),
    scenarioCvar: normalize(scenarioCvar),
    scaledCvarPerWeight: normalize(scaledCvarPerWeight),
    decisionCvarPerWeight: normalize(decisionCvarPerWeight),
    scenarioVariance: normalize(scenarioVariance),
    coverageShortfall: normalize(coverageShortfall),
    riskScale: normalize(riskScale),
  };
}

function uniqueReasons(reasons: DecisionReasonCode[]): DecisionReasonCode[] {
  return reasons.filter((reason, index) => reasons.indexOf(reason) === index);
}

function buildPacket(
  input: DecisionRuntimeInput,
  action: DecisionAction,
  reasonCodes: DecisionReasonCode[],
  targetWeight: number,
  optimizer: DecisionRuntimePacket['optimizer'],
  dynamicProbability: DecisionRuntimePacket['dynamicProbability'],
  expiresAt: string,
  abstentionReason: string | null = null,
): DecisionRuntimePacket {
  const normalizedTarget = normalizeWeight(Math.max(0, Math.min(1, targetWeight)));
  const actionSummary =
    action === 'INSUFFICIENT_DATA'
      ? '검증 정보 부족으로 판단을 보류했습니다.'
      : `${input.previousDecision?.action ?? 'INITIAL'}에서 ${action} 후보로 변경됐습니다.`;
  return {
    action,
    reasonCodes: uniqueReasons(reasonCodes),
    abstentionReason,
    targetWeight: {
      low: normalizedTarget,
      high: normalizedTarget,
      maxTrade: input.portfolio.maxTradeWeight,
    },
    thesisState: input.thesis.state,
    optimizer,
    dynamicProbability,
    explanation: {
      whatChanged: actionSummary,
      commonAssetView: {
        summary: `${input.commonView.direction} 방향의 공통 view를 검증했습니다.`,
        direction: input.commonView.direction,
        asOf: input.commonView.asOf,
        supportingEvidence: [...input.evidence.supporting],
      },
      personalizedRationale: reasonCodes.join(', ') || abstentionReason || '추가 행동 근거 없음',
      eventAndGeoPath: [...input.evidence.eventAndGeoPaths],
      returnRiskHorizon: {
        expectedReturn: dynamicProbability.decisionExpectedReturn,
        conformalInterval: [
          input.probabilityContext.conformal.lowerReturn,
          input.probabilityContext.conformal.upperReturn,
        ],
        scaledCvarPerWeight: dynamicProbability.decisionCvarPerWeight,
        horizon: input.horizon,
      },
      costAndConcentration: {
        transactionCostRate: input.costs.complete ? input.costs.transactionCostRate : null,
        taxCostRate: input.costs.complete ? input.costs.taxCostRate : null,
        currentWeight: input.portfolio.currentWeight,
        targetWeight: normalizedTarget,
        cashTargetWeight: input.profile.cashTargetWeight,
        totalTransactionCostRate:
          input.costs.complete &&
          isFiniteNumber(input.costs.transactionCostRate) &&
          isFiniteNumber(input.costs.taxCostRate)
            ? input.costs.transactionCostRate + input.costs.taxCostRate
            : null,
        maxPositionWeight: input.profile.maxPositionWeight,
        riskBudget: input.profile.riskBudget,
        allocatedCashRecoveryWeight: input.portfolio.allocatedCashRecoveryWeight,
      },
      counterEvidenceAndUnknowns: {
        counterEvidence: [...input.evidence.counter],
        unknowns: [...input.evidence.unknowns],
      },
      invalidationAndNextReview: {
        invalidationTriggers: [...input.evidence.invalidationTriggers],
        nextReviewConditions: [...input.evidence.nextReviewConditions],
      },
      expiresAt,
    },
    expiresAt,
    adviceProhibited: true,
    orderExecutable: false,
    legalReviewStatus: 'required',
    engineVersion: 'decision-runtime-v1',
  };
}

function optimizerTrace(
  result: Extract<ConvexTargetOptimizerResult, { status: 'optimized' }>,
): DecisionRuntimePacket['optimizer'] {
  return {
    status: 'optimized',
    targetWeight: result.targetWeight,
    tradeWeight: result.tradeWeight,
    objectiveImprovement: result.objectiveImprovement,
    bindingConstraints: result.bindingConstraints,
  };
}

function actionDirection(action: DecisionAction): -1 | 0 | 1 {
  if (action === 'ADD') return 1;
  if (action === 'REDUCE' || action === 'EXIT') return -1;
  return 0;
}

function waitingForGuardrail(
  input: DecisionRuntimeInput,
  candidate: DecisionAction,
  generatedAt: number,
): boolean {
  if (actionDirection(candidate) === 0) return false;
  if (input.previousDecision === null) return input.profile.requiredConfirmations > 0;
  const previous = input.previousDecision;
  const previousGeneratedAt = parseTimestamp(previous.generatedAt);
  const ageMinutes = (generatedAt - previousGeneratedAt) / 60_000;
  const directionalFlip =
    actionDirection(previous.action) !== 0 &&
    actionDirection(previous.action) !== actionDirection(candidate);
  const cooldownActive = directionalFlip && ageMinutes < input.profile.cooldownMinutes;
  const confirmationMissing =
    previous.action !== candidate &&
    (previous.confirmationCandidateAction !== candidate ||
      previous.confirmationContextKey !== input.confirmationContextKey ||
      previous.confirmationCount < input.profile.requiredConfirmations);
  return cooldownActive || confirmationMissing;
}

export function compileDecisionRuntimePacket(input: unknown): DecisionRuntimePacket {
  if (!hasEnvelope(input)) return buildFailClosedPacket(input, 'INVALID_INPUT_SHAPE');
  const validationError = validateInput(input);
  if (validationError) return buildFailClosedPacket(input, validationError);

  const generatedAt = parseTimestamp(input.generatedAt);
  const commonAsOf = parseTimestamp(input.commonView.asOf);

  const emergencyActive =
    input.emergency.tradingHalt || input.emergency.bankruptcy || input.emergency.materialLegalEvent;
  if (
    !emergencyActive &&
    (input.emergency.sourceState !== 'none' || input.emergency.verifiedAt !== null)
  ) {
    return buildFailClosedPacket(input, 'INVALID_EMERGENCY_PROVENANCE');
  }
  if (emergencyActive) {
    if (input.emergency.sourceState !== 'verified' || input.emergency.verifiedAt === null) {
      return buildFailClosedPacket(input, 'INVALID_EMERGENCY_PROVENANCE');
    }
    const emergencyVerifiedAt = parseTimestamp(input.emergency.verifiedAt);
    if (!Number.isFinite(emergencyVerifiedAt) || emergencyVerifiedAt > generatedAt) {
      return buildFailClosedPacket(input, 'INVALID_EMERGENCY_PROVENANCE');
    }
    const emergencyExpiresAtMs = Math.min(
      MAX_TIMESTAMP_MS,
      emergencyVerifiedAt + input.profile.emergencyValidityMinutes * 60_000,
    );
    if (emergencyExpiresAtMs <= generatedAt) {
      return buildFailClosedPacket(input, 'STALE_EMERGENCY_SIGNAL');
    }
    const reason: DecisionReasonCode =
      input.emergency.bankruptcy || input.thesis.state === 'broken'
        ? 'THESIS_BROKEN'
        : 'NEGATIVE_EVENT_TRANSMISSION';
    const tradingBlocked = input.emergency.tradingHalt;
    const action: DecisionAction = tradingBlocked
      ? 'NO_ACTION'
      : input.portfolio.hasPosition
        ? 'EXIT'
        : 'NO_ACTION';
    const emergencyTargetWeight = tradingBlocked ? input.portfolio.currentWeight : 0;
    return buildPacket(
      input,
      action,
      [reason],
      emergencyTargetWeight,
      {
        status: 'not_run',
        targetWeight: emergencyTargetWeight,
        tradeWeight: 0,
        objectiveImprovement: 0,
        bindingConstraints: [],
      },
      deriveProbability(input) ?? emptyProbability(),
      new Date(emergencyExpiresAtMs).toISOString(),
    );
  }

  const dynamicProbability = deriveProbability(input);
  if (!dynamicProbability) return buildFailClosedPacket(input, 'INVALID_PROBABILITY_CONTEXT');

  const freshnessDeadline = commonAsOf + input.commonView.maxAgeMinutes * 60_000;
  const expiresAtMs = Math.min(generatedAt + DAY_MS, freshnessDeadline, MAX_TIMESTAMP_MS);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= generatedAt) {
    return buildFailClosedPacket(input, 'STALE_OR_INVALID_EXPIRY');
  }
  const expiresAt = new Date(expiresAtMs).toISOString();

  const evidenceUnavailable =
    input.commonView.availability !== 'available' ||
    input.commonView.coverage < input.profile.minimumCoverage ||
    input.commonView.calibration !== 'sufficient' ||
    input.commonView.modelConflict ||
    input.commonView.rumorOrProvisional ||
    input.commonView.dataQualityDegraded ||
    input.thesis.state === 'unknown' ||
    generatedAt >= freshnessDeadline ||
    !input.costs.complete;
  if (evidenceUnavailable) {
    const reason = input.commonView.dataQualityDegraded
      ? 'DATA_QUALITY_DEGRADED'
      : input.commonView.rumorOrProvisional
        ? 'RUMOR_OR_PROVISIONAL'
        : input.thesis.state === 'unknown'
          ? 'UNKNOWN_THESIS_STATE'
          : generatedAt >= freshnessDeadline
            ? 'STALE_COMMON_VIEW'
            : 'INSUFFICIENT_OR_CONFLICTING_EVIDENCE';
    return buildPacket(
      input,
      'INSUFFICIENT_DATA',
      [],
      input.portfolio.currentWeight,
      {
        status: 'not_run',
        targetWeight: input.portfolio.currentWeight,
        tradeWeight: 0,
        objectiveImprovement: 0,
        bindingConstraints: [],
      },
      dynamicProbability,
      expiresAt,
      reason,
    );
  }

  if (input.thesis.state === 'broken') {
    if (!input.portfolio.hasPosition) {
      return buildPacket(
        input,
        'NO_ACTION',
        ['THESIS_BROKEN'],
        0,
        {
          status: 'not_run',
          targetWeight: 0,
          tradeWeight: 0,
          objectiveImprovement: 0,
          bindingConstraints: [],
        },
        dynamicProbability,
        expiresAt,
      );
    }
    if (waitingForGuardrail(input, 'EXIT', generatedAt)) {
      return buildPacket(
        input,
        'HOLD',
        ['WAIT_FOR_CONFIRMATION'],
        input.portfolio.currentWeight,
        {
          status: 'not_run',
          targetWeight: input.portfolio.currentWeight,
          tradeWeight: 0,
          objectiveImprovement: 0,
          bindingConstraints: [],
        },
        dynamicProbability,
        expiresAt,
      );
    }
    return buildPacket(
      input,
      'EXIT',
      ['THESIS_BROKEN'],
      0,
      {
        status: 'not_run',
        targetWeight: 0,
        tradeWeight: 0,
        objectiveImprovement: 0,
        bindingConstraints: [],
      },
      dynamicProbability,
      expiresAt,
    );
  }

  const riskBound =
    input.portfolio.marginalRiskPerWeight > 0
      ? Math.min(1, input.profile.riskBudget / input.portfolio.marginalRiskPerWeight)
      : 1;
  const cashDeficit = Math.max(0, input.profile.cashTargetWeight - input.portfolio.cashWeight);
  const concentrationBreach =
    input.portfolio.currentWeight > input.profile.maxPositionWeight + WEIGHT_TOLERANCE;
  const riskBudgetBreach =
    input.portfolio.currentWeight * input.portfolio.marginalRiskPerWeight >
    input.profile.riskBudget + WEIGHT_TOLERANCE;
  const cashRecoveryRequested =
    input.portfolio.allocatedCashRecoveryWeight > WEIGHT_TOLERANCE &&
    cashDeficit > WEIGHT_TOLERANCE;
  const feasibleCashReduction = Math.min(
    input.portfolio.allocatedCashRecoveryWeight,
    cashDeficit,
    input.portfolio.currentWeight,
    input.portfolio.maxTradeWeight,
    input.portfolio.liquidityMaxTradeWeight,
  );
  const cashRestoreUpper = Math.max(0, input.portfolio.currentWeight - feasibleCashReduction);
  const policyMaxPositionWeight = Math.min(
    input.profile.maxPositionWeight,
    riskBound,
    feasibleCashReduction > 0 ? cashRestoreUpper : 1,
  );
  const maximumFeasibleReduction = Math.min(
    input.portfolio.currentWeight,
    input.portfolio.maxTradeWeight,
    input.portfolio.liquidityMaxTradeWeight,
  );
  if (
    (concentrationBreach || riskBudgetBreach || cashRecoveryRequested) &&
    maximumFeasibleReduction <= WEIGHT_TOLERANCE
  ) {
    const reasons: DecisionReasonCode[] = [];
    if (concentrationBreach) reasons.push('PORTFOLIO_CONCENTRATION');
    if (riskBudgetBreach) reasons.push('RISK_BUDGET_BREACH');
    if (cashRecoveryRequested) reasons.push('LIQUIDITY_NEED');
    return buildPacket(
      input,
      'INSUFFICIENT_DATA',
      reasons,
      input.portfolio.currentWeight,
      {
        status: 'not_run',
        targetWeight: input.portfolio.currentWeight,
        tradeWeight: 0,
        objectiveImprovement: 0,
        bindingConstraints: [],
      },
      dynamicProbability,
      expiresAt,
      'HARD_CONSTRAINT_REDUCTION_INFEASIBLE',
    );
  }
  const stagedReductionFloor = input.portfolio.currentWeight - maximumFeasibleReduction;
  const maxPositionWeight =
    policyMaxPositionWeight < input.portfolio.currentWeight
      ? Math.max(policyMaxPositionWeight, stagedReductionFloor)
      : policyMaxPositionWeight;
  const spendableCashWeight = Math.max(
    0,
    input.portfolio.cashWeight - input.profile.cashTargetWeight,
  );
  const totalTransactionCost = input.costs.transactionCostRate + input.costs.taxCostRate;
  if (!Number.isFinite(totalTransactionCost)) {
    return buildFailClosedPacket(input, 'INVALID_COST_ARITHMETIC');
  }

  const optimizerInput = {
    currentWeight: input.portfolio.currentWeight,
    expectedReturn: dynamicProbability.decisionExpectedReturn,
    variance: dynamicProbability.scenarioVariance,
    cvarPerWeight: dynamicProbability.decisionCvarPerWeight,
    cvarBudget: input.profile.riskBudget,
    riskAversion: input.profile.riskAversion,
    cvarPenalty: input.profile.cvarPenalty,
    transactionCostRate: totalTransactionCost,
    turnoverPenalty: input.profile.turnoverPenalty,
    minWeight: 0,
    maxWeight: maxPositionWeight,
    maxTradeWeight: input.portfolio.maxTradeWeight,
    cashAvailableWeight: spendableCashWeight,
    liquidityMaxTradeWeight: input.portfolio.liquidityMaxTradeWeight,
  };
  const optimized = optimizeTargetWeight(optimizerInput);
  if (optimized.status === 'abstained') {
    return buildPacket(
      input,
      'INSUFFICIENT_DATA',
      [],
      input.portfolio.currentWeight,
      {
        status: 'not_run',
        targetWeight: input.portfolio.currentWeight,
        tradeWeight: 0,
        objectiveImprovement: 0,
        bindingConstraints: [],
      },
      dynamicProbability,
      expiresAt,
      optimized.reason,
    );
  }

  const trace = optimizerTrace(optimized);
  const costCounterfactual =
    totalTransactionCost > 0
      ? optimizeTargetWeight({ ...optimizerInput, transactionCostRate: 0 })
      : optimized;
  if (costCounterfactual.status === 'abstained') {
    return buildPacket(
      input,
      'INSUFFICIENT_DATA',
      [],
      input.portfolio.currentWeight,
      {
        status: 'not_run',
        targetWeight: input.portfolio.currentWeight,
        tradeWeight: 0,
        objectiveImprovement: 0,
        bindingConstraints: [],
      },
      dynamicProbability,
      expiresAt,
      'INVALID_COST_COUNTERFACTUAL',
    );
  }
  const counterfactualThreshold = Math.max(
    input.profile.noTradeBand,
    input.profile.actionEntryThresholdWeight,
  );
  const costBlocked =
    totalTransactionCost > 0 &&
    Math.abs(costCounterfactual.tradeWeight) >= counterfactualThreshold &&
    costCounterfactual.objectiveImprovement >= input.profile.materialityUtilityThreshold &&
    (Math.abs(optimized.tradeWeight) < counterfactualThreshold ||
      optimized.objectiveImprovement < input.profile.materialityUtilityThreshold);
  if (costBlocked) {
    return buildPacket(
      input,
      'INSUFFICIENT_DATA',
      ['COST_OF_TRADING_EXCEEDS_BENEFIT'],
      input.portfolio.currentWeight,
      {
        ...trace,
        targetWeight: input.portfolio.currentWeight,
        tradeWeight: 0,
      },
      dynamicProbability,
      expiresAt,
      'COST_OF_TRADING_EXCEEDS_BENEFIT',
    );
  }
  const mandatoryReduce =
    concentrationBreach || riskBudgetBreach || feasibleCashReduction > WEIGHT_TOLERANCE;
  const hasReduceSignal =
    input.thesis.state === 'weakened' ||
    input.commonView.eventTransmission < 0 ||
    input.commonView.geoConcentrationRisk > 0 ||
    input.commonView.valuationRisk > 0 ||
    input.thesis.catalystExpired ||
    input.commonView.betterAlternative;
  const rawCandidate: DecisionAction = mandatoryReduce
    ? 'REDUCE'
    : optimized.tradeWeight > 0
      ? 'ADD'
      : optimized.tradeWeight < 0 && hasReduceSignal
        ? 'REDUCE'
        : input.portfolio.hasPosition
          ? 'HOLD'
          : 'WATCH';
  const threshold = Math.max(
    input.profile.noTradeBand,
    input.previousDecision?.action === rawCandidate
      ? input.profile.actionReleaseThresholdWeight
      : input.profile.actionEntryThresholdWeight,
  );
  const immaterial =
    !mandatoryReduce &&
    (Math.abs(optimized.tradeWeight) < threshold ||
      optimized.objectiveImprovement < input.profile.materialityUtilityThreshold);
  let action: DecisionAction = immaterial
    ? input.portfolio.hasPosition
      ? 'HOLD'
      : 'WATCH'
    : rawCandidate;
  let reasons: DecisionReasonCode[] = [];

  if (mandatoryReduce) {
    if (input.portfolio.currentWeight > input.profile.maxPositionWeight) {
      reasons.push('PORTFOLIO_CONCENTRATION');
    }
    if (
      input.portfolio.currentWeight * input.portfolio.marginalRiskPerWeight >
      input.profile.riskBudget
    ) {
      reasons.push('RISK_BUDGET_BREACH');
    }
    if (feasibleCashReduction > 0) reasons.push('LIQUIDITY_NEED');
  }
  if (action === 'ADD') {
    reasons.push('UNDER_TARGET_WEIGHT');
    if (
      input.probabilityContext.conformal.upperReturn >
      Math.abs(input.probabilityContext.conformal.lowerReturn)
    ) {
      reasons.push('POSITIVE_SCENARIO_ASYMMETRY');
    }
    if (input.commonView.eventTransmission > 0) reasons.push('POSITIVE_EVENT_TRANSMISSION');
    if (input.commonView.marginOfSafety === true) reasons.push('MARGIN_OF_SAFETY');
    if (input.commonView.diversificationBenefit === true) reasons.push('DIVERSIFICATION_BENEFIT');
  }
  if (action === 'REDUCE') {
    if (input.thesis.state === 'weakened') reasons.push('THESIS_WEAKENED');
    if (input.commonView.eventTransmission < 0) reasons.push('NEGATIVE_EVENT_TRANSMISSION');
    if (input.commonView.geoConcentrationRisk > 0) reasons.push('GEO_CONCENTRATION_RISK');
    if (input.commonView.valuationRisk > 0) reasons.push('VALUATION_RISK');
    if (input.thesis.catalystExpired) reasons.push('CATALYST_EXPIRED');
    if (input.commonView.betterAlternative) reasons.push('BETTER_RISK_ADJUSTED_ALTERNATIVE');
  }
  if (action === 'HOLD' || action === 'WATCH') {
    if (hasReduceSignal && optimized.tradeWeight < 0) {
      reasons.push('WAIT_FOR_CONFIRMATION');
    } else {
      reasons.push('THESIS_INTACT');
    }
  }

  if (!mandatoryReduce && waitingForGuardrail(input, action, generatedAt)) {
    action = input.portfolio.hasPosition ? 'HOLD' : 'WATCH';
    reasons = ['WAIT_FOR_CONFIRMATION'];
    return buildPacket(
      input,
      action,
      reasons,
      input.portfolio.currentWeight,
      {
        ...trace,
        targetWeight: input.portfolio.currentWeight,
        tradeWeight: 0,
      },
      dynamicProbability,
      expiresAt,
    );
  }

  return buildPacket(
    input,
    action,
    reasons,
    action === 'HOLD' || action === 'WATCH'
      ? input.portfolio.currentWeight
      : optimized.targetWeight,
    action === 'HOLD' || action === 'WATCH'
      ? { ...trace, targetWeight: input.portfolio.currentWeight, tradeWeight: 0 }
      : trace,
    dynamicProbability,
    expiresAt,
  );
}
