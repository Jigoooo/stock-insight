import { createHash } from 'node:crypto';

const ACCEPTED_PIT_CLASSES = new Set([
  'PIT_A_NATIVE_VINTAGE',
  'PIT_B_VERSIONED_ARTIFACT',
  'PIT_C_OUR_ARCHIVE',
]);
const REVENUE_CONCEPTS = new Set([
  'Revenue',
  'Revenues',
  'SalesRevenueNet',
  'RevenueFromContractWithCustomerExcludingAssessedTax',
]);
const SCORE_COMPONENT_KINDS = [
  'evidence_confidence',
  'relation_strength',
  'materiality',
  'transmission',
  'direction',
  'lag',
  'market_reflection',
  'model_uncertainty',
] as const;

type EvaluationDisposition =
  | 'accepted'
  | 'missing_identity'
  | 'no_pit_evidence'
  | 'unsupported_measurement'
  | 'ambiguous_driver_attribution'
  | 'no_recent_observation';
type Direction = 'positive' | 'negative' | 'ambiguous';
type SurpriseDirection = 'positive' | 'negative' | 'neutral';

export type K4InformationSetInput = {
  informationSetId: string;
  validCutoff: string;
  sourceAvailableCutoff: string;
  systemKnownCutoff: string;
  marketObservationCutoff: string;
  semanticSnapshotId?: string;
};

export type K4SecurityInput = {
  securityEntityId: number;
  issuerEntityId: number | null;
  securityIssuerIdentityId: number | null;
  sectorPlaybookId: number | null;
  valuationRange?: {
    methodKey: string;
    lowerEstimate: number;
    upperEstimate: number;
    estimateUnit: string;
    horizon: string;
  };
};

export type K4RuleInput = {
  securityEntityId: number;
  issuerEntityId: number;
  sectorPlaybookId: number;
  businessDriverId: number;
  businessDriverMeasurementRuleId: number;
  driverKey: string;
  ruleKey: string;
  comparisonMethod: 'period_end_year_over_year_delta' | 'duration_year_over_year_delta';
  outputUnit: string;
  outputCurrency: string | null;
  inputConceptSelectors: readonly {
    conceptNamespace: string;
    conceptKeys: readonly string[];
  }[];
  directionPolicy: Record<string, string>;
  materialityPolicy: { method: string };
  minimumHistoryObservations: number;
  allowedPitClasses: readonly string[];
  horizon: 'immediate' | 'short' | 'medium' | 'long';
  channelClass: string;
  impactPathStepIds?: readonly number[];
};

export type K4FactInput = {
  numericFactId: number;
  entityId: number;
  conceptNamespace: string;
  conceptKey: string;
  value: number;
  unit: string;
  currency: string | null;
  instantAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  sourceRevisionId: number;
  sourcePitQualityId: number;
  pitClass: string;
  availableAt: string;
  knownAt: string;
  locator: Record<string, unknown>;
};

export type K4ExpectationInput = {
  expectationKey: string;
  issuerEntityId: number;
  conceptNamespace: string;
  conceptKey: string;
  targetInstantAt?: string | null;
  targetPeriodStart?: string | null;
  targetPeriodEnd?: string | null;
  expectedValue: number;
  expectedUnit: string;
  dispersion: number | null;
  availableAt: string;
  knownAt: string;
  derivationKey: string;
  expectationRevisionId?: number;
  sourceRevisionId?: number | null;
};

export type K4MarketIntelligenceInput = {
  informationSet: K4InformationSetInput;
  securities: readonly K4SecurityInput[];
  rules: readonly K4RuleInput[];
  facts: readonly K4FactInput[];
  expectations: readonly K4ExpectationInput[];
};

type EvidencePlan = {
  numericFactId: number;
  sourceRevisionId: number;
  sourcePitQualityId: number;
  inputRole: 'current' | 'comparison';
};

type ScoreComponentPlan = {
  componentKind: (typeof SCORE_COMPONENT_KINDS)[number];
  componentValue: number;
  rationale: string;
};

type EvaluationPlan = {
  evaluationKey: string;
  securityEntityId: number;
  issuerEntityId: number | null;
  securityIssuerIdentityId: number | null;
  sectorPlaybookId: number | null;
  businessDriverId: number | null;
  businessDriverMeasurementRuleId: number | null;
  driverKey: string | null;
  ruleKey: string | null;
  evaluationDisposition: EvaluationDisposition;
  reasonDetail: string | null;
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementCurrency: string | null;
  direction: Direction | null;
  materiality: number | null;
  evidence: EvidencePlan[];
};

type SurprisePlan = {
  surpriseKey: string;
  expectationKey: string;
  actualNumericFactId: number;
  actualValue: number;
  expectedValue: number;
  rawSurprise: number;
  standardizedSurprise: number | null;
  direction: SurpriseDirection;
  materiality: number;
  unit: string;
};

type ExposurePlan = {
  exposureKey: string;
  evaluationKey: string;
  shockKey: string;
  eventKey: string;
  securityEntityId: number;
  issuerEntityId: number;
  channelClass: string;
  sign: Direction;
  horizon: K4RuleInput['horizon'];
  economicMagnitude: number;
  economicMagnitudeUnit: string;
  materiality: number;
  uncertainty: number;
  epistemicConfidence: number;
  scoreComponents: ScoreComponentPlan[];
};

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO timestamp`);
  return parsed;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueBy<T>(values: readonly T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function directionOf(value: number): SurpriseDirection {
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
}

function periodIdentity(fact: K4FactInput): string {
  return fact.instantAt ?? `${fact.periodStart ?? ''}/${fact.periodEnd ?? ''}`;
}

function expectationPeriod(expectation: K4ExpectationInput): string {
  return (
    expectation.targetInstantAt ??
    `${expectation.targetPeriodStart ?? ''}/${expectation.targetPeriodEnd ?? ''}`
  );
}

function calendarYearAfter(value: string): string {
  const date = new Date(value);
  const originalMonth = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (date.getUTCMonth() !== originalMonth) date.setUTCDate(0);
  return date.toISOString();
}

function selectorMatches(rule: K4RuleInput, fact: K4FactInput): boolean {
  return rule.inputConceptSelectors.some(
    (selector) =>
      selector.conceptNamespace === fact.conceptNamespace &&
      selector.conceptKeys.includes(fact.conceptKey),
  );
}

function factPassesCutoff(fact: K4FactInput, informationSet: K4InformationSetInput): boolean {
  return (
    timestamp(fact.availableAt, 'fact.availableAt') <=
      timestamp(informationSet.sourceAvailableCutoff, 'sourceAvailableCutoff') &&
    timestamp(fact.knownAt, 'fact.knownAt') <=
      timestamp(informationSet.systemKnownCutoff, 'systemKnownCutoff')
  );
}

function expectationPassesCutoff(
  expectation: K4ExpectationInput,
  informationSet: K4InformationSetInput,
): boolean {
  return (
    timestamp(expectation.availableAt, 'expectation.availableAt') <=
      timestamp(informationSet.sourceAvailableCutoff, 'sourceAvailableCutoff') &&
    timestamp(expectation.knownAt, 'expectation.knownAt') <=
      timestamp(informationSet.systemKnownCutoff, 'systemKnownCutoff')
  );
}

function comparablePair(
  facts: readonly K4FactInput[],
  method: K4RuleInput['comparisonMethod'],
): readonly [K4FactInput, K4FactInput] | null {
  const ordered = [...facts].sort(
    (left, right) =>
      compareText(periodIdentity(right), periodIdentity(left)) ||
      right.numericFactId - left.numericFactId,
  );
  for (const current of ordered) {
    if (method === 'period_end_year_over_year_delta' && current.instantAt) {
      const comparison = ordered.find(
        (candidate) =>
          candidate.numericFactId !== current.numericFactId &&
          candidate.conceptNamespace === current.conceptNamespace &&
          candidate.conceptKey === current.conceptKey &&
          candidate.instantAt !== null &&
          calendarYearAfter(candidate.instantAt) === current.instantAt,
      );
      if (comparison) return [current, comparison];
    }
    if (method === 'duration_year_over_year_delta' && current.periodStart && current.periodEnd) {
      const comparison = ordered.find(
        (candidate) =>
          candidate.numericFactId !== current.numericFactId &&
          candidate.conceptNamespace === current.conceptNamespace &&
          candidate.conceptKey === current.conceptKey &&
          candidate.periodStart !== null &&
          candidate.periodEnd !== null &&
          calendarYearAfter(`${candidate.periodStart}T00:00:00.000Z`).slice(0, 10) ===
            current.periodStart &&
          calendarYearAfter(`${candidate.periodEnd}T00:00:00.000Z`).slice(0, 10) ===
            current.periodEnd,
      );
      if (comparison) return [current, comparison];
    }
  }
  return null;
}

function evidenceConfidence(facts: readonly K4FactInput[]): number {
  const value: Record<string, number> = {
    PIT_A_NATIVE_VINTAGE: 1,
    PIT_B_VERSIONED_ARTIFACT: 0.9,
    PIT_C_OUR_ARCHIVE: 0.8,
  };
  return Math.min(...facts.map((fact) => value[fact.pitClass] ?? 0));
}

function scoreComponents(
  rule: K4RuleInput,
  materiality: number,
  direction: Direction,
  confidence: number,
): ScoreComponentPlan[] {
  const lag = { immediate: 1, short: 0.75, medium: 0.5, long: 0.25 }[rule.horizon];
  const values: Record<(typeof SCORE_COMPONENT_KINDS)[number], [number, string]> = {
    evidence_confidence: [confidence, 'worst admitted PIT class'],
    relation_strength: [1, 'exact issuer-playbook-driver-rule bridge'],
    materiality: [materiality, 'absolute change over prior absolute value'],
    transmission: [1, 'exact executable driver-to-financial-stage bridge'],
    direction: [direction === 'ambiguous' ? 0.5 : 1, 'signed executable comparison'],
    lag: [lag, `controlled ${rule.horizon} horizon`],
    market_reflection: [0, 'no admitted pre-cutoff market measurement'],
    model_uncertainty: [1 - confidence, 'PIT-class residual uncertainty'],
  };
  return SCORE_COMPONENT_KINDS.map((componentKind) => ({
    componentKind,
    componentValue: values[componentKind][0],
    rationale: values[componentKind][1],
  }));
}

function rejection(
  informationSetId: string,
  security: K4SecurityInput,
  disposition: EvaluationDisposition,
  reasonDetail: string,
  rule?: K4RuleInput,
): EvaluationPlan {
  const logicalDriver = rule?.driverKey ?? 'coverage';
  return {
    evaluationKey: `k4:evaluation:${informationSetId}:${security.securityEntityId}:${logicalDriver}`,
    securityEntityId: security.securityEntityId,
    issuerEntityId: security.issuerEntityId,
    securityIssuerIdentityId: security.securityIssuerIdentityId,
    sectorPlaybookId: security.sectorPlaybookId,
    businessDriverId: rule?.businessDriverId ?? null,
    businessDriverMeasurementRuleId: rule?.businessDriverMeasurementRuleId ?? null,
    driverKey: rule?.driverKey ?? null,
    ruleKey: rule?.ruleKey ?? null,
    evaluationDisposition: disposition,
    reasonDetail,
    measurementValue: null,
    measurementUnit: null,
    measurementCurrency: null,
    direction: null,
    materiality: null,
    evidence: [],
  };
}

function planSurprises(input: K4MarketIntelligenceInput): SurprisePlan[] {
  const facts = input.facts.filter(
    (fact) =>
      factPassesCutoff(fact, input.informationSet) && ACCEPTED_PIT_CLASSES.has(fact.pitClass),
  );
  const results: SurprisePlan[] = [];
  for (const expectation of [...input.expectations].sort((a, b) =>
    compareText(a.expectationKey, b.expectationKey),
  )) {
    if (!expectationPassesCutoff(expectation, input.informationSet)) continue;
    const actual = facts.find(
      (fact) =>
        fact.entityId === expectation.issuerEntityId &&
        fact.conceptNamespace === expectation.conceptNamespace &&
        fact.conceptKey === expectation.conceptKey &&
        (fact.currency ?? fact.unit) === expectation.expectedUnit &&
        periodIdentity(fact) === expectationPeriod(expectation),
    );
    if (!actual) continue;
    const rawSurprise = actual.value - expectation.expectedValue;
    const materiality =
      expectation.expectedValue === 0
        ? rawSurprise === 0
          ? 0
          : 1
        : clamp01(Math.abs(rawSurprise) / Math.abs(expectation.expectedValue));
    results.push({
      surpriseKey: `k4:surprise:${expectation.expectationKey}:${actual.numericFactId}`,
      expectationKey: expectation.expectationKey,
      actualNumericFactId: actual.numericFactId,
      actualValue: actual.value,
      expectedValue: expectation.expectedValue,
      rawSurprise,
      standardizedSurprise:
        expectation.dispersion && expectation.dispersion > 0
          ? rawSurprise / expectation.dispersion
          : null,
      direction: directionOf(rawSurprise),
      materiality,
      unit: expectation.expectedUnit,
    });
  }
  return results.sort((a, b) => compareText(a.surpriseKey, b.surpriseKey));
}

export function planK4MarketIntelligence(input: K4MarketIntelligenceInput) {
  const securityIds = new Set<number>();
  const securities = [...input.securities].sort(
    (left, right) => left.securityEntityId - right.securityEntityId,
  );
  for (const item of securities) {
    if (!Number.isSafeInteger(item.securityEntityId) || item.securityEntityId <= 0) {
      throw new Error('securityEntityId must be a positive integer');
    }
    if (securityIds.has(item.securityEntityId)) throw new Error('duplicate requested security');
    securityIds.add(item.securityEntityId);
  }
  const surprises = planSurprises(input);
  const rules = [...input.rules].sort(
    (left, right) =>
      left.securityEntityId - right.securityEntityId ||
      compareText(left.driverKey, right.driverKey) ||
      left.businessDriverMeasurementRuleId - right.businessDriverMeasurementRuleId,
  );
  const evaluations: EvaluationPlan[] = [];
  const exposures: ExposurePlan[] = [];
  const filingEvents = new Map<string, Record<string, unknown>>();
  const shocks = new Map<string, Record<string, unknown>>();
  const valuations: Record<string, unknown>[] = [];
  const pathCitations: Record<string, unknown>[] = [];

  for (const item of securities) {
    if (
      item.issuerEntityId == null ||
      item.securityIssuerIdentityId == null ||
      item.sectorPlaybookId == null
    ) {
      evaluations.push(
        rejection(
          input.informationSet.informationSetId,
          item,
          'missing_identity',
          'security does not resolve through one exact issuer identity and playbook',
        ),
      );
      continue;
    }
    const itemRules = rules.filter(
      (candidate) =>
        candidate.securityEntityId === item.securityEntityId &&
        candidate.issuerEntityId === item.issuerEntityId &&
        candidate.sectorPlaybookId === item.sectorPlaybookId,
    );
    if (itemRules.length === 0) {
      evaluations.push(
        rejection(
          input.informationSet.informationSetId,
          item,
          'unsupported_measurement',
          'no executable driver measurement rule resolved at the cutoff',
        ),
      );
      continue;
    }
    for (const measurementRule of itemRules) {
      const candidates = input.facts.filter(
        (fact) => fact.entityId === item.issuerEntityId && selectorMatches(measurementRule, fact),
      );
      const cutoffEligible = candidates.filter((fact) =>
        factPassesCutoff(fact, input.informationSet),
      );
      const pitEligible = cutoffEligible.filter(
        (fact) =>
          ACCEPTED_PIT_CLASSES.has(fact.pitClass) &&
          measurementRule.allowedPitClasses.includes(fact.pitClass),
      );
      if (
        pitEligible.length < measurementRule.minimumHistoryObservations &&
        candidates.length > pitEligible.length
      ) {
        evaluations.push(
          rejection(
            input.informationSet.informationSetId,
            item,
            'no_pit_evidence',
            'candidate evidence is after the AIS cutoff or outside PIT A/B/C policy',
            measurementRule,
          ),
        );
        continue;
      }
      if (pitEligible.length < measurementRule.minimumHistoryObservations) {
        const hasRevenueSurprise = surprises.some((surprise) => {
          const actual = input.facts.find(
            (fact) => fact.numericFactId === surprise.actualNumericFactId,
          );
          return (
            actual?.entityId === item.issuerEntityId && REVENUE_CONCEPTS.has(actual.conceptKey)
          );
        });
        evaluations.push(
          rejection(
            input.informationSet.informationSetId,
            item,
            hasRevenueSurprise ? 'ambiguous_driver_attribution' : 'no_recent_observation',
            hasRevenueSurprise
              ? 'revenue surprise has no direct evidence for demand, ASP, or mix cause'
              : 'minimum current/comparison observation history is not available',
            measurementRule,
          ),
        );
        continue;
      }
      const pair = comparablePair(pitEligible, measurementRule.comparisonMethod);
      if (!pair) {
        evaluations.push(
          rejection(
            input.informationSet.informationSetId,
            item,
            'unsupported_measurement',
            'facts do not form the exact executable year-over-year comparison',
            measurementRule,
          ),
        );
        continue;
      }
      const [current, comparison] = pair;
      if (
        current.unit !== comparison.unit ||
        current.unit !== measurementRule.outputUnit ||
        current.currency !== comparison.currency ||
        current.currency !== measurementRule.outputCurrency
      ) {
        evaluations.push(
          rejection(
            input.informationSet.informationSetId,
            item,
            'unsupported_measurement',
            'current, comparison, and rule unit/currency must match exactly',
            measurementRule,
          ),
        );
        continue;
      }
      finite(current.value, 'current value');
      finite(comparison.value, 'comparison value');
      const measurementValue = current.value - comparison.value;
      const signed = measurementValue > 0 ? 'positive' : measurementValue < 0 ? 'negative' : 'zero';
      const policyDirection = measurementRule.directionPolicy[signed];
      if (!['positive', 'negative', 'ambiguous'].includes(policyDirection ?? '')) {
        throw new Error(`measurement rule ${measurementRule.ruleKey} has no executable direction`);
      }
      if (measurementRule.materialityPolicy.method !== 'absolute_change_over_prior_absolute') {
        throw new Error(`unsupported materiality method for ${measurementRule.ruleKey}`);
      }
      const materiality =
        comparison.value === 0
          ? measurementValue === 0
            ? 0
            : 1
          : clamp01(Math.abs(measurementValue) / Math.abs(comparison.value));
      const direction = policyDirection as Direction;
      const evaluationKey = `k4:evaluation:${input.informationSet.informationSetId}:${item.securityEntityId}:${measurementRule.driverKey}`;
      const evidence: EvidencePlan[] = [
        {
          numericFactId: current.numericFactId,
          sourceRevisionId: current.sourceRevisionId,
          sourcePitQualityId: current.sourcePitQualityId,
          inputRole: 'current',
        },
        {
          numericFactId: comparison.numericFactId,
          sourceRevisionId: comparison.sourceRevisionId,
          sourcePitQualityId: comparison.sourcePitQualityId,
          inputRole: 'comparison',
        },
      ];
      evaluations.push({
        evaluationKey,
        securityEntityId: item.securityEntityId,
        issuerEntityId: item.issuerEntityId,
        securityIssuerIdentityId: item.securityIssuerIdentityId,
        sectorPlaybookId: item.sectorPlaybookId,
        businessDriverId: measurementRule.businessDriverId,
        businessDriverMeasurementRuleId: measurementRule.businessDriverMeasurementRuleId,
        driverKey: measurementRule.driverKey,
        ruleKey: measurementRule.ruleKey,
        evaluationDisposition: 'accepted',
        reasonDetail: null,
        measurementValue,
        measurementUnit: measurementRule.outputUnit,
        measurementCurrency: measurementRule.outputCurrency,
        direction,
        materiality,
        evidence,
      });
      const eventKey = `k4:filing:${item.issuerEntityId}:${current.sourceRevisionId}`;
      const shockKey = `${eventKey}:${measurementRule.driverKey}`;
      const exposureKey = `k4:exposure:${input.informationSet.informationSetId}:${item.securityEntityId}:${measurementRule.driverKey}`;
      filingEvents.set(eventKey, {
        eventKey,
        eventType: 'regulatory_filing_numeric_fact',
        issuerEntityId: item.issuerEntityId,
        sourceRevisionId: current.sourceRevisionId,
        availableAt: current.availableAt,
        knownAt: current.knownAt,
        locator: current.locator,
      });
      shocks.set(shockKey, {
        shockKey,
        eventKey,
        shockType: 'measured_driver_change',
        magnitude: measurementValue,
        magnitudeUnit: measurementRule.outputCurrency ?? measurementRule.outputUnit,
        availableAt: current.availableAt,
        knownAt: current.knownAt,
      });
      const confidence = evidenceConfidence(pair);
      exposures.push({
        exposureKey,
        evaluationKey,
        shockKey,
        eventKey,
        securityEntityId: item.securityEntityId,
        issuerEntityId: item.issuerEntityId,
        channelClass: measurementRule.channelClass,
        sign: direction,
        horizon: measurementRule.horizon,
        economicMagnitude: measurementValue,
        economicMagnitudeUnit: measurementRule.outputCurrency ?? measurementRule.outputUnit,
        materiality,
        uncertainty: 1 - confidence,
        epistemicConfidence: confidence,
        scoreComponents: scoreComponents(measurementRule, materiality, direction, confidence),
      });
      for (const impactPathStepId of [...(measurementRule.impactPathStepIds ?? [])].sort(
        (a, b) => a - b,
      )) {
        pathCitations.push({ impactPathStepId, exposureKey, citationRole: 'economic_basis' });
      }
      if (item.valuationRange) {
        const range = item.valuationRange;
        if (range.upperEstimate < range.lowerEstimate)
          throw new Error('valuation range is reversed');
        valuations.push({
          valuationEstimateKey: `k4:valuation:${input.informationSet.informationSetId}:${item.securityEntityId}:${measurementRule.driverKey}`,
          securityEntityId: item.securityEntityId,
          methodKey: range.methodKey,
          lowerEstimate: range.lowerEstimate,
          upperEstimate: range.upperEstimate,
          estimateUnit: range.estimateUnit,
          horizon: range.horizon,
          evaluationKey,
        });
      }
    }
  }

  evaluations.sort((a, b) => compareText(a.evaluationKey, b.evaluationKey));
  exposures.sort((a, b) => compareText(a.exposureKey, b.exposureKey));
  const coverage = securities.map((item) => {
    const rows = evaluations.filter((row) => row.securityEntityId === item.securityEntityId);
    return {
      securityEntityId: item.securityEntityId,
      acceptedEvaluationCount: rows.filter((row) => row.evaluationDisposition === 'accepted')
        .length,
      evaluationCount: rows.length,
      reasonCodes: uniqueBy(
        rows
          .filter((row) => row.evaluationDisposition !== 'accepted')
          .map((row) => row.evaluationDisposition)
          .sort(compareText),
        (value) => value,
      ),
    };
  });
  return {
    informationSet: { ...input.informationSet },
    expectations: [...input.expectations]
      .filter((value) => expectationPassesCutoff(value, input.informationSet))
      .sort((a, b) => compareText(a.expectationKey, b.expectationKey)),
    surprises,
    filingEvents: [...filingEvents.values()].sort((a, b) =>
      compareText(String(a.eventKey), String(b.eventKey)),
    ),
    shocks: [...shocks.values()].sort((a, b) =>
      compareText(String(a.shockKey), String(b.shockKey)),
    ),
    evaluations,
    exposures,
    valuations: valuations.sort((a, b) =>
      compareText(String(a.valuationEstimateKey), String(b.valuationEstimateKey)),
    ),
    pathCitations: pathCitations.sort(
      (a, b) => Number(a.impactPathStepId) - Number(b.impactPathStepId),
    ),
    coverage,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function digestK4MarketIntelligencePlan(plan: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(plan)))
    .digest('hex');
}

export function buildK4DailyCutoffs(input: {
  from: string;
  to: string;
  kstCutoffTime: string;
}): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
    throw new Error('from/to must be YYYY-MM-DD');
  }
  if (!/^\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/.test(input.kstCutoffTime)) {
    throw new Error('kstCutoffTime must be HH:mm:ss or HH:mm:ss.SSS');
  }
  const start = Date.parse(`${input.from}T00:00:00.000Z`);
  const end = Date.parse(`${input.to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('invalid replay date range');
  }
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days > 366) throw new Error('replay date range exceeds 366 days');
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    return new Date(`${date}T${input.kstCutoffTime}+09:00`).toISOString();
  });
}

type MarketBar = { sessionDate: string; close: number; knownAt: string };

export function planK4OutcomeRows(input: {
  exposureKey: string;
  anchorSessionDate: string;
  marketDataCutoff: string;
  securityBars: readonly MarketBar[];
  benchmarkBars: readonly MarketBar[];
}) {
  const cutoffAt = timestamp(input.marketDataCutoff, 'marketDataCutoff');
  const eligible = (bars: readonly MarketBar[]) =>
    [...bars]
      .filter((bar) => timestamp(bar.knownAt, 'bar.knownAt') <= cutoffAt)
      .sort((a, b) => compareText(a.sessionDate, b.sessionDate));
  const security = eligible(input.securityBars);
  const benchmark = eligible(input.benchmarkBars);
  const securityByDate = new Map(security.map((bar) => [bar.sessionDate, bar]));
  const benchmarkByDate = new Map(benchmark.map((bar) => [bar.sessionDate, bar]));
  const anchorSecurity = securityByDate.get(input.anchorSessionDate);
  const anchorBenchmark = benchmarkByDate.get(input.anchorSessionDate);
  const sessions = security
    .map((bar) => bar.sessionDate)
    .filter((date) => date > input.anchorSessionDate && benchmarkByDate.has(date));
  return [1, 5, 20].map((horizonSessions) => {
    const outcomeDate = sessions[horizonSessions - 1];
    const outcomeSecurity = outcomeDate ? securityByDate.get(outcomeDate) : undefined;
    const outcomeBenchmark = outcomeDate ? benchmarkByDate.get(outcomeDate) : undefined;
    const base = {
      outcomeKey: `k4:outcome:${input.exposureKey}:${horizonSessions}`,
      exposureKey: input.exposureKey,
      horizonSessions,
      anchorSessionDate: input.anchorSessionDate,
    };
    if (
      !anchorSecurity ||
      !anchorBenchmark ||
      !outcomeDate ||
      !outcomeSecurity ||
      !outcomeBenchmark ||
      anchorSecurity.close === 0 ||
      anchorBenchmark.close === 0
    ) {
      return {
        ...base,
        outcomeState: 'pending' as const,
        outcomeSessionDate: null,
        securityReturn: null,
        benchmarkReturn: null,
        abnormalReturn: null,
        marketDataKnownAt: null,
      };
    }
    const securityReturn = outcomeSecurity.close / anchorSecurity.close - 1;
    const benchmarkReturn = outcomeBenchmark.close / anchorBenchmark.close - 1;
    return {
      ...base,
      outcomeState: 'evaluated' as const,
      outcomeSessionDate: outcomeDate,
      securityReturn,
      benchmarkReturn,
      abnormalReturn: securityReturn - benchmarkReturn,
      marketDataKnownAt: new Date(
        Math.max(
          timestamp(anchorSecurity.knownAt, 'anchor knownAt'),
          timestamp(anchorBenchmark.knownAt, 'anchor benchmark knownAt'),
          timestamp(outcomeSecurity.knownAt, 'outcome knownAt'),
          timestamp(outcomeBenchmark.knownAt, 'outcome benchmark knownAt'),
        ),
      ).toISOString(),
    };
  });
}
