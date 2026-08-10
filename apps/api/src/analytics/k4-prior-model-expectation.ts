import {
  K4_PLANNER_VERSION,
  type K4FactInput,
  type K4MarketIntelligenceInput,
} from './k4-market-intelligence-plan.ts';

/**
 * K4 consumes expectations but never produced them, so `analytics.surprise_revision`
 * was unreachable and `REQ-EXP-001` could not hold on live data. This module is the
 * missing producer.
 *
 * The model is deliberately the weakest defensible baseline: a random walk with
 * drift over an evenly spaced annual run. Every input is a stored numeric fact, the
 * arithmetic is executable and versioned, and nothing is invented — `REQ-KERN-031`.
 * A run with a missing year, a target that is not the next annual period, or fewer
 * than three priors produces no expectation at all rather than a guess.
 */
export const K4_PRIOR_MODEL_KEY = 'prior_model.annual_drift.v1';
export const K4_PRIOR_MODEL_MINIMUM_PRIOR_OBSERVATIONS = 3;
export const K4_PRIOR_MODEL_MAXIMUM_PRIOR_OBSERVATIONS = 5;
export const K4_PRIOR_MODEL_HORIZON = 'next_annual_period';

const ACCEPTED_PIT_CLASSES = new Set([
  'PIT_A_NATIVE_VINTAGE',
  'PIT_B_VERSIONED_ARTIFACT',
  'PIT_C_OUR_ARCHIVE',
]);

export type K4PriorModelObservation = {
  numericFactId: number;
  value: number;
  periodEnd: string;
  knownAt: string;
};

export type K4PriorModelPeriodBasis = 'instant' | 'duration_quarter' | 'duration_annual';

export type K4PriorModelExpectationPlan = {
  expectationKey: string;
  derivationKey: string;
  expectationKind: 'prior_model';
  modelKey: string;
  periodBasis: K4PriorModelPeriodBasis;
  issuerEntityId: number;
  conceptNamespace: string;
  conceptKey: string;
  targetInstantAt: string | null;
  targetPeriodStart: string;
  targetPeriodEnd: string;
  targetNumericFactId: number;
  horizon: string;
  expectedValue: number;
  expectedUnit: string;
  drift: number;
  dispersion: number;
  priorObservationCount: number;
  priorObservations: readonly K4PriorModelObservation[];
  asOfAt: string;
  availableAt: string;
  knownAt: string;
};

export type K4PriorModelDerivationInput = {
  numericFactId: number;
  role: string;
};

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${label} must be a parseable timestamp`);
  return parsed;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function periodIdentity(fact: K4FactInput): string {
  return fact.instantAt ?? `${fact.periodStart ?? ''}/${fact.periodEnd ?? ''}`;
}

/** The unit a surprise compares on: `planSurprises` matches `currency ?? unit`. */
function expectedUnit(fact: K4FactInput): string {
  return fact.currency ?? fact.unit;
}

/**
 * Issuers report on fiscal calendars, so the same fiscal period lands a few days
 * apart each year — 2025-12-27 follows 2024-12-28, not 2024-12-27. Exact calendar
 * equality would therefore find no annual pair at all in real filings, which is why
 * the year-over-year link is a tolerance window rather than `calendarYearAfter`.
 */
const DAY_MS = 86_400_000;
const MINIMUM_ANNUAL_GAP_DAYS = 350;
const MAXIMUM_ANNUAL_GAP_DAYS = 380;
const IDEAL_ANNUAL_GAP_DAYS = 365;

function periodEndAt(fact: K4FactInput): number {
  if (fact.instantAt) return timestamp(fact.instantAt, 'fact.instantAt');
  if (fact.periodEnd) return timestamp(`${fact.periodEnd}T00:00:00.000Z`, 'fact.periodEnd');
  throw new Error('prior-model observation has no period end');
}

function annualGapDays(previous: K4FactInput, current: K4FactInput): number {
  return (periodEndAt(current) - periodEndAt(previous)) / DAY_MS;
}

const MINIMUM_QUARTER_LENGTH_DAYS = 80;
const MAXIMUM_QUARTER_LENGTH_DAYS = 100;

/**
 * `governance.metric_definition` is keyed by period basis, so the basis has to come
 * from the observation rather than be assumed. A window that is neither a quarter nor
 * a year — a year-to-date cumulation, most often — has no unambiguous basis here and
 * yields no expectation at all.
 */
function periodBasis(fact: K4FactInput): K4PriorModelPeriodBasis | null {
  if (fact.instantAt) return 'instant';
  if (!fact.periodStart || !fact.periodEnd) return null;
  const days =
    (timestamp(`${fact.periodEnd}T00:00:00.000Z`, 'fact.periodEnd') -
      timestamp(`${fact.periodStart}T00:00:00.000Z`, 'fact.periodStart')) /
    DAY_MS;
  if (days >= MINIMUM_QUARTER_LENGTH_DAYS && days <= MAXIMUM_QUARTER_LENGTH_DAYS) {
    return 'duration_quarter';
  }
  if (days >= MINIMUM_ANNUAL_GAP_DAYS && days <= MAXIMUM_ANNUAL_GAP_DAYS) {
    return 'duration_annual';
  }
  return null;
}

/** The observation one fiscal year before `current`, or null when the year is missing. */
function annualPredecessor(
  candidates: readonly K4FactInput[],
  current: K4FactInput,
): K4FactInput | null {
  let best: K4FactInput | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const gap = annualGapDays(candidate, current);
    if (gap < MINIMUM_ANNUAL_GAP_DAYS || gap > MAXIMUM_ANNUAL_GAP_DAYS) continue;
    const distance = Math.abs(gap - IDEAL_ANNUAL_GAP_DAYS);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function periodEndDate(fact: K4FactInput): string {
  if (fact.instantAt) return fact.instantAt.slice(0, 10);
  if (fact.periodEnd) return fact.periodEnd;
  throw new Error('prior-model observation has no period end');
}

function periodStartDate(fact: K4FactInput): string {
  if (fact.instantAt) return fact.instantAt.slice(0, 10);
  if (fact.periodStart) return fact.periodStart;
  throw new Error('prior-model observation has no period start');
}

function populationStandardDeviation(values: readonly number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function admissible(fact: K4FactInput, input: K4MarketIntelligenceInput): boolean {
  return (
    ACCEPTED_PIT_CLASSES.has(fact.pitClass) &&
    timestamp(fact.availableAt, 'fact.availableAt') <=
      timestamp(input.informationSet.sourceAvailableCutoff, 'sourceAvailableCutoff') &&
    timestamp(fact.knownAt, 'fact.knownAt') <=
      timestamp(input.informationSet.systemKnownCutoff, 'systemKnownCutoff')
  );
}

function seriesKey(fact: K4FactInput): string {
  return [fact.entityId, fact.conceptNamespace, fact.conceptKey, expectedUnit(fact)].join('\u0000');
}

/** One observation per period: later revisions of the same period supersede earlier ones. */
function latestPerPeriod(facts: readonly K4FactInput[]): K4FactInput[] {
  const byPeriod = new Map<string, K4FactInput>();
  for (const fact of facts) {
    const key = periodIdentity(fact);
    const existing = byPeriod.get(key);
    if (!existing || existing.numericFactId < fact.numericFactId) byPeriod.set(key, fact);
  }
  return [...byPeriod.values()].sort(
    (left, right) =>
      compareText(periodIdentity(left), periodIdentity(right)) ||
      left.numericFactId - right.numericFactId,
  );
}

function planSeries(series: readonly K4FactInput[]): K4PriorModelExpectationPlan | null {
  if (series.length < K4_PRIOR_MODEL_MINIMUM_PRIOR_OBSERVATIONS + 1) return null;
  const target = series[series.length - 1]!;
  const basis = periodBasis(target);
  if (!basis) return null;
  const targetKnownAt = timestamp(target.knownAt, 'target.knownAt');
  // Walk one fiscal year back at a time. A missing year ends the chain rather than
  // being bridged, so drift is never averaged across a gap the filings do not have.
  const chain: K4FactInput[] = [];
  let current = target;
  while (chain.length < K4_PRIOR_MODEL_MAXIMUM_PRIOR_OBSERVATIONS) {
    const earlier = series.filter(
      (candidate) =>
        candidate.numericFactId !== current.numericFactId &&
        // A quarter must never be compared against a year: same basis or no chain.
        periodBasis(candidate) === basis &&
        // Only facts known before the actual arrived may inform the expectation.
        timestamp(candidate.knownAt, 'prior.knownAt') < targetKnownAt,
    );
    const predecessor = annualPredecessor(earlier, current);
    if (!predecessor) break;
    chain.push(predecessor);
    current = predecessor;
  }
  if (chain.length < K4_PRIOR_MODEL_MINIMUM_PRIOR_OBSERVATIONS) return null;
  const priors = [...chain].reverse();

  const changes = priors.slice(1).map((prior, index) => prior.value - priors[index]!.value);
  const drift = changes.reduce((total, change) => total + change, 0) / changes.length;
  const lastPrior = priors[priors.length - 1]!;
  const asOfAt = priors
    .map((prior) => prior.knownAt)
    .reduce((latest, value) =>
      timestamp(value, 'prior.knownAt') > timestamp(latest, 'prior.knownAt') ? value : latest,
    );
  const expectationKey = [
    'k4:expectation:prior_model',
    lastPrior.entityId,
    lastPrior.conceptNamespace,
    lastPrior.conceptKey,
    expectedUnit(lastPrior),
    periodEndDate(target),
    'v1',
  ].join(':');
  return {
    expectationKey,
    derivationKey: `k4:derivation:${expectationKey}:v1`,
    expectationKind: 'prior_model',
    modelKey: K4_PRIOR_MODEL_KEY,
    periodBasis: basis,
    issuerEntityId: lastPrior.entityId,
    conceptNamespace: lastPrior.conceptNamespace,
    conceptKey: lastPrior.conceptKey,
    targetInstantAt: target.instantAt,
    targetPeriodStart: periodStartDate(target),
    targetPeriodEnd: periodEndDate(target),
    targetNumericFactId: target.numericFactId,
    horizon: K4_PRIOR_MODEL_HORIZON,
    expectedValue: lastPrior.value + drift,
    expectedUnit: expectedUnit(lastPrior),
    drift,
    dispersion: populationStandardDeviation(changes),
    priorObservationCount: priors.length,
    priorObservations: priors.map((prior) => ({
      numericFactId: prior.numericFactId,
      value: prior.value,
      periodEnd: periodEndDate(prior),
      knownAt: prior.knownAt,
    })),
    asOfAt,
    availableAt: asOfAt,
    knownAt: asOfAt,
  };
}

export function planK4PriorModelExpectations(
  input: K4MarketIntelligenceInput,
): K4PriorModelExpectationPlan[] {
  const issuerIds = new Set(
    input.securities.flatMap((security) =>
      security.issuerEntityId == null ? [] : [security.issuerEntityId],
    ),
  );
  const grouped = new Map<string, K4FactInput[]>();
  for (const fact of input.facts) {
    if (!issuerIds.has(fact.entityId)) continue;
    if (!admissible(fact, input)) continue;
    const key = seriesKey(fact);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(fact);
    else grouped.set(key, [fact]);
  }
  const plans: K4PriorModelExpectationPlan[] = [];
  for (const facts of grouped.values()) {
    const plan = planSeries(latestPerPeriod(facts));
    if (plan) plans.push(plan);
  }
  return plans.sort((left, right) => compareText(left.expectationKey, right.expectationKey));
}

export function priorModelExpectationInputs(
  plan: K4PriorModelExpectationPlan,
): K4PriorModelDerivationInput[] {
  return plan.priorObservations.map((observation, index) => ({
    numericFactId: observation.numericFactId,
    role: index === plan.priorObservations.length - 1 ? 'anchor' : 'history',
  }));
}

export function priorModelExpectationParameters(
  plan: K4PriorModelExpectationPlan,
): Record<string, unknown> {
  return {
    model_key: plan.modelKey,
    planner_version: K4_PLANNER_VERSION,
    formula: 'expected_value = last_prior_value + mean(consecutive_annual_changes)',
    dispersion_formula: 'population_standard_deviation(consecutive_annual_changes)',
    drift: plan.drift,
    prior_observation_count: plan.priorObservationCount,
    prior_observations: plan.priorObservations.map((observation) => ({
      numeric_fact_id: observation.numericFactId,
      period_end: observation.periodEnd,
      value: observation.value,
    })),
    unit: plan.expectedUnit,
  };
}
