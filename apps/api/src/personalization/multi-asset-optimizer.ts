export type ExposureConstraintKind = 'sector' | 'country' | 'factor' | 'geo';

export type MultiAssetOptimizerInput = {
  assets: Array<{
    id: string;
    currentWeight: number;
    minWeight: number;
    maxWeight: number;
    transactionCostRate: number;
    turnoverPenalty: number;
  }>;
  equilibriumReturns: number[];
  covariance: number[][];
  covarianceShrinkage: number;
  blackLittermanTau: number;
  views: Array<{
    id: string;
    weights: number[];
    expectedReturn: number;
    uncertaintyVariance: number;
  }>;
  scenarios: Array<{
    id: string;
    probability: number;
    losses: number[];
  }>;
  riskAversion: number;
  cvarAlpha: number;
  cvarPenalty: number;
  leverageLimit: number;
  cashTargetWeight: number;
  turnoverLimit: number;
  exposureConstraints: Array<{
    id: string;
    kind: ExposureConstraintKind;
    coefficients: number[];
    min: number;
    max: number;
  }>;
  goalMinimumExpectedReturn: number | null;
  planningPeriods: number;
  periodDiscount: number;
  iterations: number;
  stepSize: number;
};

export type MultiAssetOptimizerResult =
  | {
      status: 'optimized';
      weights: number[];
      cashWeight: number;
      posteriorExpectedReturns: number[];
      robustCovariance: number[][];
      expectedReturn: number;
      cvar: number;
      turnover: number;
      objectiveValue: number;
      planningScale: number;
      iterations: number;
      bindingConstraints: string[];
    }
  | {
      status: 'abstained';
      reason:
        | 'INVALID_INPUT'
        | 'INVALID_COVARIANCE'
        | 'INVALID_BLACK_LITTERMAN_VIEW'
        | 'INVALID_SCENARIOS'
        | 'INFEASIBLE_CONSTRAINTS'
        | 'INVALID_ARITHMETIC'
        | 'RESOURCE_LIMIT_EXCEEDED';
    };

const MATRIX_TOLERANCE = 1e-10;
const CONSTRAINT_TOLERANCE = 1e-7;
const PROJECTION_PASSES = 128;
const MAX_VIEWS = 128;
const MAX_SCENARIOS = 4_096;
const MAX_EXPOSURE_CONSTRAINTS = 256;
const MAX_WORK_UNITS = 10_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function allFinite(values: number[]): boolean {
  return values.every(Number.isFinite);
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
}

function matrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => dot(row, vector));
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

function isPositiveDefinite(matrix: number[][]): boolean {
  const size = matrix.length;
  const lower = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row]![column]!;
      for (let index = 0; index < column; index += 1) {
        value -= lower[row]![index]! * lower[column]![index]!;
      }
      if (row === column) {
        if (!Number.isFinite(value) || value <= MATRIX_TOLERANCE) return false;
        lower[row]![column] = Math.sqrt(value);
      } else {
        value /= lower[column]![column]!;
        if (!Number.isFinite(value)) return false;
        lower[row]![column] = value;
      }
    }
  }
  return true;
}

function invertMatrix(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: size }, (_, columnIndex) => (rowIndex === columnIndex ? 1 : 0)),
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivotRow]![column]!)) {
        pivotRow = row;
      }
    }
    const pivot = augmented[pivotRow]![column]!;
    if (!Number.isFinite(pivot) || Math.abs(pivot) <= MATRIX_TOLERANCE) return null;
    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow]!, augmented[column]!];

    for (let index = 0; index < size * 2; index += 1) {
      augmented[column]![index] = augmented[column]![index]! / pivot;
    }
    if (!allFinite(augmented[column]!)) return null;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let index = 0; index < size * 2; index += 1) {
        augmented[row]![index] = augmented[row]![index]! - factor * augmented[column]![index]!;
      }
      if (!allFinite(augmented[row]!)) return null;
    }
  }

  return augmented.map((row) => row.slice(size));
}

function validateInput(
  input: unknown,
):
  | { ok: true; input: MultiAssetOptimizerInput }
  | { ok: false; reason: MultiAssetOptimizerResult & { status: 'abstained' } } {
  const fail = (reason: Extract<MultiAssetOptimizerResult, { status: 'abstained' }>['reason']) => ({
    ok: false as const,
    reason: { status: 'abstained' as const, reason },
  });
  if (!isRecord(input) || !Array.isArray(input.assets)) return fail('INVALID_INPUT');
  const candidate = input as unknown as MultiAssetOptimizerInput;
  const size = candidate.assets.length;
  if (size === 0 || size > 32) return fail('INVALID_INPUT');
  if (
    (Array.isArray(candidate.views) && candidate.views.length > MAX_VIEWS) ||
    (Array.isArray(candidate.scenarios) && candidate.scenarios.length > MAX_SCENARIOS) ||
    (Array.isArray(candidate.exposureConstraints) &&
      candidate.exposureConstraints.length > MAX_EXPOSURE_CONSTRAINTS)
  ) {
    return fail('RESOURCE_LIMIT_EXCEEDED');
  }
  if (
    !Array.isArray(candidate.equilibriumReturns) ||
    candidate.equilibriumReturns.length !== size ||
    !allFinite(candidate.equilibriumReturns) ||
    !Array.isArray(candidate.covariance) ||
    candidate.covariance.length !== size
  ) {
    return fail('INVALID_INPUT');
  }
  const assetIds = new Set<string>();
  for (const asset of candidate.assets) {
    if (
      !isRecord(asset) ||
      typeof asset.id !== 'string' ||
      asset.id.trim().length === 0 ||
      assetIds.has(asset.id) ||
      !isFiniteNumber(asset.currentWeight) ||
      !isFiniteNumber(asset.minWeight) ||
      !isFiniteNumber(asset.maxWeight) ||
      !isFiniteNumber(asset.transactionCostRate) ||
      !isFiniteNumber(asset.turnoverPenalty) ||
      asset.currentWeight < 0 ||
      asset.currentWeight > 1 ||
      asset.minWeight < 0 ||
      asset.maxWeight > 1 ||
      asset.minWeight > asset.maxWeight ||
      asset.transactionCostRate < 0 ||
      asset.turnoverPenalty < 0
    ) {
      return fail('INVALID_INPUT');
    }
    assetIds.add(asset.id);
  }

  for (let row = 0; row < size; row += 1) {
    if (!Array.isArray(candidate.covariance[row]) || candidate.covariance[row]!.length !== size) {
      return fail('INVALID_COVARIANCE');
    }
    for (let column = 0; column < size; column += 1) {
      const value = candidate.covariance[row]![column];
      if (!isFiniteNumber(value)) return fail('INVALID_COVARIANCE');
      if (
        Math.abs(value - candidate.covariance[column]![row]!) >
        MATRIX_TOLERANCE * Math.max(1, Math.abs(value))
      ) {
        return fail('INVALID_COVARIANCE');
      }
    }
  }

  if (
    !isFiniteNumber(candidate.covarianceShrinkage) ||
    candidate.covarianceShrinkage < 0 ||
    candidate.covarianceShrinkage > 1 ||
    !isFiniteNumber(candidate.blackLittermanTau) ||
    candidate.blackLittermanTau <= 0 ||
    !isFiniteNumber(candidate.riskAversion) ||
    candidate.riskAversion < 0 ||
    !isFiniteNumber(candidate.cvarAlpha) ||
    candidate.cvarAlpha <= 0 ||
    candidate.cvarAlpha >= 1 ||
    !isFiniteNumber(candidate.cvarPenalty) ||
    candidate.cvarPenalty < 0 ||
    !isFiniteNumber(candidate.leverageLimit) ||
    candidate.leverageLimit < 0 ||
    !isFiniteNumber(candidate.cashTargetWeight) ||
    candidate.cashTargetWeight < 0 ||
    candidate.cashTargetWeight > 1 ||
    !isFiniteNumber(candidate.turnoverLimit) ||
    candidate.turnoverLimit < 0 ||
    !Number.isInteger(candidate.planningPeriods) ||
    candidate.planningPeriods <= 0 ||
    candidate.planningPeriods > 120 ||
    !isFiniteNumber(candidate.periodDiscount) ||
    candidate.periodDiscount <= 0 ||
    candidate.periodDiscount > 1 ||
    !Number.isInteger(candidate.iterations) ||
    candidate.iterations <= 0 ||
    candidate.iterations > 10_000 ||
    !isFiniteNumber(candidate.stepSize) ||
    candidate.stepSize <= 0
  ) {
    return fail('INVALID_INPUT');
  }

  if (!Array.isArray(candidate.views)) return fail('INVALID_BLACK_LITTERMAN_VIEW');
  const viewIds = new Set<string>();
  for (const view of candidate.views) {
    if (
      !isRecord(view) ||
      typeof view.id !== 'string' ||
      view.id.trim().length === 0 ||
      viewIds.has(view.id) ||
      !Array.isArray(view.weights) ||
      view.weights.length !== size ||
      !allFinite(view.weights) ||
      view.weights.every((weight) => weight === 0) ||
      !isFiniteNumber(view.expectedReturn) ||
      !isFiniteNumber(view.uncertaintyVariance) ||
      view.uncertaintyVariance <= 0
    ) {
      return fail('INVALID_BLACK_LITTERMAN_VIEW');
    }
    viewIds.add(view.id);
  }

  if (!Array.isArray(candidate.scenarios) || candidate.scenarios.length === 0) {
    return fail('INVALID_SCENARIOS');
  }
  let scenarioProbability = 0;
  const scenarioIds = new Set<string>();
  for (const scenario of candidate.scenarios) {
    if (
      !isRecord(scenario) ||
      typeof scenario.id !== 'string' ||
      scenario.id.trim().length === 0 ||
      scenarioIds.has(scenario.id) ||
      !isFiniteNumber(scenario.probability) ||
      scenario.probability < 0 ||
      scenario.probability > 1 ||
      !Array.isArray(scenario.losses) ||
      scenario.losses.length !== size ||
      !allFinite(scenario.losses)
    ) {
      return fail('INVALID_SCENARIOS');
    }
    scenarioIds.add(scenario.id);
    scenarioProbability += scenario.probability;
  }
  if (!Number.isFinite(scenarioProbability) || Math.abs(scenarioProbability - 1) > 1e-9) {
    return fail('INVALID_SCENARIOS');
  }

  if (!Array.isArray(candidate.exposureConstraints)) return fail('INVALID_INPUT');
  const constraintIds = new Set<string>();
  for (const constraint of candidate.exposureConstraints) {
    if (
      !isRecord(constraint) ||
      typeof constraint.id !== 'string' ||
      constraint.id.trim().length === 0 ||
      constraintIds.has(constraint.id) ||
      !['sector', 'country', 'factor', 'geo'].includes(constraint.kind) ||
      !Array.isArray(constraint.coefficients) ||
      constraint.coefficients.length !== size ||
      !allFinite(constraint.coefficients) ||
      !isFiniteNumber(constraint.min) ||
      !isFiniteNumber(constraint.max) ||
      constraint.min > constraint.max ||
      constraint.coefficients.every((coefficient) => coefficient === 0)
    ) {
      return fail('INVALID_INPUT');
    }
    constraintIds.add(constraint.id);
  }
  if (
    candidate.goalMinimumExpectedReturn !== null &&
    !isFiniteNumber(candidate.goalMinimumExpectedReturn)
  ) {
    return fail('INVALID_INPUT');
  }
  const workUnits =
    candidate.iterations *
    size *
    (size +
      candidate.views.length +
      candidate.scenarios.length +
      candidate.exposureConstraints.length);
  if (!Number.isFinite(workUnits) || workUnits > MAX_WORK_UNITS) {
    return fail('RESOURCE_LIMIT_EXCEEDED');
  }
  return { ok: true, input: candidate };
}

function robustCovariance(input: MultiAssetOptimizerInput): number[][] {
  return input.covariance.map((row, rowIndex) =>
    row.map((value, columnIndex) =>
      rowIndex === columnIndex ? value : value * (1 - input.covarianceShrinkage),
    ),
  );
}

function blackLittermanPosterior(
  input: MultiAssetOptimizerInput,
  covariance: number[][],
): number[] | null {
  const tauCovariance = covariance.map((row) =>
    row.map((value) => value * input.blackLittermanTau),
  );
  const priorPrecision = invertMatrix(tauCovariance);
  if (!priorPrecision) return null;
  const precision = cloneMatrix(priorPrecision);
  const rightHandSide = matrixVector(priorPrecision, input.equilibriumReturns);

  for (const view of input.views) {
    const inverseUncertainty = 1 / view.uncertaintyVariance;
    for (let row = 0; row < input.assets.length; row += 1) {
      rightHandSide[row] =
        rightHandSide[row]! + view.weights[row]! * view.expectedReturn * inverseUncertainty;
      for (let column = 0; column < input.assets.length; column += 1) {
        precision[row]![column] =
          precision[row]![column]! +
          view.weights[row]! * view.weights[column]! * inverseUncertainty;
      }
    }
  }
  if (!allFinite(rightHandSide) || precision.some((row) => !allFinite(row))) return null;
  const posteriorCovariance = invertMatrix(precision);
  if (!posteriorCovariance) return null;
  const posterior = matrixVector(posteriorCovariance, rightHandSide);
  return allFinite(posterior) ? posterior : null;
}

function reduceToCap(weights: number[], minimums: number[], cap: number): number[] {
  let result = [...weights];
  for (let pass = 0; pass < result.length + 2; pass += 1) {
    const total = result.reduce((sum, weight) => sum + weight, 0);
    if (total <= cap + CONSTRAINT_TOLERANCE) return result;
    const reducible = result.reduce(
      (sum, weight, index) => sum + Math.max(0, weight - minimums[index]!),
      0,
    );
    if (reducible <= 0) return result;
    const required = total - cap;
    result = result.map((weight, index) => {
      const room = Math.max(0, weight - minimums[index]!);
      return Math.max(minimums[index]!, weight - required * (room / reducible));
    });
  }
  return result;
}

function projectWeights(
  input: MultiAssetOptimizerInput,
  posterior: number[],
  rawWeights: number[],
): number[] {
  const minimums = input.assets.map((asset) => asset.minWeight);
  const maximums = input.assets.map((asset) => asset.maxWeight);
  const current = input.assets.map((asset) => asset.currentWeight);
  const investedCap = Math.min(input.leverageLimit, 1 - input.cashTargetWeight);
  let weights = [...rawWeights];

  for (let pass = 0; pass < PROJECTION_PASSES; pass += 1) {
    weights = weights.map((weight, index) =>
      Math.max(minimums[index]!, Math.min(maximums[index]!, weight)),
    );
    weights = reduceToCap(weights, minimums, investedCap);

    const turnover = weights.reduce(
      (sum, weight, index) => sum + Math.abs(weight - current[index]!),
      0,
    );
    if (turnover > input.turnoverLimit && turnover > 0) {
      const scale = input.turnoverLimit / turnover;
      weights = weights.map(
        (weight, index) => current[index]! + (weight - current[index]!) * scale,
      );
    }

    for (const constraint of input.exposureConstraints) {
      const exposure = dot(constraint.coefficients, weights);
      const target =
        exposure < constraint.min
          ? constraint.min
          : exposure > constraint.max
            ? constraint.max
            : null;
      if (target !== null) {
        const normSquared = dot(constraint.coefficients, constraint.coefficients);
        const shift = (target - exposure) / normSquared;
        weights = weights.map((weight, index) => weight + shift * constraint.coefficients[index]!);
      }
    }

    if (input.goalMinimumExpectedReturn !== null) {
      const expectedReturn = dot(posterior, weights);
      if (expectedReturn < input.goalMinimumExpectedReturn) {
        const normSquared = dot(posterior, posterior);
        if (normSquared > 0) {
          const shift = (input.goalMinimumExpectedReturn - expectedReturn) / normSquared;
          weights = weights.map((weight, index) => weight + shift * posterior[index]!);
        }
      }
    }
  }
  return weights;
}

function portfolioCvar(
  input: MultiAssetOptimizerInput,
  weights: number[],
): { value: number; gradient: number[] } | null {
  const losses = input.scenarios
    .map((scenario) => ({
      probability: scenario.probability,
      value: dot(scenario.losses, weights),
      vector: scenario.losses,
    }))
    .sort((left, right) => left.value - right.value);
  if (losses.some((loss) => !Number.isFinite(loss.value))) return null;

  let cumulative = 0;
  let valueAtRisk = losses.at(-1)?.value ?? 0;
  for (const loss of losses) {
    cumulative += loss.probability;
    if (cumulative >= input.cvarAlpha) {
      valueAtRisk = loss.value;
      break;
    }
  }
  const tailProbability = 1 - input.cvarAlpha;
  const above = losses.filter((loss) => loss.value > valueAtRisk);
  const boundary = losses.filter((loss) => loss.value === valueAtRisk);
  const aboveProbability = above.reduce((sum, loss) => sum + loss.probability, 0);
  const boundaryProbability = boundary.reduce((sum, loss) => sum + loss.probability, 0);
  const boundaryNeeded = Math.max(
    0,
    Math.min(boundaryProbability, tailProbability - aboveProbability),
  );
  if (boundaryProbability <= 0 || boundaryNeeded < 0) return null;

  const gradient = Array.from({ length: weights.length }, () => 0);
  let weightedTailLoss = 0;
  for (const loss of above) {
    weightedTailLoss += loss.probability * loss.value;
    for (let index = 0; index < weights.length; index += 1) {
      gradient[index] =
        gradient[index]! + (loss.probability * loss.vector[index]!) / tailProbability;
    }
  }
  for (const loss of boundary) {
    const includedProbability = boundaryNeeded * (loss.probability / boundaryProbability);
    weightedTailLoss += includedProbability * loss.value;
    for (let index = 0; index < weights.length; index += 1) {
      gradient[index] =
        gradient[index]! + (includedProbability * loss.vector[index]!) / tailProbability;
    }
  }
  const value = weightedTailLoss / tailProbability;
  return Number.isFinite(value) && allFinite(gradient) ? { value, gradient } : null;
}

function verifyConstraints(
  input: MultiAssetOptimizerInput,
  posterior: number[],
  weights: number[],
): boolean {
  if (!allFinite(weights)) return false;
  for (let index = 0; index < weights.length; index += 1) {
    if (
      weights[index]! < input.assets[index]!.minWeight - CONSTRAINT_TOLERANCE ||
      weights[index]! > input.assets[index]!.maxWeight + CONSTRAINT_TOLERANCE
    ) {
      return false;
    }
  }
  const invested = weights.reduce((sum, weight) => sum + weight, 0);
  if (
    invested > input.leverageLimit + CONSTRAINT_TOLERANCE ||
    invested > 1 - input.cashTargetWeight + CONSTRAINT_TOLERANCE
  ) {
    return false;
  }
  const turnover = weights.reduce(
    (sum, weight, index) => sum + Math.abs(weight - input.assets[index]!.currentWeight),
    0,
  );
  if (turnover > input.turnoverLimit + CONSTRAINT_TOLERANCE) return false;
  for (const constraint of input.exposureConstraints) {
    const exposure = dot(constraint.coefficients, weights);
    if (
      exposure < constraint.min - CONSTRAINT_TOLERANCE ||
      exposure > constraint.max + CONSTRAINT_TOLERANCE
    ) {
      return false;
    }
  }
  if (
    input.goalMinimumExpectedReturn !== null &&
    dot(posterior, weights) < input.goalMinimumExpectedReturn - CONSTRAINT_TOLERANCE
  ) {
    return false;
  }
  return true;
}

function planningScale(input: MultiAssetOptimizerInput): number {
  let scale = 0;
  for (let period = 0; period < input.planningPeriods; period += 1) {
    scale += input.periodDiscount ** period;
  }
  return scale;
}

function objective(
  input: MultiAssetOptimizerInput,
  posterior: number[],
  covariance: number[][],
  weights: number[],
  cvar: number,
  scale: number,
): number {
  const covarianceWeight = matrixVector(covariance, weights);
  const risk = 0.5 * input.riskAversion * dot(weights, covarianceWeight);
  const expectedReturn = dot(posterior, weights);
  const trading = weights.reduce((sum, weight, index) => {
    const delta = weight - input.assets[index]!.currentWeight;
    return (
      sum +
      input.assets[index]!.transactionCostRate * Math.abs(delta) +
      0.5 * input.assets[index]!.turnoverPenalty * delta * delta
    );
  }, 0);
  return scale * (-expectedReturn + risk + input.cvarPenalty * cvar) + trading;
}

export function optimizeConvexPortfolio(input: unknown): MultiAssetOptimizerResult {
  const validated = validateInput(input);
  if (!validated.ok) return validated.reason;
  const value = validated.input;
  const covariance = robustCovariance(value);
  if (!isPositiveDefinite(covariance)) {
    return { status: 'abstained', reason: 'INVALID_COVARIANCE' };
  }
  const posterior = blackLittermanPosterior(value, covariance);
  if (!posterior) return { status: 'abstained', reason: 'INVALID_COVARIANCE' };
  const scale = planningScale(value);
  if (!Number.isFinite(scale)) return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };

  let weights = projectWeights(
    value,
    posterior,
    value.assets.map((asset) => asset.currentWeight),
  );
  if (!verifyConstraints(value, posterior, weights)) {
    return { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' };
  }

  let cvarState = portfolioCvar(value, weights);
  if (!cvarState) return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
  let bestWeights = [...weights];
  let bestCvar = cvarState.value;
  let bestObjective = objective(value, posterior, covariance, weights, cvarState.value, scale);
  if (!Number.isFinite(bestObjective)) {
    return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
  }

  for (let iteration = 0; iteration < value.iterations; iteration += 1) {
    const covarianceGradient = matrixVector(covariance, weights);
    const gradient = weights.map((weight, index) => {
      const delta = weight - value.assets[index]!.currentWeight;
      const transactionGradient = value.assets[index]!.transactionCostRate * Math.sign(delta);
      const turnoverGradient = value.assets[index]!.turnoverPenalty * delta;
      return (
        scale *
          (value.riskAversion * covarianceGradient[index]! -
            posterior[index]! +
            value.cvarPenalty * cvarState!.gradient[index]!) +
        transactionGradient +
        turnoverGradient
      );
    });
    if (!allFinite(gradient)) {
      return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
    }
    const step = value.stepSize / Math.sqrt(iteration + 1);
    weights = projectWeights(
      value,
      posterior,
      weights.map((weight, index) => weight - step * gradient[index]!),
    );
    if (!verifyConstraints(value, posterior, weights)) {
      return { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' };
    }
    cvarState = portfolioCvar(value, weights);
    if (!cvarState) return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
    const candidateObjective = objective(
      value,
      posterior,
      covariance,
      weights,
      cvarState.value,
      scale,
    );
    if (!Number.isFinite(candidateObjective)) {
      return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
    }
    if (candidateObjective < bestObjective) {
      bestObjective = candidateObjective;
      bestWeights = [...weights];
      bestCvar = cvarState.value;
    }
  }

  if (!verifyConstraints(value, posterior, bestWeights)) {
    return { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' };
  }
  const expectedReturn = dot(posterior, bestWeights);
  const turnover = bestWeights.reduce(
    (sum, weight, index) => sum + Math.abs(weight - value.assets[index]!.currentWeight),
    0,
  );
  const cashWeight = 1 - bestWeights.reduce((sum, weight) => sum + weight, 0);
  const outputNumbers = [expectedReturn, turnover, cashWeight, bestCvar, bestObjective];
  if (!allFinite(outputNumbers)) {
    return { status: 'abstained', reason: 'INVALID_ARITHMETIC' };
  }

  const bindingConstraints: string[] = [];
  value.assets.forEach((asset, index) => {
    if (Math.abs(bestWeights[index]! - asset.minWeight) <= CONSTRAINT_TOLERANCE) {
      bindingConstraints.push(`position:min:${asset.id}`);
    }
    if (Math.abs(bestWeights[index]! - asset.maxWeight) <= CONSTRAINT_TOLERANCE) {
      bindingConstraints.push(`position:max:${asset.id}`);
    }
  });
  if (Math.abs(cashWeight - value.cashTargetWeight) <= CONSTRAINT_TOLERANCE) {
    bindingConstraints.push('cash-target');
  }
  if (Math.abs(turnover - value.turnoverLimit) <= CONSTRAINT_TOLERANCE) {
    bindingConstraints.push('turnover-limit');
  }
  for (const constraint of value.exposureConstraints) {
    const exposure = dot(constraint.coefficients, bestWeights);
    if (
      Math.abs(exposure - constraint.min) <= CONSTRAINT_TOLERANCE ||
      Math.abs(exposure - constraint.max) <= CONSTRAINT_TOLERANCE
    ) {
      bindingConstraints.push(`${constraint.kind}:${constraint.id}`);
    }
  }

  return {
    status: 'optimized',
    weights: bestWeights,
    cashWeight,
    posteriorExpectedReturns: posterior,
    robustCovariance: covariance,
    expectedReturn,
    cvar: bestCvar,
    turnover,
    objectiveValue: bestObjective,
    planningScale: scale,
    iterations: value.iterations,
    bindingConstraints,
  };
}
