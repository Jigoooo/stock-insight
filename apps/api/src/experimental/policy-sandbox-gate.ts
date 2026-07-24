export type PolicySandboxFailedGate =
  | 'SAMPLE_SIZE'
  | 'EFFECTIVE_SAMPLE_SIZE'
  | 'SUPPORT_COVERAGE'
  | 'IMPORTANCE_WEIGHT'
  | 'DOUBLY_ROBUST_LIFT'
  | 'FQE_LIFT'
  | 'DECISION_REGRET'
  | 'DISTRIBUTION_SHIFT';

export type PolicySandboxResult =
  | Readonly<{
      status: 'ok';
      policyKind: 'decision_focused' | 'offline_rl';
      actionDomain: 'content_ranking' | 'research_priority';
      sandboxAdvanceAllowed: boolean;
      failedGates: readonly PolicySandboxFailedGate[];
      nextMode: 'offline' | 'shadow';
      productionAllowed: false;
      policyExecutionAllowed: false;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_POLICY_SANDBOX_INPUT';
      productionAllowed: false;
      policyExecutionAllowed: false;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: PolicySandboxResult = {
  status: 'abstained',
  reason: 'INVALID_POLICY_SANDBOX_INPUT',
  productionAllowed: false,
  policyExecutionAllowed: false,
  candidateOnly: true,
  acceptedFactAllowed: false,
  orderExecutable: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function probability(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function parseUtcTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  try {
    return new Date(parsed).toISOString() === value ? parsed : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

export function evaluatePolicySandbox(input: unknown): PolicySandboxResult {
  try {
    const record = asRecord(input);
    const metrics = asRecord(record?.metrics);
    const policy = asRecord(record?.policy);
    const dataCutoff = parseUtcTimestamp(record?.dataCutoff);
    const trainedCutoff = parseUtcTimestamp(record?.trainedCutoff);
    if (
      record === null ||
      !['decision_focused', 'offline_rl'].includes(record.policyKind as string) ||
      !['content_ranking', 'research_priority'].includes(record.actionDomain as string) ||
      !Number.isFinite(dataCutoff) ||
      !Number.isFinite(trainedCutoff) ||
      trainedCutoff > dataCutoff ||
      !digest(record.behaviorPolicyDigest) ||
      !digest(record.candidatePolicyDigest) ||
      !digest(record.featureSnapshotDigest) ||
      metrics === null ||
      !positiveInteger(metrics.sampleSize) ||
      !finite(metrics.effectiveSampleSize) ||
      metrics.effectiveSampleSize <= 0 ||
      metrics.effectiveSampleSize > (metrics.sampleSize as number) ||
      !probability(metrics.supportCoverage) ||
      !finite(metrics.maximumImportanceWeight) ||
      metrics.maximumImportanceWeight < 0 ||
      !finite(metrics.doublyRobustLiftLower95) ||
      !finite(metrics.fqeLiftLower95) ||
      !finite(metrics.decisionRegretDelta) ||
      !finite(metrics.distributionShiftIndex) ||
      metrics.distributionShiftIndex < 0 ||
      metrics.safetyConstraintViolations !== 0 ||
      policy === null ||
      !positiveInteger(policy.minimumSampleSize) ||
      policy.minimumSampleSize < 30 ||
      !finite(policy.minimumEffectiveSampleSize) ||
      policy.minimumEffectiveSampleSize <= 0 ||
      policy.minimumEffectiveSampleSize > (policy.minimumSampleSize as number) ||
      !probability(policy.minimumSupportCoverage) ||
      !finite(policy.maximumImportanceWeight) ||
      policy.maximumImportanceWeight <= 0 ||
      !finite(policy.minimumDoublyRobustLiftLower95) ||
      !finite(policy.minimumFqeLiftLower95) ||
      !finite(policy.maximumDecisionRegretDelta) ||
      !finite(policy.maximumDistributionShiftIndex) ||
      policy.maximumDistributionShiftIndex < 0
    ) {
      return abstained;
    }

    const failedGates: PolicySandboxFailedGate[] = [];
    if (metrics.sampleSize < policy.minimumSampleSize) failedGates.push('SAMPLE_SIZE');
    if (metrics.effectiveSampleSize < policy.minimumEffectiveSampleSize) {
      failedGates.push('EFFECTIVE_SAMPLE_SIZE');
    }
    if (metrics.supportCoverage < policy.minimumSupportCoverage) {
      failedGates.push('SUPPORT_COVERAGE');
    }
    if (metrics.maximumImportanceWeight > policy.maximumImportanceWeight) {
      failedGates.push('IMPORTANCE_WEIGHT');
    }
    if (metrics.doublyRobustLiftLower95 < policy.minimumDoublyRobustLiftLower95) {
      failedGates.push('DOUBLY_ROBUST_LIFT');
    }
    if (metrics.fqeLiftLower95 < policy.minimumFqeLiftLower95) failedGates.push('FQE_LIFT');
    if (metrics.decisionRegretDelta > policy.maximumDecisionRegretDelta) {
      failedGates.push('DECISION_REGRET');
    }
    if (metrics.distributionShiftIndex > policy.maximumDistributionShiftIndex) {
      failedGates.push('DISTRIBUTION_SHIFT');
    }

    const sandboxAdvanceAllowed = failedGates.length === 0;
    return {
      status: 'ok',
      policyKind: record.policyKind as 'decision_focused' | 'offline_rl',
      actionDomain: record.actionDomain as 'content_ranking' | 'research_priority',
      sandboxAdvanceAllowed,
      failedGates,
      nextMode: sandboxAdvanceAllowed ? 'shadow' : 'offline',
      productionAllowed: false,
      policyExecutionAllowed: false,
      candidateOnly: true,
      acceptedFactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
