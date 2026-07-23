export type BanditOpeResult =
  | Readonly<{
      status: 'ok';
      domain: 'content_ranking';
      target: Readonly<{ ips: number; snips: number; doublyRobust: number }>;
      baseline: Readonly<{ ips: number; snips: number; doublyRobust: number }>;
      lift: Readonly<{ estimate: number; lower95: number; upper95: number }>;
      effectiveSampleSize: number;
      eventCount: number;
      promotionAllowed: boolean;
      explorationAllowed: false;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_BANDIT_OPE_INPUT';
      domain: 'content_ranking';
      explorationAllowed: false;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: BanditOpeResult = {
  status: 'abstained',
  reason: 'INVALID_BANDIT_OPE_INPUT',
  domain: 'content_ranking',
  explorationAllowed: false,
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

function probabilityMap(value: unknown): Record<string, number> | null {
  const record = asRecord(value);
  if (record === null || Object.keys(record).length < 2) return null;
  const output: Record<string, number> = {};
  let sum = 0;
  for (const [key, entry] of Object.entries(record)) {
    if (key.trim().length === 0 || !finite(entry) || entry < 0 || entry > 1) return null;
    output[key] = entry;
    sum += entry;
  }
  return Math.abs(sum - 1) <= 1e-9 ? output : null;
}

function rewardMap(value: unknown, actions: readonly string[]): Record<string, number> | null {
  const record = asRecord(value);
  if (record === null || Object.keys(record).length !== actions.length) return null;
  const output: Record<string, number> = {};
  for (const action of actions) {
    const reward = record[action];
    if (!finite(reward) || reward < 0 || reward > 1) return null;
    output[action] = reward;
  }
  return output;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateContentRankingPolicy(input: unknown): BanditOpeResult {
  try {
    const record = asRecord(input);
    const policy = asRecord(record?.policy);
    if (
      record === null ||
      record.domain !== 'content_ranking' ||
      policy === null ||
      !Number.isSafeInteger(policy.minimumEvents) ||
      (policy.minimumEvents as number) < 30 ||
      !finite(policy.minimumEffectiveSampleSize) ||
      policy.minimumEffectiveSampleSize <= 0 ||
      policy.minimumEffectiveSampleSize > (policy.minimumEvents as number) ||
      !finite(policy.minimumPropensity) ||
      policy.minimumPropensity <= 0 ||
      policy.minimumPropensity > 1 ||
      !finite(policy.maximumImportanceWeight) ||
      policy.maximumImportanceWeight < 1 ||
      !finite(policy.minimumLiftLowerBound) ||
      !Array.isArray(record.events) ||
      record.events.length < (policy.minimumEvents as number) ||
      record.events.length > 1_000_000
    ) {
      return abstained;
    }

    const eventKeys = new Set<string>();
    const loggedSupport = new Set<string>();
    const requiredSupport = new Set<string>();
    const targetIpsScores: number[] = [];
    const baselineIpsScores: number[] = [];
    const targetDrScores: number[] = [];
    const baselineDrScores: number[] = [];
    const targetWeights: number[] = [];
    const baselineWeights: number[] = [];

    for (const value of record.events) {
      const event = asRecord(value);
      if (
        event === null ||
        typeof event.eventKey !== 'string' ||
        event.eventKey.trim().length === 0 ||
        eventKeys.has(event.eventKey) ||
        typeof event.loggedAction !== 'string' ||
        event.loggedAction.trim().length === 0 ||
        !finite(event.loggingPropensity) ||
        event.loggingPropensity < policy.minimumPropensity ||
        event.loggingPropensity > 1 ||
        !finite(event.reward) ||
        event.reward < 0 ||
        event.reward > 1
      ) {
        return abstained;
      }
      eventKeys.add(event.eventKey);
      loggedSupport.add(event.loggedAction);
      const target = probabilityMap(event.targetPolicyProbabilities);
      const baseline = probabilityMap(event.baselinePolicyProbabilities);
      if (target === null || baseline === null) return abstained;
      const actions = Object.keys(target).sort();
      if (
        actions.length !== Object.keys(baseline).length ||
        actions.some((action) => !(action in baseline)) ||
        !(event.loggedAction in target)
      ) {
        return abstained;
      }
      const rewardModel = rewardMap(event.rewardModel, actions);
      if (rewardModel === null) return abstained;
      for (const action of actions) {
        if ((target[action] ?? 0) > 0 || (baseline[action] ?? 0) > 0) requiredSupport.add(action);
      }

      const targetWeight = (target[event.loggedAction] ?? 0) / event.loggingPropensity;
      const baselineWeight = (baseline[event.loggedAction] ?? 0) / event.loggingPropensity;
      if (
        !finite(targetWeight) ||
        !finite(baselineWeight) ||
        targetWeight > policy.maximumImportanceWeight ||
        baselineWeight > policy.maximumImportanceWeight
      ) {
        return abstained;
      }
      const targetModelValue = actions.reduce(
        (sum, action) => sum + (target[action] ?? 0) * (rewardModel[action] ?? 0),
        0,
      );
      const baselineModelValue = actions.reduce(
        (sum, action) => sum + (baseline[action] ?? 0) * (rewardModel[action] ?? 0),
        0,
      );
      const loggedModelReward = rewardModel[event.loggedAction] ?? 0;
      const targetDr = targetModelValue + targetWeight * (event.reward - loggedModelReward);
      const baselineDr = baselineModelValue + baselineWeight * (event.reward - loggedModelReward);
      if (![targetModelValue, baselineModelValue, targetDr, baselineDr].every(finite))
        return abstained;
      targetWeights.push(targetWeight);
      baselineWeights.push(baselineWeight);
      targetIpsScores.push(targetWeight * event.reward);
      baselineIpsScores.push(baselineWeight * event.reward);
      targetDrScores.push(targetDr);
      baselineDrScores.push(baselineDr);
    }

    if ([...requiredSupport].some((action) => !loggedSupport.has(action))) return abstained;
    const targetWeightSum = targetWeights.reduce((sum, value) => sum + value, 0);
    const baselineWeightSum = baselineWeights.reduce((sum, value) => sum + value, 0);
    if (targetWeightSum <= 0 || baselineWeightSum <= 0) return abstained;
    const ess = (weights: readonly number[], total: number) =>
      (total * total) / weights.reduce((sum, value) => sum + value * value, 0);
    const effectiveSampleSize = Math.min(
      ess(targetWeights, targetWeightSum),
      ess(baselineWeights, baselineWeightSum),
    );
    if (!finite(effectiveSampleSize)) return abstained;

    const targetDr = mean(targetDrScores);
    const baselineDr = mean(baselineDrScores);
    const liftScores = targetDrScores.map((value, index) => value - (baselineDrScores[index] ?? 0));
    const liftEstimate = mean(liftScores);
    const variance =
      liftScores.length <= 1
        ? Number.POSITIVE_INFINITY
        : liftScores.reduce((sum, value) => sum + (value - liftEstimate) ** 2, 0) /
          (liftScores.length - 1);
    const standardError = Math.sqrt(variance / liftScores.length);
    const lower95 = liftEstimate - 1.96 * standardError;
    const upper95 = liftEstimate + 1.96 * standardError;
    if (![targetDr, baselineDr, liftEstimate, lower95, upper95].every(finite)) return abstained;

    return {
      status: 'ok',
      domain: 'content_ranking',
      target: {
        ips: mean(targetIpsScores),
        snips: targetIpsScores.reduce((sum, value) => sum + value, 0) / targetWeightSum,
        doublyRobust: targetDr,
      },
      baseline: {
        ips: mean(baselineIpsScores),
        snips: baselineIpsScores.reduce((sum, value) => sum + value, 0) / baselineWeightSum,
        doublyRobust: baselineDr,
      },
      lift: { estimate: liftEstimate, lower95, upper95 },
      effectiveSampleSize,
      eventCount: record.events.length,
      promotionAllowed:
        effectiveSampleSize >= policy.minimumEffectiveSampleSize &&
        lower95 >= policy.minimumLiftLowerBound,
      explorationAllowed: false,
      candidateOnly: true,
      acceptedFactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
