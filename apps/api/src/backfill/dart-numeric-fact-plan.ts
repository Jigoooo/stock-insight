import { createHash } from 'node:crypto';

import {
  buildNumericFactDrafts,
  dartFactKey,
  type DartStatementRow,
  type NumericFactDraft,
} from './dart-numeric-fact.ts';
import {
  assignRevisions as assignSharedRevisions,
  findSchemaViolations as findSharedSchemaViolations,
  type ExistingNumericFactState,
  type GroupState,
  type MetricDefinitionRow,
  type NumericFactRow,
  type PlannedWrite,
  type SchemaViolation,
  type Skip,
} from './numeric-fact-plan.ts';

export type {
  GroupState,
  MetricDefinitionRow,
  NumericFactRow,
  PlannedWrite,
  SchemaViolation,
  Skip,
} from './numeric-fact-plan.ts';

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

export type DartFactPlan = {
  facts: NumericFactRow[];
  definitions: MetricDefinitionRow[];
  skips: Skip[];
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

/**
 * Migration 084 caps definition_key at 128 characters, and IFRS concept names go
 * past it. Measured 2026-08-08: 89 of 6,100 keys overflowed, the worst being
 * ShareOfOtherComprehensiveIncomeOfAssociatesAndJointVenturesAccountedForUsing
 * EquityMethodThatWillBeReclassifiedToProfitOrLossNetOfTax at 160 characters.
 */
const DEFINITION_KEY_MAX_LENGTH = 128;

export function definitionKeyFor(draft: NumericFactDraft): string {
  const basis = periodBasisFor(draft);
  const scoped = draft.standardConcept
    ? `${draft.conceptNamespace}.${draft.conceptKey}`
    : `${draft.conceptNamespace}.${stableHash(draft.conceptKey)}`;
  const head = `dart.${scoped}`.toLowerCase().replace(/[^a-z0-9._:-]/g, '-');
  const tail = `.${basis}.${(draft.currency ?? 'pure').toLowerCase()}`;

  if (head.length + tail.length <= DEFINITION_KEY_MAX_LENGTH) return head + tail;

  // Truncating alone would collide two concepts sharing a long prefix — IFRS has
  // several — so the digest of the whole head carries the identity and the
  // truncation only keeps the key legible.
  const digest = `.${stableHash(head)}`;
  const room = DEFINITION_KEY_MAX_LENGTH - tail.length - digest.length;
  return head.slice(0, room) + digest + tail;
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
          // Which statement the line was presented in. A Korean filing routinely
          // states one concept in two statements — measured 2026-08-08, 988
          // groups collided this way, every one of them inside a single filing
          // with identical values in 손익계산서 and 포괄손익계산서. Leaving the
          // division out made the second presentation look like a revision
          // superseding the first, inventing a restatement history that never
          // happened.
          //
          // The rule for what belongs here is what does *not* change between an
          // original and its restatement. A correction re-files the same line of
          // the same statement, so the division stays; the receipt number
          // changes, so it goes. Comparability across statements is a separate
          // question and lives in metric_definition's comparability group, which
          // deliberately ignores the division.
          draft.locator.statementDivision,
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
        revisionSortKey: [
          draft.locator.receiptNo,
          context.availableAt,
          context.knownAt,
          String(context.sourceRevisionId).padStart(20, '0'),
          factKey,
        ].join('|'),
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

export function assignRevisions(
  facts: readonly NumericFactRow[],
  existing: ExistingNumericFactState,
): { writes: PlannedWrite[]; skips: Skip[] } {
  return assignSharedRevisions(facts, existing);
}

export type ParityResult = {
  comparable: number;
  agreed: number;
  disagreed: number;
  samples: { entityId: number; concept: string; periodEnd: string; ours: number; theirs: number }[];
};

/**
 * Compares the new facts against market.financial_fact where the two overlap.
 *
 * They are built from the same endpoint by different code, so on the 9 concepts
 * the folded table carries there is no reason for the numbers to differ. A
 * disagreement means one of the two is wrong, and this is the cheapest place to
 * find that out. Report only — the folded table assumes a December close for
 * every issuer, so it is not an authority, just a second opinion.
 *
 * Only undimensioned statement totals are comparable. 자본변동표 restates equity
 * once per component, so `ifrs-full_Equity` arrives many times for one period —
 * measured 2026-08-08, entity 487 alone produced four values for 2022-12-31 that
 * sum to the total the folded table holds. That table keeps whichever row it met
 * first (ON CONFLICT DO NOTHING), so it has no component breakdown to compare
 * against. A fact carrying an accountDetail is a piece of a total, not the total.
 *
 * Only the quarter-only facts are comparable. run-dart-financial-facts.ts:313
 * reads `thstrm_amount` and never `thstrm_add_amount`, and stores one date per
 * fact, so a quarterly report leaves it holding the quarter. We emit both the
 * quarter and the year to date, and both end on the same day — comparing the
 * cumulative one against their quarter would report a disagreement that is really
 * two different spans. Measured 2026-08-08, that alone accounted for 5,797 of the
 * 19,366 comparisons.
 */
export function checkParity(
  facts: readonly NumericFactRow[],
  conceptByAccount: ReadonlyMap<string, string>,
  theirs: ReadonlyMap<string, number>,
): ParityResult {
  const result: ParityResult = { comparable: 0, agreed: 0, disagreed: 0, samples: [] };

  for (const fact of facts) {
    if (fact.locator.amountField !== 'thstrm_amount') continue;
    if (fact.dimensionsJson.accountDetail !== undefined) continue;
    const accountId =
      typeof fact.locator.accountId === 'string' ? fact.locator.accountId : undefined;
    const concept = accountId ? conceptByAccount.get(accountId) : undefined;
    if (!concept) continue;
    // The folded table stores one date per fact, so compare on whichever of the
    // two period columns this fact filled.
    const periodEnd = (fact.instantAt ?? fact.periodEnd)?.slice(0, 10);
    if (!periodEnd) continue;

    const theirValue = theirs.get(`${fact.entityId}|${concept}|${periodEnd}`);
    if (theirValue === undefined) continue;

    result.comparable += 1;
    if (Math.abs(theirValue - fact.value) < 1) {
      result.agreed += 1;
      continue;
    }
    result.disagreed += 1;
    if (result.samples.length < 10) {
      result.samples.push({
        entityId: fact.entityId,
        concept,
        periodEnd,
        ours: fact.value,
        theirs: theirValue,
      });
    }
  }

  return result;
}

/**
 * Checks every planned row against the constraints the tables actually declare,
 * before a transaction is opened.
 *
 * A CHECK violation inside a 168,417-row insert aborts the whole transaction and
 * reports one row, which tells you nothing about how many others are wrong. This
 * runs in the dry-run, over every row, and names each rule that failed with a
 * count — so a data problem is a report rather than a rollback.
 *
 * The rules are transcribed from migrations 031 (numeric_fact) and 084
 * (metric_definition). They are a copy, and a copy can drift: the migration is
 * the authority and this is an early warning, not a substitute.
 */
export function findSchemaViolations(
  facts: readonly NumericFactRow[],
  definitions: readonly MetricDefinitionRow[],
): SchemaViolation[] {
  return findSharedSchemaViolations(facts, definitions);
}
