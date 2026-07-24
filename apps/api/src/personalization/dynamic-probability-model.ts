export type DynamicProbabilityModelInput = {
  equilibriumExpectedReturn: number;
  hierarchical: {
    priorMean: number;
    priorVariance: number;
    betweenGroupVariance: number;
    groups: Array<{
      id: string;
      observations: Array<{ value: number; variance: number }>;
    }>;
  };
  bocpd: {
    observations: number[];
    hazardRate: number;
    observationVariance: number;
    priorMean: number;
    priorVariance: number;
  };
  scenarioTree: {
    nodes: Array<{
      id: string;
      parentId: string | null;
      conditionalProbability: number;
      returnAdjustment: number;
      downsideCvar: number;
    }>;
  };
  conformal: {
    absoluteResiduals: number[];
    targetCoverage: number;
    recencyDecay: number;
  };
  lifecycle: {
    stage: string;
    elapsedPeriods: number;
    baselineResolutionHazard: number;
    baselineAdverseHazard: number;
    covariates: number[];
    resolutionCoefficients: number[];
    adverseCoefficients: number[];
  };
  riskScalingPolicy: {
    changePointMultiplier: number;
    coverageShortfallMultiplier: number;
    adverseHazardMultiplier: number;
  };
};

export type DynamicProbabilityRuntimeContext = {
  equilibriumExpectedReturn: number;
  evidenceConfidence: number;
  changePointProbability: number;
  adverseHazard: number;
  scenarios: Array<{
    id: string;
    probability: number;
    expectedReturn: number;
    downsideCvar: number;
  }>;
  conformal: {
    targetCoverage: number;
    empiricalCoverage: number;
    lowerReturn: number;
    upperReturn: number;
  };
  riskScalingPolicy: {
    changePointMultiplier: number;
    coverageShortfallMultiplier: number;
    adverseHazardMultiplier: number;
  };
  methodEvidence: {
    hierarchicalModel: 'normal-normal-hierarchical-v1';
    hierarchicalPosteriorMean: number;
    hierarchicalPosteriorVariance: number;
    hierarchicalGroupCount: number;
    bocpdModel: 'normal-known-variance-bocpd-v1';
    bocpdObservationCount: number;
    scenarioModel: 'conditional-probability-tree-v1';
    scenarioLeafCount: number;
    conformalModel: 'recency-weighted-absolute-residual-v1';
    conformalSampleCount: number;
    hazardModel: 'proportional-hazard-v1';
    lifecycleStage: string;
    resolutionHazard: number;
  };
};

export type DynamicProbabilityModelResult =
  | { status: 'built'; context: DynamicProbabilityRuntimeContext }
  | {
      status: 'abstained';
      reason:
        | 'INVALID_INPUT'
        | 'INVALID_HIERARCHICAL_INPUT'
        | 'INVALID_BOCPD_INPUT'
        | 'INVALID_SCENARIO_TREE'
        | 'INVALID_CONFORMAL_INPUT'
        | 'INVALID_HAZARD_INPUT'
        | 'INVALID_ARITHMETIC'
        | 'RESOURCE_LIMIT_EXCEEDED';
    };

const PROBABILITY_TOLERANCE = 1e-9;
const MAX_MODEL_ITEMS = 4_096;
const MAX_HIERARCHICAL_GROUPS = 256;
const MAX_HAZARD_COVARIATES = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function allFinite(values: number[]): boolean {
  return values.every(Number.isFinite);
}

function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalLogDensity(value: number, mean: number, variance: number): number {
  if (!Number.isFinite(variance) || variance <= 0) return Number.NaN;
  const difference = value - mean;
  return -0.5 * (Math.log(2 * Math.PI * variance) + (difference * difference) / variance);
}

function logSumExp(values: number[]): number {
  const maximum = Math.max(...values);
  if (!Number.isFinite(maximum)) return Number.NaN;
  const sum = values.reduce((total, value) => total + Math.exp(value - maximum), 0);
  return maximum + Math.log(sum);
}

function updateNormal(
  priorMean: number,
  priorVariance: number,
  observation: number,
  observationVariance: number,
): { mean: number; variance: number } | null {
  const precision = 1 / priorVariance + 1 / observationVariance;
  const variance = 1 / precision;
  const mean = variance * (priorMean / priorVariance + observation / observationVariance);
  return allFinite([precision, variance, mean]) && variance > 0 ? { mean, variance } : null;
}

function validateInput(
  input: unknown,
):
  | { ok: true; input: DynamicProbabilityModelInput }
  | { ok: false; result: DynamicProbabilityModelResult } {
  const fail = (
    reason: Extract<DynamicProbabilityModelResult, { status: 'abstained' }>['reason'],
  ) => ({ ok: false as const, result: { status: 'abstained' as const, reason } });
  if (
    !isRecord(input) ||
    !isRecord(input.hierarchical) ||
    !isRecord(input.bocpd) ||
    !isRecord(input.scenarioTree) ||
    !isRecord(input.conformal) ||
    !isRecord(input.lifecycle) ||
    !isRecord(input.riskScalingPolicy)
  ) {
    return fail('INVALID_INPUT');
  }
  const value = input as unknown as DynamicProbabilityModelInput;
  const tooManyHierarchicalGroups =
    Array.isArray(value.hierarchical.groups) &&
    value.hierarchical.groups.length > MAX_HIERARCHICAL_GROUPS;
  const hierarchicalObservationCount =
    Array.isArray(value.hierarchical.groups) && !tooManyHierarchicalGroups
      ? value.hierarchical.groups.reduce(
          (total, group) =>
            total +
            (isRecord(group) && Array.isArray(group.observations) ? group.observations.length : 0),
          0,
        )
      : 0;
  if (
    tooManyHierarchicalGroups ||
    hierarchicalObservationCount > MAX_MODEL_ITEMS ||
    (Array.isArray(value.bocpd.observations) &&
      value.bocpd.observations.length > MAX_MODEL_ITEMS) ||
    (Array.isArray(value.scenarioTree.nodes) &&
      value.scenarioTree.nodes.length > MAX_MODEL_ITEMS) ||
    (Array.isArray(value.conformal.absoluteResiduals) &&
      value.conformal.absoluteResiduals.length > MAX_MODEL_ITEMS) ||
    (Array.isArray(value.lifecycle.covariates) &&
      value.lifecycle.covariates.length > MAX_HAZARD_COVARIATES)
  ) {
    return fail('RESOURCE_LIMIT_EXCEEDED');
  }
  if (!isFiniteNumber(value.equilibriumExpectedReturn)) return fail('INVALID_INPUT');

  const hierarchical = value.hierarchical;
  if (
    !isFiniteNumber(hierarchical.priorMean) ||
    !isFiniteNumber(hierarchical.priorVariance) ||
    hierarchical.priorVariance <= 0 ||
    !isFiniteNumber(hierarchical.betweenGroupVariance) ||
    hierarchical.betweenGroupVariance < 0 ||
    !Array.isArray(hierarchical.groups) ||
    hierarchical.groups.length === 0
  ) {
    return fail('INVALID_HIERARCHICAL_INPUT');
  }
  const groupIds = new Set<string>();
  for (const group of hierarchical.groups) {
    if (
      !isRecord(group) ||
      typeof group.id !== 'string' ||
      group.id.trim().length === 0 ||
      groupIds.has(group.id) ||
      !Array.isArray(group.observations) ||
      group.observations.length === 0
    ) {
      return fail('INVALID_HIERARCHICAL_INPUT');
    }
    groupIds.add(group.id);
    for (const observation of group.observations) {
      if (
        !isRecord(observation) ||
        !isFiniteNumber(observation.value) ||
        !isFiniteNumber(observation.variance) ||
        observation.variance <= 0
      ) {
        return fail('INVALID_HIERARCHICAL_INPUT');
      }
    }
  }

  const bocpd = value.bocpd;
  if (
    !Array.isArray(bocpd.observations) ||
    bocpd.observations.length < 2 ||
    !allFinite(bocpd.observations) ||
    !isFiniteNumber(bocpd.hazardRate) ||
    bocpd.hazardRate <= 0 ||
    bocpd.hazardRate >= 1 ||
    !isFiniteNumber(bocpd.observationVariance) ||
    bocpd.observationVariance <= 0 ||
    !isFiniteNumber(bocpd.priorMean) ||
    !isFiniteNumber(bocpd.priorVariance) ||
    bocpd.priorVariance <= 0
  ) {
    return fail('INVALID_BOCPD_INPUT');
  }

  if (!Array.isArray(value.scenarioTree.nodes) || value.scenarioTree.nodes.length === 0) {
    return fail('INVALID_SCENARIO_TREE');
  }
  const nodeIds = new Set<string>();
  for (const node of value.scenarioTree.nodes) {
    if (
      !isRecord(node) ||
      typeof node.id !== 'string' ||
      node.id.trim().length === 0 ||
      nodeIds.has(node.id) ||
      (node.parentId !== null && typeof node.parentId !== 'string') ||
      !isFiniteNumber(node.conditionalProbability) ||
      node.conditionalProbability < 0 ||
      node.conditionalProbability > 1 ||
      !isFiniteNumber(node.returnAdjustment) ||
      !isFiniteNumber(node.downsideCvar) ||
      node.downsideCvar < 0
    ) {
      return fail('INVALID_SCENARIO_TREE');
    }
    nodeIds.add(node.id);
  }
  const parentById = new Map(value.scenarioTree.nodes.map((node) => [node.id, node.parentId]));
  const visitState = new Map<string, 'visiting' | 'done'>();
  const probabilityByParent = new Map<string | null, number>();
  for (const node of value.scenarioTree.nodes) {
    if (node.parentId !== null && (!nodeIds.has(node.parentId) || node.parentId === node.id)) {
      return fail('INVALID_SCENARIO_TREE');
    }
    probabilityByParent.set(
      node.parentId,
      (probabilityByParent.get(node.parentId) ?? 0) + node.conditionalProbability,
    );
    const path: string[] = [];
    let currentId: string | null = node.id;
    while (currentId !== null) {
      const state = visitState.get(currentId);
      if (state === 'done') break;
      if (state === 'visiting') return fail('INVALID_SCENARIO_TREE');
      visitState.set(currentId, 'visiting');
      path.push(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
    for (const id of path) visitState.set(id, 'done');
  }
  for (const total of probabilityByParent.values()) {
    if (!Number.isFinite(total) || Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
      return fail('INVALID_SCENARIO_TREE');
    }
  }

  const conformal = value.conformal;
  if (
    !Array.isArray(conformal.absoluteResiduals) ||
    conformal.absoluteResiduals.length === 0 ||
    !allFinite(conformal.absoluteResiduals) ||
    conformal.absoluteResiduals.some((residual) => residual < 0) ||
    !isFiniteNumber(conformal.targetCoverage) ||
    conformal.targetCoverage <= 0 ||
    conformal.targetCoverage >= 1 ||
    !isFiniteNumber(conformal.recencyDecay) ||
    conformal.recencyDecay <= 0 ||
    conformal.recencyDecay > 1
  ) {
    return fail('INVALID_CONFORMAL_INPUT');
  }

  const lifecycle = value.lifecycle;
  if (
    typeof lifecycle.stage !== 'string' ||
    lifecycle.stage.trim().length === 0 ||
    !isFiniteNumber(lifecycle.elapsedPeriods) ||
    lifecycle.elapsedPeriods < 0 ||
    !isFiniteNumber(lifecycle.baselineResolutionHazard) ||
    lifecycle.baselineResolutionHazard < 0 ||
    !isFiniteNumber(lifecycle.baselineAdverseHazard) ||
    lifecycle.baselineAdverseHazard < 0 ||
    !Array.isArray(lifecycle.covariates) ||
    !Array.isArray(lifecycle.resolutionCoefficients) ||
    !Array.isArray(lifecycle.adverseCoefficients) ||
    lifecycle.covariates.length !== lifecycle.resolutionCoefficients.length ||
    lifecycle.covariates.length !== lifecycle.adverseCoefficients.length ||
    !allFinite(lifecycle.covariates) ||
    !allFinite(lifecycle.resolutionCoefficients) ||
    !allFinite(lifecycle.adverseCoefficients)
  ) {
    return fail('INVALID_HAZARD_INPUT');
  }
  const riskPolicy = value.riskScalingPolicy;
  if (
    !isFiniteNumber(riskPolicy.changePointMultiplier) ||
    riskPolicy.changePointMultiplier < 0 ||
    !isFiniteNumber(riskPolicy.coverageShortfallMultiplier) ||
    riskPolicy.coverageShortfallMultiplier < 0 ||
    !isFiniteNumber(riskPolicy.adverseHazardMultiplier) ||
    riskPolicy.adverseHazardMultiplier < 0
  ) {
    return fail('INVALID_INPUT');
  }
  return { ok: true, input: value };
}

function hierarchicalPosterior(input: DynamicProbabilityModelInput): {
  mean: number;
  variance: number;
  confidence: number;
} | null {
  const groupSummaries: Array<{ mean: number; observationVariance: number }> = [];
  for (const group of input.hierarchical.groups) {
    let precision = 0;
    let weightedMean = 0;
    for (const observation of group.observations) {
      precision += 1 / observation.variance;
      weightedMean += observation.value / observation.variance;
    }
    const observationVariance = 1 / precision;
    const mean = weightedMean * observationVariance;
    if (!allFinite([precision, observationVariance, mean]) || observationVariance <= 0) {
      return null;
    }
    groupSummaries.push({ mean, observationVariance });
  }

  let precision = 1 / input.hierarchical.priorVariance;
  let weightedMean = input.hierarchical.priorMean / input.hierarchical.priorVariance;
  for (const group of groupSummaries) {
    const variance = group.observationVariance + input.hierarchical.betweenGroupVariance;
    precision += 1 / variance;
    weightedMean += group.mean / variance;
  }
  const variance = 1 / precision;
  const mean = weightedMean * variance;
  const confidence = clampProbability(1 - variance / input.hierarchical.priorVariance);
  return allFinite([precision, variance, mean, confidence]) && variance > 0
    ? { mean, variance, confidence }
    : null;
}

function bocpdChangeProbability(input: DynamicProbabilityModelInput): number | null {
  const model = input.bocpd;
  let probabilities = [1];
  let states = [{ mean: model.priorMean, variance: model.priorVariance }];
  let changeProbability = model.hazardRate;

  for (const observation of model.observations) {
    const priorLogPredictive = normalLogDensity(
      observation,
      model.priorMean,
      model.priorVariance + model.observationVariance,
    );
    if (!Number.isFinite(priorLogPredictive)) return null;
    const logMasses: number[] = [Math.log(model.hazardRate) + priorLogPredictive];
    const growthStates: Array<{ mean: number; variance: number }> = [];
    for (let runLength = 0; runLength < probabilities.length; runLength += 1) {
      const state = states[runLength]!;
      const predictive = normalLogDensity(
        observation,
        state.mean,
        state.variance + model.observationVariance,
      );
      if (!Number.isFinite(predictive)) return null;
      if (probabilities[runLength]! <= 0) continue;
      logMasses.push(
        Math.log(probabilities[runLength]!) + Math.log(1 - model.hazardRate) + predictive,
      );
      const updated = updateNormal(
        state.mean,
        state.variance,
        observation,
        model.observationVariance,
      );
      if (!updated) return null;
      growthStates.push(updated);
    }
    const normalizer = logSumExp(logMasses);
    if (!Number.isFinite(normalizer)) return null;
    const nextProbabilities = logMasses.map((mass) => Math.exp(mass - normalizer));
    const nextStates: Array<{ mean: number; variance: number }> = [];
    const reset = updateNormal(
      model.priorMean,
      model.priorVariance,
      observation,
      model.observationVariance,
    );
    if (!reset) return null;
    nextStates.push(reset);
    nextStates.push(...growthStates);
    probabilities = nextProbabilities;
    states = nextStates;
    changeProbability = probabilities[0]!;
  }
  return Number.isFinite(changeProbability) ? clampProbability(changeProbability) : null;
}

function scenarioLeaves(
  input: DynamicProbabilityModelInput,
  posteriorMean: number,
): DynamicProbabilityRuntimeContext['scenarios'] | null {
  const nodes = input.scenarioTree.nodes;
  const parentIds = new Set(
    nodes.map((node) => node.parentId).filter((id): id is string => id !== null),
  );
  const leaves = nodes.filter((node) => !parentIds.has(node.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const scenarios = leaves.map((leaf) => {
    let probability = 1;
    let expectedReturn = posteriorMean;
    let downsideCvar = 0;
    let current: (typeof nodes)[number] | undefined = leaf;
    while (current) {
      probability *= current.conditionalProbability;
      expectedReturn += current.returnAdjustment;
      downsideCvar += current.downsideCvar;
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    return { id: leaf.id, probability, expectedReturn, downsideCvar };
  });
  const probability = scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);
  const numbers = scenarios.flatMap((scenario) => [
    scenario.probability,
    scenario.expectedReturn,
    scenario.downsideCvar,
  ]);
  return scenarios.length > 0 &&
    allFinite(numbers) &&
    Math.abs(probability - 1) <= PROBABILITY_TOLERANCE
    ? scenarios
    : null;
}

function conformalInterval(
  input: DynamicProbabilityModelInput,
  center: number,
): {
  targetCoverage: number;
  empiricalCoverage: number;
  lowerReturn: number;
  upperReturn: number;
} | null {
  const residuals = input.conformal.absoluteResiduals.map((residual, index, values) => ({
    residual,
    weight: input.conformal.recencyDecay ** (values.length - 1 - index),
  }));
  residuals.sort((left, right) => left.residual - right.residual);
  const totalWeight = residuals.reduce((sum, item) => sum + item.weight, 0);
  let cumulativeWeight = 0;
  let quantile = residuals.at(-1)!.residual;
  for (const item of residuals) {
    cumulativeWeight += item.weight;
    if (cumulativeWeight / totalWeight >= input.conformal.targetCoverage) {
      quantile = item.residual;
      break;
    }
  }
  const empiricalCoverage =
    input.conformal.absoluteResiduals.filter((residual) => residual <= quantile).length /
    input.conformal.absoluteResiduals.length;
  const lowerReturn = center - quantile;
  const upperReturn = center + quantile;
  return allFinite([totalWeight, quantile, empiricalCoverage, lowerReturn, upperReturn]) &&
    totalWeight > 0
    ? {
        targetCoverage: input.conformal.targetCoverage,
        empiricalCoverage,
        lowerReturn,
        upperReturn,
      }
    : null;
}

function proportionalHazards(input: DynamicProbabilityModelInput): {
  resolution: number;
  adverse: number;
} | null {
  const lifecycle = input.lifecycle;
  const resolutionLinear = lifecycle.covariates.reduce(
    (sum, value, index) => sum + value * lifecycle.resolutionCoefficients[index]!,
    0,
  );
  const adverseLinear = lifecycle.covariates.reduce(
    (sum, value, index) => sum + value * lifecycle.adverseCoefficients[index]!,
    0,
  );
  const resolutionIntensity =
    lifecycle.baselineResolutionHazard * Math.exp(resolutionLinear) * lifecycle.elapsedPeriods;
  const adverseIntensity =
    lifecycle.baselineAdverseHazard * Math.exp(adverseLinear) * lifecycle.elapsedPeriods;
  const resolution = 1 - Math.exp(-resolutionIntensity);
  const adverse = 1 - Math.exp(-adverseIntensity);
  return allFinite([
    resolutionLinear,
    adverseLinear,
    resolutionIntensity,
    adverseIntensity,
    resolution,
    adverse,
  ])
    ? { resolution: clampProbability(resolution), adverse: clampProbability(adverse) }
    : null;
}

export function buildDynamicProbabilityContext(input: unknown): DynamicProbabilityModelResult {
  const validated = validateInput(input);
  if (!validated.ok) return validated.result;
  const value = validated.input;
  const hierarchical = hierarchicalPosterior(value);
  if (!hierarchical) return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
  const changePointProbability = bocpdChangeProbability(value);
  if (changePointProbability === null) {
    return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
  }
  const scenarios = scenarioLeaves(value, hierarchical.mean);
  if (!scenarios) return { status: 'abstained', reason: 'INVALID_SCENARIO_TREE' };
  const conformal = conformalInterval(value, hierarchical.mean);
  if (!conformal) return { status: 'abstained', reason: 'INVALID_CONFORMAL_INPUT' };
  const hazards = proportionalHazards(value);
  if (!hazards) return { status: 'abstained', reason: 'INVALID_HAZARD_INPUT' };

  return {
    status: 'built',
    context: {
      equilibriumExpectedReturn: value.equilibriumExpectedReturn,
      evidenceConfidence: hierarchical.confidence,
      changePointProbability,
      adverseHazard: hazards.adverse,
      scenarios,
      conformal,
      riskScalingPolicy: { ...value.riskScalingPolicy },
      methodEvidence: {
        hierarchicalModel: 'normal-normal-hierarchical-v1',
        hierarchicalPosteriorMean: hierarchical.mean,
        hierarchicalPosteriorVariance: hierarchical.variance,
        hierarchicalGroupCount: value.hierarchical.groups.length,
        bocpdModel: 'normal-known-variance-bocpd-v1',
        bocpdObservationCount: value.bocpd.observations.length,
        scenarioModel: 'conditional-probability-tree-v1',
        scenarioLeafCount: scenarios.length,
        conformalModel: 'recency-weighted-absolute-residual-v1',
        conformalSampleCount: value.conformal.absoluteResiduals.length,
        hazardModel: 'proportional-hazard-v1',
        lifecycleStage: value.lifecycle.stage,
        resolutionHazard: hazards.resolution,
      },
    },
  };
}
