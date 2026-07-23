export type ConvexTargetOptimizerInput = {
  currentWeight: number;
  expectedReturn: number;
  variance: number;
  cvarPerWeight: number;
  cvarBudget: number;
  riskAversion: number;
  cvarPenalty: number;
  transactionCostRate: number;
  turnoverPenalty: number;
  minWeight: number;
  maxWeight: number;
  maxTradeWeight: number;
  cashAvailableWeight: number;
  liquidityMaxTradeWeight: number;
};

export type OptimizerBindingConstraint =
  | 'MIN_POSITION'
  | 'MAX_POSITION'
  | 'MAX_TRADE'
  | 'CASH_AVAILABLE'
  | 'LIQUIDITY_MAX_TRADE';

export type ConvexTargetOptimizerResult =
  | {
      status: 'optimized';
      targetWeight: number;
      tradeWeight: number;
      objectiveValue: number;
      objectiveImprovement: number;
      iterations: number;
      bindingConstraints: OptimizerBindingConstraint[];
    }
  | {
      status: 'abstained';
      reason: 'INVALID_OPTIMIZER_INPUT' | 'INFEASIBLE_CONSTRAINTS';
    };

const ITERATIONS = 96;
const GOLDEN_RATIO_COMPLEMENT = (Math.sqrt(5) - 1) / 2;
const BINDING_TOLERANCE = 1e-8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function isValidInput(value: unknown): value is ConvexTargetOptimizerInput {
  if (!isRecord(value)) return false;
  const numericKeys: Array<keyof ConvexTargetOptimizerInput> = [
    'currentWeight',
    'expectedReturn',
    'variance',
    'cvarPerWeight',
    'cvarBudget',
    'riskAversion',
    'cvarPenalty',
    'transactionCostRate',
    'turnoverPenalty',
    'minWeight',
    'maxWeight',
    'maxTradeWeight',
    'cashAvailableWeight',
    'liquidityMaxTradeWeight',
  ];
  if (numericKeys.some((key) => !isFiniteNumber(value[key]))) return false;

  const input = value as ConvexTargetOptimizerInput;
  return (
    input.currentWeight >= 0 &&
    input.currentWeight <= 1 &&
    input.variance >= 0 &&
    input.cvarPerWeight >= 0 &&
    input.cvarBudget >= 0 &&
    input.riskAversion >= 0 &&
    input.cvarPenalty >= 0 &&
    input.transactionCostRate >= 0 &&
    input.turnoverPenalty >= 0 &&
    input.minWeight >= 0 &&
    input.minWeight <= 1 &&
    input.maxWeight >= 0 &&
    input.maxWeight <= 1 &&
    input.maxTradeWeight >= 0 &&
    input.maxTradeWeight <= 1 &&
    input.cashAvailableWeight >= 0 &&
    input.cashAvailableWeight <= 1 &&
    input.liquidityMaxTradeWeight >= 0 &&
    input.liquidityMaxTradeWeight <= 1
  );
}

function finiteProduct(factors: number[]): number | null {
  if (factors.some((factor) => !Number.isFinite(factor))) return null;
  if (factors.some((factor) => factor === 0)) return 0;

  let sign = 1;
  let magnitudes = factors.map((factor) => {
    if (factor < 0) sign *= -1;
    return Math.abs(factor);
  });

  while (magnitudes.length > 1) {
    magnitudes.sort((left, right) => left - right);
    const paired: number[] = [];
    let left = 0;
    let right = magnitudes.length - 1;
    while (left < right) {
      const value = magnitudes[left]! * magnitudes[right]!;
      if (!Number.isFinite(value) || value === 0) return null;
      paired.push(value);
      left += 1;
      right -= 1;
    }
    if (left === right) paired.push(magnitudes[left]!);
    magnitudes = paired;
  }

  const value = sign * (magnitudes[0] ?? 1);
  if (!Number.isFinite(value) || value === 0) return null;
  return value;
}

function quadraticTerm(coefficient: number, value: number): number | null {
  if (coefficient === 0 || value === 0) return 0;
  return finiteProduct([coefficient, value, value]);
}

function objective(input: ConvexTargetOptimizerInput, weight: number): number | null {
  const turnover = weight - input.currentWeight;
  const weightedCvar = finiteProduct([input.cvarPerWeight, weight]);
  if (weightedCvar === null) return null;
  const cvarExcess = Math.max(0, weightedCvar - input.cvarBudget);
  if (!Number.isFinite(cvarExcess)) return null;

  const expectedReturnTerm = finiteProduct([-input.expectedReturn, weight]);
  const riskTerm = finiteProduct([0.5, input.riskAversion, input.variance, weight, weight]);
  const cvarTerm = quadraticTerm(input.cvarPenalty, cvarExcess);
  const transactionCostTerm = finiteProduct([input.transactionCostRate, Math.abs(turnover)]);
  const turnoverTerm = quadraticTerm(0.5 * input.turnoverPenalty, turnover);
  const terms = [expectedReturnTerm, riskTerm, cvarTerm, transactionCostTerm, turnoverTerm];
  if (terms.some((term) => term === null)) return null;

  let total = 0;
  for (const term of terms) {
    total += term as number;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}

function chooseBest(
  input: ConvexTargetOptimizerInput,
  candidates: number[],
): { weight: number; value: number } | null {
  let bestWeight = candidates[0] ?? input.currentWeight;
  let bestValue = objective(input, bestWeight);
  if (bestValue === null) return null;
  for (const candidate of candidates.slice(1)) {
    const candidateValue = objective(input, candidate);
    if (candidateValue === null) return null;
    if (
      candidateValue < bestValue ||
      (candidateValue === bestValue &&
        Math.abs(candidate - input.currentWeight) < Math.abs(bestWeight - input.currentWeight))
    ) {
      bestWeight = candidate;
      bestValue = candidateValue;
    }
  }
  return { weight: bestWeight, value: bestValue };
}

export function optimizeTargetWeight(input: unknown): ConvexTargetOptimizerResult {
  if (!isValidInput(input)) {
    return { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' };
  }
  if (input.minWeight > input.maxWeight) {
    return { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' };
  }

  const lowerBound = Math.max(
    input.minWeight,
    input.currentWeight - input.maxTradeWeight,
    input.currentWeight - input.liquidityMaxTradeWeight,
  );
  const upperBound = Math.min(
    input.maxWeight,
    input.currentWeight + input.maxTradeWeight,
    input.currentWeight + input.liquidityMaxTradeWeight,
    input.currentWeight + input.cashAvailableWeight,
  );
  if (lowerBound > upperBound) {
    return { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' };
  }

  let left = lowerBound;
  let right = upperBound;
  let leftProbe = right - GOLDEN_RATIO_COMPLEMENT * (right - left);
  let rightProbe = left + GOLDEN_RATIO_COMPLEMENT * (right - left);
  let leftValue = objective(input, leftProbe);
  let rightValue = objective(input, rightProbe);
  if (leftValue === null || rightValue === null) {
    return { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' };
  }

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    if (leftValue <= rightValue) {
      right = rightProbe;
      rightProbe = leftProbe;
      rightValue = leftValue;
      leftProbe = right - GOLDEN_RATIO_COMPLEMENT * (right - left);
      leftValue = objective(input, leftProbe);
      if (leftValue === null) {
        return { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' };
      }
    } else {
      left = leftProbe;
      leftProbe = rightProbe;
      leftValue = rightValue;
      rightProbe = left + GOLDEN_RATIO_COMPLEMENT * (right - left);
      rightValue = objective(input, rightProbe);
      if (rightValue === null) {
        return { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' };
      }
    }
  }

  const candidates = [lowerBound, upperBound, (left + right) / 2];
  if (input.currentWeight >= lowerBound && input.currentWeight <= upperBound) {
    candidates.push(input.currentWeight);
  }
  const optimum = chooseBest(input, candidates);
  if (optimum === null || !Number.isFinite(optimum.value)) {
    return { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' };
  }

  const targetWeight = normalizeSignedZero(optimum.weight);
  const tradeWeight = normalizeSignedZero(targetWeight - input.currentWeight);
  if (targetWeight < lowerBound || targetWeight > upperBound) {
    return { status: 'abstained', reason: 'INFEASIBLE_CONSTRAINTS' };
  }
  const currentObjective = objective(input, input.currentWeight);
  if (currentObjective === null) {
    return { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' };
  }
  const rawObjectiveImprovement = currentObjective - optimum.value;
  if (!Number.isFinite(rawObjectiveImprovement)) {
    return { status: 'abstained', reason: 'INVALID_OPTIMIZER_INPUT' };
  }
  const objectiveImprovement = normalizeSignedZero(Math.max(0, rawObjectiveImprovement));
  const bindingConstraints: OptimizerBindingConstraint[] = [];

  if (Math.abs(targetWeight - input.minWeight) <= BINDING_TOLERANCE) {
    bindingConstraints.push('MIN_POSITION');
  }
  if (Math.abs(targetWeight - input.maxWeight) <= BINDING_TOLERANCE) {
    bindingConstraints.push('MAX_POSITION');
  }
  if (Math.abs(Math.abs(tradeWeight) - input.maxTradeWeight) <= BINDING_TOLERANCE) {
    bindingConstraints.push('MAX_TRADE');
  }
  if (tradeWeight > 0 && Math.abs(tradeWeight - input.cashAvailableWeight) <= BINDING_TOLERANCE) {
    bindingConstraints.push('CASH_AVAILABLE');
  }
  if (Math.abs(Math.abs(tradeWeight) - input.liquidityMaxTradeWeight) <= BINDING_TOLERANCE) {
    bindingConstraints.push('LIQUIDITY_MAX_TRADE');
  }

  return {
    status: 'optimized',
    targetWeight,
    tradeWeight,
    objectiveValue: normalizeSignedZero(optimum.value),
    objectiveImprovement,
    iterations: ITERATIONS,
    bindingConstraints,
  };
}
