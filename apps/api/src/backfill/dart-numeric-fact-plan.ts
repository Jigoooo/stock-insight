import { createHash } from 'node:crypto';

import {
  buildNumericFactDrafts,
  dartFactKey,
  type DartStatementRow,
  type NumericFactDraft,
} from './dart-numeric-fact.ts';

/**
 * Turns DART statement rows into the rows world.numeric_fact and
 * governance.metric_definition actually take. Still pure — the runner supplies
 * the inputs and performs the writes.
 *
 * The two keys numeric_fact carries are not the same key and must not be built
 * the same way:
 *
 *   fact_key            one cell of one filing. Includes the receipt number, so a
 *                       restating filing produces a different fact_key and the
 *                       original stays addressable.
 *   restatement_group_key
 *                       the *claim* — this issuer, this concept, this period,
 *                       these dimensions. Deliberately excludes the receipt, so a
 *                       later filing restating the same quarter collides with the
 *                       first and has to land as revision 2 pointing at it.
 *
 * That collision is the mechanism, not an accident: numeric_fact's CHECK forces
 * revision_no > 1 to name what it supersedes, so a restatement cannot be written
 * as if it were an independent observation.
 */

export type DartFactContext = {
  corpCode: string;
  entityId: number;
  fiscalMonth: string | null;
  sourceRevisionId: number;
  availableAt: string;
  knownAt: string;
};

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
  fiscalYear: number;
  fiscalQuarter: number;
  dimensionsJson: Record<string, string>;
  locator: Record<string, string>;
  sourceRevisionId: number;
  availableAt: string;
  knownAt: string;
  metadata: Record<string, unknown>;
  /** Definition this fact was recorded under; the runner resolves it to an id. */
  definitionKey: string;
};

export type MetricDefinitionRow = {
  definitionKey: string;
  conceptNamespace: string;
  conceptKey: string;
  canonicalConcept: string;
  displayName: string;
  definitionScope: 'canonical' | 'issuer';
  issuerEntityId: number | null;
  periodBasis: string;
  accountingBasis: string;
  unit: string;
  currency: string | null;
  comparabilityGroupKey: string;
  comparabilityGroupVersion: number;
  effectiveFrom: string;
};

export type DartFactPlan = {
  facts: NumericFactRow[];
  definitions: MetricDefinitionRow[];
  skips: { reason: string; count: number }[];
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').slice(0, 12);
}

/**
 * The period, reduced to something a key can hold.
 *
 * An instant and a duration ending at the same moment are different claims — a
 * balance at quarter end is not the quarter's flow — so the kind is part of the
 * signature rather than only the endpoints.
 */
function periodSignature(draft: NumericFactDraft): string {
  return draft.period.kind === 'instant'
    ? `i:${draft.period.instantAt}`
    : `d:${draft.period.periodStart}:${draft.period.periodEnd}`;
}

/**
 * Which period basis a definition describes. canonical/02 §7 lists it as part of
 * the definition, and it is: an annual revenue and a quarterly revenue under the
 * same taxonomy concept are not interchangeable numbers.
 */
function periodBasisFor(draft: NumericFactDraft): string {
  if (draft.period.kind === 'instant') return 'instant';
  if (draft.fiscalQuarter === 4) return 'duration_annual';
  return draft.cumulative ? 'duration_ytd' : 'duration_quarter';
}

/**
 * A DART taxonomy concept is somebody's accounting standard; an issuer-specific
 * account is that issuer's own. The distinction decides both the definition scope
 * and — the part that matters — the comparability group.
 */
function accountingBasisFor(namespace: string): string {
  if (namespace === 'ifrs-full') return 'ifrs';
  if (namespace === 'dart') return 'k_ifrs';
  return 'internal';
}

export function definitionKeyFor(draft: NumericFactDraft): string {
  const basis = periodBasisFor(draft);
  const scoped = draft.standardConcept
    ? `${draft.conceptNamespace}.${draft.conceptKey}`
    : `${draft.conceptNamespace}.${stableHash(draft.conceptKey)}`;
  return `dart.${scoped}.${basis}.${(draft.currency ?? 'pure').toLowerCase()}`
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, '-');
}

/**
 * The comparability group is the claim "these measure the same kind of thing".
 *
 * Concept namespace, concept key and period basis — the same expression for a
 * standard taxonomy concept and an issuer's own account, because the separation
 * is already carried by the namespace: `parseDartConcept` names an issuer account
 * `dart-issuer:{corp_code}`, so two companies that both wrote 기타영업수익 get
 * different namespaces and therefore different groups. Writing a branch here that
 * appends the issuer again would be dead code claiming to do the work.
 *
 * The consequence is the point: migration 084's fallback returns COMPARABLE for a
 * shared group, so an issuer account must never share one with another issuer's.
 */
function comparabilityGroupFor(draft: NumericFactDraft): string {
  return `${draft.conceptNamespace}:${draft.conceptKey}:${periodBasisFor(draft)}`;
}

export function buildDartFactPlan(
  rows: readonly DartStatementRow[],
  context: DartFactContext,
): DartFactPlan {
  const facts: NumericFactRow[] = [];
  const definitions = new Map<string, MetricDefinitionRow>();
  const skipCounts = new Map<string, number>();
  const seenFactKeys = new Set<string>();

  for (const row of rows) {
    const { drafts, skips } = buildNumericFactDrafts(row, { fiscalMonth: context.fiscalMonth });
    for (const skip of skips) {
      skipCounts.set(skip.reason, (skipCounts.get(skip.reason) ?? 0) + 1);
    }

    for (const draft of drafts) {
      const factKey = dartFactKey(draft);
      if (seenFactKeys.has(factKey)) {
        // Two cells that address identically inside one filing would be
        // indistinguishable afterwards. Counting them is better than writing one
        // and silently dropping the other.
        skipCounts.set(
          'duplicate cell address within one filing',
          (skipCounts.get('duplicate cell address within one filing') ?? 0) + 1,
        );
        continue;
      }
      seenFactKeys.add(factKey);

      const definitionKey = definitionKeyFor(draft);
      if (!definitions.has(definitionKey)) {
        definitions.set(definitionKey, {
          definitionKey,
          conceptNamespace: draft.conceptNamespace,
          conceptKey: draft.conceptKey,
          canonicalConcept: draft.conceptKey,
          displayName: draft.dimensions.accountName ?? draft.conceptKey,
          definitionScope: draft.standardConcept ? 'canonical' : 'issuer',
          issuerEntityId: draft.standardConcept ? null : context.entityId,
          periodBasis: periodBasisFor(draft),
          accountingBasis: accountingBasisFor(draft.conceptNamespace),
          unit: draft.unit,
          currency: draft.currency,
          comparabilityGroupKey: comparabilityGroupFor(draft),
          comparabilityGroupVersion: 1,
          effectiveFrom: context.availableAt,
        });
      }

      facts.push({
        factKey,
        restatementGroupKey: [
          'dart',
          context.entityId,
          draft.conceptNamespace,
          draft.conceptKey,
          periodSignature(draft),
          stableHash(draft.dimensions),
          draft.cumulative ? 'cum' : 'period',
        ].join(':'),
        entityId: context.entityId,
        conceptNamespace: draft.conceptNamespace,
        conceptKey: draft.conceptKey,
        value: draft.value,
        unit: draft.unit,
        currency: draft.currency,
        // DART reports whole won, not thousands. Anything else would need the
        // filing's own unit statement, which this endpoint does not carry.
        scalePower: 0,
        periodStart: draft.period.kind === 'duration' ? draft.period.periodStart : null,
        periodEnd: draft.period.kind === 'duration' ? draft.period.periodEnd : null,
        instantAt: draft.period.kind === 'instant' ? draft.period.instantAt : null,
        fiscalYear: draft.fiscalYear,
        fiscalQuarter: draft.fiscalQuarter,
        dimensionsJson: draft.dimensions,
        locator: draft.locator as unknown as Record<string, string>,
        sourceRevisionId: context.sourceRevisionId,
        availableAt: context.availableAt,
        knownAt: context.knownAt,
        metadata: { corpCode: context.corpCode, standardConcept: draft.standardConcept },
        definitionKey,
      });
    }
  }

  return {
    facts,
    definitions: [...definitions.values()],
    skips: [...skipCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
  };
}
