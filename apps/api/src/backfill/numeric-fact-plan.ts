import { createHash } from 'node:crypto';

export type NumericFactRow = {
  factKey: string;
  restatementGroupKey: string;
  entityId: number;
  conceptNamespace: string;
  conceptKey: string;
  value: number;
  unit: string;
  currency: string | null;
  scalePower: number;
  periodStart: string | null;
  periodEnd: string | null;
  instantAt: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  dimensionsJson: Record<string, string>;
  locator: Record<string, unknown>;
  sourceRevisionId: number;
  availableAt: string;
  knownAt: string;
  metadata: Record<string, unknown>;
  definitionKey: string;
  /** Provider adapter supplies chronology; factKey is only the final tie-breaker. */
  revisionSortKey?: string;
  /** SEC comparative repetition is not a restatement when the claim is unchanged. */
  suppressUnchangedRevision?: boolean;
};

export type MetricDefinitionRow = {
  definitionKey: string;
  conceptNamespace: string;
  conceptKey: string;
  canonicalConcept: string;
  displayName: string;
  definitionScope: 'canonical' | 'issuer' | 'source' | 'regulator';
  issuerEntityId: number | null;
  sourceId?: number | null;
  periodBasis: string;
  accountingBasis: string;
  unit: string;
  currency: string | null;
  comparabilityGroupKey: string;
  comparabilityGroupVersion: number;
  effectiveFrom: string;
};

export type Skip = { reason: string; count: number };

export type GroupState = {
  maxRevision: number;
  latestFactId: number | null;
  latestFactKey?: string | null;
  factIdsByKey?: ReadonlyMap<string, number>;
  latestSemanticFingerprint?: string;
};

export type ExistingNumericFactState = {
  factKeys: ReadonlySet<string>;
  groups: ReadonlyMap<string, GroupState>;
};

export type PlannedWrite = {
  fact: NumericFactRow;
  revisionNo: number;
  /** Exact logical predecessor, including an earlier write in this same plan. */
  supersedesFactKey: string | null;
  /** Exact existing predecessor id when it was already present in the database. */
  supersedesNumericFactId: number | null;
};

export type SchemaViolation = { rule: string; count: number; example: string };

function bump(counts: Map<string, number>, reason: string): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function sortedSkips(counts: Map<string, number>): Skip[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => left.reason.localeCompare(right.reason));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function numericFactSemanticFingerprint(fact: NumericFactRow): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          entityId: fact.entityId,
          conceptNamespace: fact.conceptNamespace,
          conceptKey: fact.conceptKey,
          value: fact.value,
          unit: fact.unit,
          currency: fact.currency,
          scalePower: fact.scalePower,
          periodStart: fact.periodStart,
          periodEnd: fact.periodEnd,
          instantAt: fact.instantAt,
          fiscalYear: fact.fiscalYear,
          fiscalQuarter: fact.fiscalQuarter,
          dimensionsJson: fact.dimensionsJson,
          definitionKey: fact.definitionKey,
        }),
      ),
      'utf8',
    )
    .digest('hex');
}

/**
 * Assigns deterministic N-1 revision chains without provider-specific chronology.
 * Provider adapters own revisionSortKey; this boundary owns existing-state and
 * same-batch duplicate handling, semantic repetition, and exact predecessor data.
 */
export function assignRevisions(
  facts: readonly NumericFactRow[],
  existing: ExistingNumericFactState,
): { writes: PlannedWrite[]; skips: Skip[] } {
  const counts = new Map<string, number>();
  const ordered = [...facts].sort((left, right) => {
    const leftKey = left.revisionSortKey ?? left.factKey;
    const rightKey = right.revisionSortKey ?? right.factKey;
    const chronology = leftKey.localeCompare(rightKey);
    return chronology !== 0 ? chronology : left.factKey.localeCompare(right.factKey);
  });
  const groupsWithRecordedInput = new Set(
    ordered
      .filter((fact) => existing.factKeys.has(fact.factKey))
      .map((fact) => fact.restatementGroupKey),
  );
  const semanticFingerprints = new Map<string, string>();
  for (const [groupKey, state] of existing.groups) {
    if (!groupsWithRecordedInput.has(groupKey) && state.latestSemanticFingerprint !== undefined) {
      semanticFingerprints.set(groupKey, state.latestSemanticFingerprint);
    }
  }

  // Comparative suppression is a property of the ordered source chronology, not
  // the database's final persisted value. Replaying it before reconciliation keeps
  // a full rerun at the same canonical fixed point while still allowing a bounded
  // incremental batch to compare against the latest persisted semantic value.
  const seenInputFactKeys = new Set<string>();
  const canonicalFacts: NumericFactRow[] = [];
  for (const fact of ordered) {
    if (seenInputFactKeys.has(fact.factKey)) {
      bump(counts, 'already planned');
      continue;
    }
    seenInputFactKeys.add(fact.factKey);

    const semanticFingerprint = numericFactSemanticFingerprint(fact);
    if (
      fact.suppressUnchangedRevision === true &&
      semanticFingerprints.get(fact.restatementGroupKey) === semanticFingerprint
    ) {
      bump(counts, 'unchanged comparative repetition');
      continue;
    }
    semanticFingerprints.set(fact.restatementGroupKey, semanticFingerprint);
    canonicalFacts.push(fact);
  }

  const groups = new Map<string, GroupState>();
  for (const [key, value] of existing.groups) groups.set(key, { ...value });
  const plannedFactKeys = new Set(existing.factKeys);
  const writes: PlannedWrite[] = [];

  for (const fact of canonicalFacts) {
    if (plannedFactKeys.has(fact.factKey)) {
      bump(counts, existing.factKeys.has(fact.factKey) ? 'already recorded' : 'already planned');
      continue;
    }
    plannedFactKeys.add(fact.factKey);

    const state = groups.get(fact.restatementGroupKey) ?? {
      maxRevision: 0,
      latestFactId: null,
      latestFactKey: null,
    };
    const semanticFingerprint = numericFactSemanticFingerprint(fact);
    const revisionNo = state.maxRevision + 1;
    const predecessorKey = revisionNo > 1 ? (state.latestFactKey ?? null) : null;
    if (revisionNo > 1 && predecessorKey === null) {
      throw new Error(
        `revision ${revisionNo} of ${fact.restatementGroupKey} has no exact predecessor fact key`,
      );
    }
    const predecessorId =
      predecessorKey === null ? null : (state.factIdsByKey?.get(predecessorKey) ?? null);
    writes.push({
      fact,
      revisionNo,
      supersedesFactKey: predecessorKey,
      supersedesNumericFactId: predecessorId ?? null,
    });
    groups.set(fact.restatementGroupKey, {
      maxRevision: revisionNo,
      latestFactId: null,
      latestFactKey: fact.factKey,
      latestSemanticFingerprint: semanticFingerprint,
    });
  }

  return { writes, skips: sortedSkips(counts) };
}

const DEFINITION_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const PERIOD_BASES = new Set([
  'instant',
  'duration_quarter',
  'duration_ytd',
  'duration_ttm',
  'duration_annual',
]);
const ACCOUNTING_BASES = new Set([
  'gaap',
  'ifrs',
  'k_ifrs',
  'non_gaap',
  'statutory',
  'internal',
  'unknown',
]);

export function findSchemaViolations(
  input:
    | readonly NumericFactRow[]
    | { facts: readonly NumericFactRow[]; definitions: readonly MetricDefinitionRow[] },
  definitionRows?: readonly MetricDefinitionRow[],
): SchemaViolation[] {
  const planInput = input as {
    facts: readonly NumericFactRow[];
    definitions: readonly MetricDefinitionRow[];
  };
  const facts = Array.isArray(input) ? input : planInput.facts;
  const definitions = Array.isArray(input) ? (definitionRows ?? []) : planInput.definitions;
  const found = new Map<string, { count: number; example: string }>();
  const record = (rule: string, example: string): void => {
    const current = found.get(rule);
    if (current) current.count += 1;
    else found.set(rule, { count: 1, example });
  };

  for (const fact of facts) {
    const at = fact.factKey;
    if (fact.factKey.trim() === '') record('fact_key must not be blank', at);
    if (fact.restatementGroupKey.trim() === '') record('restatement_group_key blank', at);
    if (fact.conceptNamespace.trim() === '') record('concept_namespace blank', at);
    if (fact.conceptKey.trim() === '') record('concept_key blank', at);
    if (fact.unit.trim() === '') record('unit blank', at);
    if (!Number.isFinite(fact.value)) record('value not a finite number', at);
    if (fact.currency !== null && !CURRENCY_PATTERN.test(fact.currency)) {
      record('currency must be three upper-case letters', at);
    }
    if (fact.currency !== null && fact.unit !== 'currency') {
      record('currency is allowed only when unit is currency', at);
    }
    if (fact.unit === 'currency' && fact.currency === null) {
      record('currency unit must name an ISO currency', at);
    }
    if (fact.scalePower < -18 || fact.scalePower > 18) record('scale_power out of range', at);
    if (new Date(fact.knownAt).getTime() < new Date(fact.availableAt).getTime()) {
      record('known_at before available_at', at);
    }
    const hasInstant = fact.instantAt !== null;
    const hasPeriod = fact.periodEnd !== null;
    if (hasInstant === hasPeriod) record('must fill exactly one of instant or period', at);
    if (hasInstant && (fact.periodStart !== null || fact.periodEnd !== null)) {
      record('an instant must not carry a period', at);
    }
    if (hasPeriod && fact.periodStart !== null && fact.periodEnd! < fact.periodStart) {
      record('period ends before it starts', at);
    }
    if (fact.fiscalYear !== null && (fact.fiscalYear < 1800 || fact.fiscalYear > 3000)) {
      record('fiscal_year out of range', at);
    }
    if (fact.fiscalQuarter !== null && (fact.fiscalQuarter < 1 || fact.fiscalQuarter > 4)) {
      record('fiscal_quarter out of range', at);
    }
  }

  for (const definition of definitions) {
    const at = definition.definitionKey;
    if (!DEFINITION_KEY_PATTERN.test(at)) record('definition_key fails its pattern', at);
    if (definition.canonicalConcept.trim() === '') record('canonical_concept blank', at);
    if (definition.displayName.trim() === '') record('display_name blank', at);
    if (definition.comparabilityGroupKey.trim() === '') record('comparability_group_key blank', at);
    if (!PERIOD_BASES.has(definition.periodBasis)) record('period_basis not in the enum', at);
    if (!ACCOUNTING_BASES.has(definition.accountingBasis))
      record('accounting_basis not in the enum', at);
    if (definition.definitionScope === 'issuer' && definition.issuerEntityId === null) {
      record('issuer-scoped definition names no issuer', at);
    }
    if (definition.definitionScope === 'source' && definition.sourceId == null) {
      record('source-scoped definition names no source', at);
    }
    if ((definition.unit === 'currency') !== (definition.currency !== null)) {
      record('definition currency must exist exactly for currency unit', at);
    }
    if (definition.comparabilityGroupVersion < 1) record('comparability_group_version below 1', at);
  }

  return [...found.entries()]
    .map(([rule, { count, example }]) => ({ rule, count, example }))
    .sort((left, right) => right.count - left.count || left.rule.localeCompare(right.rule));
}
