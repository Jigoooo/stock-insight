import {
  personalizationEvaluationGateSchema,
  type PersonalizationEvaluationGate,
} from '@stock-insight/contracts/personalization';

export type PersonalizationEvaluationPolicy = Readonly<{
  maximumDownsideCvar: number;
  minimumShadowSampleSize: number;
  maximumShadowDisagreementRate: number;
  maximumShadowCalibrationError: number;
  minimumShadowCoverage: number;
  maximumShadowAbstentionRate: number;
  maximumLimitedActionWeightCap: number;
}>;

export type PersonalizationEvaluationMetrics = Readonly<{
  offline: Readonly<{
    pointInTimeValidated: boolean;
    costsIncluded: boolean;
    netUtility: number;
    holdBaselineNetUtility: number;
    downsideCvar: number;
  }>;
  shadow: Readonly<{
    sampleSize: number;
    disagreementRate: number;
    calibrationError: number;
    coverage: number;
    abstentionRate: number;
    privateIsolationPassed: boolean;
    reproducibilityPassed: boolean;
  }>;
  limited: Readonly<{
    actionWeightCap: number;
    highRiskBlocked: boolean;
    lowLiquidityBlocked: boolean;
    confirmationRequired: boolean;
  }>;
}>;

export type EvaluatePersonalizationReleaseGateInput = Readonly<{
  evaluationId: string;
  stage: 'offline' | 'shadow' | 'limited';
  evaluatedAt: string;
  metrics: PersonalizationEvaluationMetrics;
  policy: PersonalizationEvaluationPolicy;
}>;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function probability(value: number): boolean {
  return finite(value) && value >= 0 && value <= 1;
}

function validatePolicy(policy: PersonalizationEvaluationPolicy): void {
  if (
    !probability(policy.maximumDownsideCvar) ||
    !Number.isSafeInteger(policy.minimumShadowSampleSize) ||
    policy.minimumShadowSampleSize < 1 ||
    !probability(policy.maximumShadowDisagreementRate) ||
    !probability(policy.maximumShadowCalibrationError) ||
    !probability(policy.minimumShadowCoverage) ||
    !probability(policy.maximumShadowAbstentionRate) ||
    !probability(policy.maximumLimitedActionWeightCap)
  ) {
    throw new Error('Personalization evaluation policy is invalid');
  }
}

function validateMetrics(metrics: PersonalizationEvaluationMetrics): void {
  if (
    !finite(metrics.offline.netUtility) ||
    !finite(metrics.offline.holdBaselineNetUtility) ||
    !probability(metrics.offline.downsideCvar) ||
    !Number.isSafeInteger(metrics.shadow.sampleSize) ||
    metrics.shadow.sampleSize < 0 ||
    !probability(metrics.shadow.disagreementRate) ||
    !probability(metrics.shadow.calibrationError) ||
    !probability(metrics.shadow.coverage) ||
    !probability(metrics.shadow.abstentionRate) ||
    !probability(metrics.limited.actionWeightCap)
  ) {
    throw new Error('Personalization evaluation metrics are invalid');
  }
}

export function evaluatePersonalizationReleaseGate(
  input: EvaluatePersonalizationReleaseGateInput,
): PersonalizationEvaluationGate {
  validatePolicy(input.policy);
  validateMetrics(input.metrics);
  const evaluatedAt = new Date(input.evaluatedAt);
  if (!Number.isFinite(evaluatedAt.getTime())) {
    throw new Error('Personalization evaluation timestamp is invalid');
  }

  const blockers: string[] = [];
  const offline = input.metrics.offline;
  const holdBaselineOutperformed = offline.netUtility > offline.holdBaselineNetUtility;
  if (!offline.pointInTimeValidated) blockers.push('OFFLINE_POINT_IN_TIME_VALIDATION_FAILED');
  if (!offline.costsIncluded) blockers.push('OFFLINE_COSTS_NOT_INCLUDED');
  if (!holdBaselineOutperformed) blockers.push('OFFLINE_HOLD_BASELINE_NOT_OUTPERFORMED');
  if (offline.downsideCvar > input.policy.maximumDownsideCvar) {
    blockers.push('OFFLINE_DOWNSIDE_CVAR_EXCEEDED');
  }

  if (input.stage !== 'offline') {
    const shadow = input.metrics.shadow;
    if (shadow.sampleSize < input.policy.minimumShadowSampleSize) {
      blockers.push('SHADOW_SAMPLE_SIZE_INSUFFICIENT');
    }
    if (shadow.disagreementRate > input.policy.maximumShadowDisagreementRate) {
      blockers.push('SHADOW_DISAGREEMENT_RATE_EXCEEDED');
    }
    if (shadow.calibrationError > input.policy.maximumShadowCalibrationError) {
      blockers.push('SHADOW_CALIBRATION_ERROR_EXCEEDED');
    }
    if (shadow.coverage < input.policy.minimumShadowCoverage) {
      blockers.push('SHADOW_COVERAGE_INSUFFICIENT');
    }
    if (shadow.abstentionRate > input.policy.maximumShadowAbstentionRate) {
      blockers.push('SHADOW_ABSTENTION_RATE_EXCEEDED');
    }
    if (!shadow.privateIsolationPassed) blockers.push('SHADOW_PRIVATE_ISOLATION_FAILED');
    if (!shadow.reproducibilityPassed) blockers.push('SHADOW_REPRODUCIBILITY_FAILED');
  }

  if (input.stage === 'limited') {
    const limited = input.metrics.limited;
    if (limited.actionWeightCap > input.policy.maximumLimitedActionWeightCap) {
      blockers.push('LIMITED_ACTION_WEIGHT_CAP_EXCEEDED');
    }
    if (!limited.highRiskBlocked) blockers.push('LIMITED_HIGH_RISK_NOT_BLOCKED');
    if (!limited.lowLiquidityBlocked) blockers.push('LIMITED_LOW_LIQUIDITY_NOT_BLOCKED');
    if (!limited.confirmationRequired) blockers.push('LIMITED_CONFIRMATION_NOT_REQUIRED');
  }

  return personalizationEvaluationGateSchema.parse({
    schemaVersion: 'p4.v1',
    stage: input.stage,
    evaluatedAt: evaluatedAt.toISOString(),
    offline: {
      pitWalkForwardPassed: offline.pointInTimeValidated,
      costsIncluded: offline.costsIncluded,
      holdBaselineOutperformed,
      netUtility: offline.netUtility,
      downside: offline.downsideCvar,
    },
    shadow: {
      sampleCount: input.metrics.shadow.sampleSize,
      disagreementRate: input.metrics.shadow.disagreementRate,
      calibrationError: input.metrics.shadow.calibrationError,
      coverage: input.metrics.shadow.coverage,
      abstentionRate: input.metrics.shadow.abstentionRate,
      privateIsolationPassed: input.metrics.shadow.privateIsolationPassed,
      reproducibilityPassed: input.metrics.shadow.reproducibilityPassed,
    },
    limited: {
      actionWeightCap: input.metrics.limited.actionWeightCap,
      highRiskBlocked: input.metrics.limited.highRiskBlocked,
      lowLiquidityBlocked: input.metrics.limited.lowLiquidityBlocked,
      confirmationRequired: input.metrics.limited.confirmationRequired,
      orderExecutable: false,
    },
    promoted: blockers.length === 0,
    blockers,
  });
}
