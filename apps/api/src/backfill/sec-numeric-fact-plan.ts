import { createHash } from 'node:crypto';

import { type MetricDefinitionRow, type NumericFactRow, type Skip } from './numeric-fact-plan.ts';
import { type SecNumericFactDraft } from './sec-numeric-fact.ts';

export type SecFactPlan = {
  facts: NumericFactRow[];
  definitions: MetricDefinitionRow[];
  skips: Skip[];
};

export type SecFactPlanContext = { sourceId: number; definitionEffectiveFrom: string };

export type FoldedFinancialFact = {
  entityId: number;
  concept: string;
  value: number;
  unit: string;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string;
  fiscalPeriod: string | null;
  filingRef: string;
};

export type SecFinancialConceptMapping = {
  concept: string;
  usGaapTags: readonly string[];
  unitClass: 'currency' | 'shares' | 'pure';
};

export type SecParityResult = {
  comparable: number;
  agreed: number;
  disagreed: number;
  excluded: number;
  disagreementSamples: Array<{
    factKey: string;
    concept: string;
    canonicalValue: number;
    foldedValue: number;
  }>;
};

const DEFINITION_KEY_MAX_LENGTH = 128;
function stableHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function daysInclusive(start: string, end: string): number {
  return (
    Math.floor(
      (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000,
    ) + 1
  );
}

function periodBasisFor(draft: SecNumericFactDraft): MetricDefinitionRow['periodBasis'] {
  if (draft.instantAt !== null) return 'instant';
  const days = daysInclusive(draft.periodStart!, draft.periodEnd!);
  if (days >= 330) return 'duration_annual';
  if (days <= 100) return 'duration_quarter';
  return 'duration_ytd';
}

function accountingBasisFor(taxonomy: string): MetricDefinitionRow['accountingBasis'] {
  const normalized = taxonomy.toLowerCase();
  if (normalized === 'us-gaap') return 'gaap';
  if (normalized === 'ifrs-full' || normalized === 'ifrs') return 'ifrs';
  return 'unknown';
}

function unitIdentity(draft: SecNumericFactDraft): string {
  return draft.unit === 'currency' ? draft.currency! : draft.unit;
}

function boundedDefinitionKey(draft: SecNumericFactDraft, periodBasis: string): string {
  const raw = `sec.${draft.conceptNamespace}.${draft.conceptKey}.${periodBasis}.${unitIdentity(draft)}`;
  const sanitized = raw.toLowerCase().replace(/[^a-z0-9._:-]/g, '-');
  if (sanitized.length <= DEFINITION_KEY_MAX_LENGTH) return sanitized;
  const digest = `.${stableHash(sanitized)}`;
  return sanitized.slice(0, DEFINITION_KEY_MAX_LENGTH - digest.length) + digest;
}

function comparabilityGroupFor(draft: SecNumericFactDraft, periodBasis: string): string {
  return [
    'sec-regulator',
    draft.conceptNamespace,
    draft.conceptKey,
    periodBasis,
    draft.unit,
    draft.currency ?? '-',
  ].join(':');
}

export function buildSecFactPlan(
  drafts: readonly SecNumericFactDraft[],
  context: SecFactPlanContext,
): SecFactPlan {
  const facts: NumericFactRow[] = [];
  const definitions = new Map<string, MetricDefinitionRow>();
  if (!Number.isFinite(Date.parse(context.definitionEffectiveFrom))) {
    throw new Error('SEC definition effective time is invalid');
  }
  const definitionEffectiveFrom = new Date(context.definitionEffectiveFrom).toISOString();

  const orderedDrafts = [...drafts].sort(
    (left, right) =>
      left.knownAt.localeCompare(right.knownAt) ||
      left.sourceRevisionId - right.sourceRevisionId ||
      left.locator.accession.localeCompare(right.locator.accession) ||
      left.locator.entryIdentity.localeCompare(right.locator.entryIdentity) ||
      left.factKey.localeCompare(right.factKey),
  );

  for (const draft of orderedDrafts) {
    const periodBasis = periodBasisFor(draft);
    const definitionKey = boundedDefinitionKey(draft, periodBasis);
    if (!definitions.has(definitionKey))
      definitions.set(definitionKey, {
        definitionKey,
        conceptNamespace: draft.conceptNamespace,
        conceptKey: draft.conceptKey,
        canonicalConcept: draft.conceptKey,
        displayName: draft.conceptKey,
        definitionScope: 'regulator',
        issuerEntityId: null,
        sourceId: context.sourceId,
        periodBasis,
        accountingBasis: accountingBasisFor(draft.conceptNamespace),
        unit: draft.unit,
        currency: draft.currency,
        comparabilityGroupKey: comparabilityGroupFor(draft, periodBasis),
        comparabilityGroupVersion: 1,
        effectiveFrom: definitionEffectiveFrom,
      });

    facts.push({
      factKey: draft.factKey,
      restatementGroupKey: draft.restatementGroupKey,
      entityId: draft.entityId,
      conceptNamespace: draft.conceptNamespace,
      conceptKey: draft.conceptKey,
      value: draft.value,
      unit: draft.unit,
      currency: draft.currency,
      scalePower: draft.scalePower,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      instantAt: draft.instantAt,
      fiscalYear: draft.fiscalYear,
      fiscalQuarter: draft.fiscalQuarter,
      dimensionsJson: draft.dimensionsJson,
      locator: draft.locator as unknown as Record<string, unknown>,
      sourceRevisionId: draft.sourceRevisionId,
      availableAt: draft.availableAt,
      knownAt: draft.knownAt,
      metadata: draft.metadata,
      definitionKey,
      revisionSortKey: [
        draft.locator.filed,
        draft.availableAt,
        draft.knownAt,
        String(draft.sourceRevisionId).padStart(20, '0'),
        draft.locator.accession,
        draft.locator.entryIdentity,
      ].join('|'),
      suppressUnchangedRevision: true,
    });
  }

  facts.sort((left, right) => left.factKey.localeCompare(right.factKey));
  return {
    facts,
    definitions: [...definitions.values()].sort((left, right) =>
      left.definitionKey.localeCompare(right.definitionKey),
    ),
    skips: [],
  };
}

function parityKey(parts: readonly unknown[]): string {
  return JSON.stringify(parts);
}

export function checkSecFinancialParity(
  facts: readonly NumericFactRow[],
  foldedFacts: readonly FoldedFinancialFact[],
  mappings: readonly SecFinancialConceptMapping[],
): SecParityResult {
  const result: SecParityResult = {
    comparable: 0,
    agreed: 0,
    disagreed: 0,
    excluded: 0,
    disagreementSamples: [],
  };
  const mappingByTag = new Map<string, SecFinancialConceptMapping>();
  for (const mapping of mappings) {
    for (const tag of mapping.usGaapTags) mappingByTag.set(tag, mapping);
  }
  const foldedByKey = new Map<string, FoldedFinancialFact>();
  for (const folded of foldedFacts) {
    const key = parityKey([
      folded.entityId,
      folded.concept,
      folded.periodStart,
      folded.periodEnd,
      folded.filingRef,
      folded.unit,
      folded.currency,
    ]);
    if (!foldedByKey.has(key)) foldedByKey.set(key, folded);
  }

  for (const fact of facts) {
    const mapping =
      fact.conceptNamespace === 'us-gaap' ? mappingByTag.get(fact.conceptKey) : undefined;
    const locator = fact.locator;
    const periodBasis =
      fact.instantAt !== null
        ? 'instant'
        : daysInclusive(fact.periodStart!, fact.periodEnd!) > 100 &&
            daysInclusive(fact.periodStart!, fact.periodEnd!) < 330
          ? 'duration_ytd'
          : 'comparable';
    if (!mapping || periodBasis === 'duration_ytd') {
      result.excluded += 1;
      continue;
    }
    const periodEnd = (fact.instantAt ?? fact.periodEnd)!.slice(0, 10);
    const foldedUnit = mapping.unitClass === 'currency' ? fact.currency : mapping.unitClass;
    const foldedCurrency = mapping.unitClass === 'currency' ? fact.currency : null;
    const candidate = foldedByKey.get(
      parityKey([
        fact.entityId,
        mapping.concept,
        fact.periodStart,
        periodEnd,
        locator.accession,
        foldedUnit,
        foldedCurrency,
      ]),
    );
    if (!candidate) {
      result.excluded += 1;
      continue;
    }

    result.comparable += 1;
    if (Math.abs(candidate.value - fact.value) < 1) {
      result.agreed += 1;
      continue;
    }
    result.disagreed += 1;
    if (result.disagreementSamples.length < 10) {
      result.disagreementSamples.push({
        factKey: fact.factKey,
        concept: mapping.concept,
        canonicalValue: fact.value,
        foldedValue: candidate.value,
      });
    }
  }

  return result;
}
