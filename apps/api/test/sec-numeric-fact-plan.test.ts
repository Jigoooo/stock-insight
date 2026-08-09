import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignRevisions,
  findSchemaViolations,
  numericFactSemanticFingerprint,
  type GroupState,
} from '../src/backfill/numeric-fact-plan.ts';
import {
  buildSecFactPlan,
  checkSecFinancialParity,
  type FoldedFinancialFact,
} from '../src/backfill/sec-numeric-fact-plan.ts';

const PLAN_CONTEXT = {
  sourceId: 7,
  definitionEffectiveFrom: '2020-06-15T12:34:56.000Z',
} as const;
import {
  expandSecCompanyFacts,
  type SecCompanyFactsPayload,
  type SecNumericFactDraft,
  type SecUnitEntry,
} from '../src/backfill/sec-numeric-fact.ts';

const CIK = '0000320193';
const TAG = 'RevenueFromContractWithCustomerExcludingAssessedTax';

function entry(overrides: Partial<SecUnitEntry> = {}): SecUnitEntry {
  return {
    start: '2024-10-01',
    end: '2024-12-31',
    val: 100,
    accn: '0000320193-25-000008',
    fy: 2025,
    fp: 'Q1',
    form: '10-Q',
    filed: '2025-01-31',
    frame: 'CY2024Q4',
    ...overrides,
  };
}

function draft(
  options: {
    taxonomy?: string;
    tag?: string;
    rawUnit?: string;
    unitEntry?: SecUnitEntry;
    sourceRevisionId?: number;
    ingestedAt?: string;
  } = {},
): SecNumericFactDraft {
  const taxonomy = options.taxonomy ?? 'us-gaap';
  const tag = options.tag ?? TAG;
  const rawUnit = options.rawUnit ?? 'USD';
  const payload: SecCompanyFactsPayload = {
    cik: 320193,
    entityName: 'Apple Inc.',
    facts: {
      [taxonomy]: {
        [tag]: {
          label: 'Revenue',
          description: 'Revenue from contracts with customers.',
          units: { [rawUnit]: [options.unitEntry ?? entry()] },
        },
      },
    },
  };
  const expansion = expandSecCompanyFacts(payload, {
    canonicalCik: CIK,
    entityId: 41,
    sourceRevisionId: options.sourceRevisionId ?? 10,
    ingestedAt: options.ingestedAt ?? '2025-02-01T02:03:04.000Z',
    sinceYear: 2024,
  });
  assert.equal(expansion.skips.length, 0);
  assert.equal(expansion.drafts.length, 1);
  return expansion.drafts[0]!;
}

describe('SEC numeric-fact plan definitions', () => {
  it('uses the source registration time as the truthful stable definition effective time', () => {
    const plan = buildSecFactPlan([draft()], {
      sourceId: 7,
      definitionEffectiveFrom: '2020-06-15T12:34:56.000Z',
    });
    assert.equal(plan.definitions[0]?.effectiveFrom, '2020-06-15T12:34:56.000Z');
    assert.notEqual(plan.definitions[0]?.effectiveFrom, '1970-01-01T00:00:00.000Z');
  });

  it('builds a regulator GAAP definition and carries its exact key on the fact', () => {
    const plan = buildSecFactPlan([draft()], PLAN_CONTEXT);

    assert.equal(plan.facts.length, 1);
    assert.equal(plan.definitions.length, 1);
    assert.equal(plan.facts[0]?.definitionKey, plan.definitions[0]?.definitionKey);
    assert.deepEqual(
      {
        scope: plan.definitions[0]?.definitionScope,
        sourceId: plan.definitions[0]?.sourceId,
        basis: plan.definitions[0]?.accountingBasis,
        period: plan.definitions[0]?.periodBasis,
        unit: plan.definitions[0]?.unit,
        currency: plan.definitions[0]?.currency,
      },
      {
        scope: 'regulator',
        sourceId: 7,
        basis: 'gaap',
        period: 'duration_quarter',
        unit: 'currency',
        currency: 'USD',
      },
    );
  });

  it('maps IFRS taxonomies to IFRS and leaves unknown taxonomies explicit', () => {
    const ifrs = buildSecFactPlan([draft({ taxonomy: 'ifrs-full' })], PLAN_CONTEXT);
    const unknown = buildSecFactPlan([draft({ taxonomy: 'custom-apple' })], PLAN_CONTEXT);

    assert.equal(ifrs.definitions[0]?.accountingBasis, 'ifrs');
    assert.equal(unknown.definitions[0]?.accountingBasis, 'unknown');
  });

  it('bounds long definition keys without collapsing distinct tags', () => {
    const prefix = 'ExtremelyLongRegulatorConceptName'.repeat(6);
    const first = buildSecFactPlan([draft({ tag: `${prefix}Alpha` })], PLAN_CONTEXT);
    const second = buildSecFactPlan([draft({ tag: `${prefix}Beta` })], PLAN_CONTEXT);
    const firstKey = first.definitions[0]!.definitionKey;
    const secondKey = second.definitions[0]!.definitionKey;

    assert.ok(firstKey.length <= 128);
    assert.ok(/^[a-z0-9][a-z0-9._:-]*$/.test(firstKey));
    assert.notEqual(firstKey, secondKey);
  });

  it('separates definition and comparability groups by period and normalized unit', () => {
    const instant = draft({
      rawUnit: 'shares',
      unitEntry: entry({ start: undefined, fp: 'FY', form: '10-K' }),
    });
    const annual = draft({
      rawUnit: 'pure',
      unitEntry: entry({ start: '2024-01-01', fp: 'FY', form: '10-K' }),
    });
    const currency = draft();
    const plan = buildSecFactPlan([instant, annual, currency], PLAN_CONTEXT);

    assert.deepEqual(
      plan.definitions.map((definition) => [
        definition.periodBasis,
        definition.unit,
        definition.currency,
      ]),
      [
        ['duration_annual', 'pure', null],
        ['duration_quarter', 'currency', 'USD'],
        ['instant', 'shares', null],
      ],
    );
    assert.equal(new Set(plan.definitions.map((row) => row.comparabilityGroupKey)).size, 3);
  });

  it('keeps regulator definitions stable across input order, label drift, and bounded selections', () => {
    const first = draft();
    first.metadata = { ...first.metadata, label: 'Original filing label' };
    const later = draft({
      sourceRevisionId: 20,
      ingestedAt: '2026-02-01T00:00:00.000Z',
      unitEntry: entry({ accn: '0000320193-26-000010', filed: '2026-01-31' }),
    });
    later.metadata = { ...later.metadata, label: 'Renamed in a later taxonomy presentation' };

    const forward = buildSecFactPlan([first, later], PLAN_CONTEXT).definitions;
    const reversed = buildSecFactPlan([later, first], PLAN_CONTEXT).definitions;
    const earlySelection = buildSecFactPlan([first], PLAN_CONTEXT).definitions;
    const laterSelection = buildSecFactPlan([later], PLAN_CONTEXT).definitions;

    assert.deepEqual(forward, reversed);
    assert.deepEqual(forward, earlySelection);
    assert.deepEqual(earlySelection, laterSelection);
    assert.equal(forward[0]?.displayName, TAG);
    assert.equal(forward[0]?.effectiveFrom, PLAN_CONTEXT.definitionEffectiveFrom);
  });
});

describe('provider-neutral revision assignment', () => {
  function revisions() {
    const original = draft();
    const amendment = draft({
      sourceRevisionId: 11,
      ingestedAt: '2025-02-07T00:00:00.000Z',
      unitEntry: entry({
        val: 120,
        accn: '0000320193-25-000020',
        form: '10-Q/A',
        filed: '2025-02-06',
      }),
    });
    return { original, amendment };
  }

  it('assigns amendment revisions deterministically independent of input order', () => {
    const { original, amendment } = revisions();
    const facts = buildSecFactPlan([amendment, original], PLAN_CONTEXT).facts;
    const { writes } = assignRevisions(facts, {
      factKeys: new Set(),
      groups: new Map(),
    });

    assert.deepEqual(
      writes.map(({ fact, revisionNo, supersedesFactKey }) => ({
        factKey: fact.factKey,
        revisionNo,
        supersedesFactKey,
      })),
      [
        { factKey: original.factKey, revisionNo: 1, supersedesFactKey: null },
        { factKey: amendment.factKey, revisionNo: 2, supersedesFactKey: original.factKey },
      ],
    );
  });

  it('skips exact existing facts and points the next revision at the exact predecessor', () => {
    const { original, amendment } = revisions();
    const state: GroupState = {
      maxRevision: 1,
      latestFactId: 77,
      latestFactKey: original.factKey,
      factIdsByKey: new Map([[original.factKey, 77]]),
      latestSemanticFingerprint: undefined,
    };
    const { writes } = assignRevisions(
      buildSecFactPlan([original, amendment], PLAN_CONTEXT).facts,
      {
        factKeys: new Set([original.factKey]),
        groups: new Map([[original.restatementGroupKey, state]]),
      },
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.fact.factKey, amendment.factKey);
    assert.equal(writes[0]?.revisionNo, 2);
    assert.equal(writes[0]?.supersedesNumericFactId, 77);
    assert.equal(writes[0]?.supersedesFactKey, original.factKey);
  });

  it('chains a same-accession correction by stable entry identity', () => {
    const original = draft();
    const correction = draft({
      sourceRevisionId: 12,
      ingestedAt: '2025-02-02T02:03:04.000Z',
      unitEntry: entry({ val: 101 }),
    });
    const { writes } = assignRevisions(
      buildSecFactPlan([correction, original], PLAN_CONTEXT).facts,
      { factKeys: new Set(), groups: new Map() },
    );

    assert.equal(writes.length, 2);
    assert.equal(writes[1]?.revisionNo, 2);
    assert.equal(writes[1]?.supersedesFactKey, original.factKey);
  });

  it('emits one write for an exact fact key duplicated inside the current batch', () => {
    const original = draft();
    const { writes, skips } = assignRevisions(
      buildSecFactPlan([original, original], PLAN_CONTEXT).facts,
      { factKeys: new Set(), groups: new Map() },
    );

    assert.equal(writes.length, 1);
    assert.deepEqual(skips, [{ reason: 'already planned', count: 1 }]);
  });

  it('does not invent a revision for an unchanged comparative repeated by a new accession', () => {
    const original = draft();
    const repeated = draft({
      sourceRevisionId: 13,
      ingestedAt: '2025-02-08T00:00:00.000Z',
      unitEntry: entry({
        val: 100,
        accn: '0000320193-25-000030',
        filed: '2025-02-07',
      }),
    });
    const { writes, skips } = assignRevisions(
      buildSecFactPlan([repeated, original], PLAN_CONTEXT).facts,
      { factKeys: new Set(), groups: new Map() },
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.fact.factKey, original.factKey);
    assert.deepEqual(skips, [{ reason: 'unchanged comparative repetition', count: 1 }]);
  });

  it('skips an unchanged comparative against exact existing database state', () => {
    const original = buildSecFactPlan([draft()], PLAN_CONTEXT).facts[0]!;
    const repeated = buildSecFactPlan(
      [
        draft({
          sourceRevisionId: 14,
          ingestedAt: '2025-02-09T00:00:00.000Z',
          unitEntry: entry({
            val: 100,
            accn: '0000320193-25-000040',
            filed: '2025-02-08',
          }),
        }),
      ],
      PLAN_CONTEXT,
    ).facts[0]!;
    const state: GroupState = {
      maxRevision: 1,
      latestFactId: 88,
      latestFactKey: original.factKey,
      factIdsByKey: new Map([[original.factKey, 88]]),
      latestSemanticFingerprint: numericFactSemanticFingerprint(original),
    };
    const { writes, skips } = assignRevisions([repeated], {
      factKeys: new Set([original.factKey]),
      groups: new Map([[original.restatementGroupKey, state]]),
    });

    assert.equal(writes.length, 0);
    assert.deepEqual(skips, [{ reason: 'unchanged comparative repetition', count: 1 }]);
  });

  it('replays comparative suppression from raw chronology when the persisted latest value differs', () => {
    const originalDraft = draft();
    const repeatedDraft = draft({
      sourceRevisionId: 14,
      ingestedAt: '2025-02-09T00:00:00.000Z',
      unitEntry: entry({
        val: 100,
        accn: '0000320193-25-000040',
        filed: '2025-02-08',
      }),
    });
    const changedDraft = draft({
      sourceRevisionId: 15,
      ingestedAt: '2025-02-10T00:00:00.000Z',
      unitEntry: entry({
        val: 120,
        accn: '0000320193-25-000050',
        filed: '2025-02-09',
      }),
    });
    const facts = buildSecFactPlan(
      [changedDraft, repeatedDraft, originalDraft],
      PLAN_CONTEXT,
    ).facts;
    const original = facts.find((fact) => fact.sourceRevisionId === 10)!;
    const changed = facts.find((fact) => fact.sourceRevisionId === 15)!;
    const state: GroupState = {
      maxRevision: 2,
      latestFactId: 99,
      latestFactKey: changed.factKey,
      factIdsByKey: new Map([
        [original.factKey, 88],
        [changed.factKey, 99],
      ]),
      latestSemanticFingerprint: numericFactSemanticFingerprint(changed),
    };

    const { writes, skips } = assignRevisions(facts, {
      factKeys: new Set([original.factKey, changed.factKey]),
      groups: new Map([[original.restatementGroupKey, state]]),
    });

    assert.equal(writes.length, 0);
    assert.deepEqual(skips, [
      { reason: 'already recorded', count: 2 },
      { reason: 'unchanged comparative repetition', count: 1 },
    ]);
  });

  it('requires an exact predecessor key and never substitutes the group latest id', () => {
    const { amendment } = revisions();
    const amendedFact = buildSecFactPlan([amendment], PLAN_CONTEXT).facts[0]!;

    assert.throws(
      () =>
        assignRevisions([amendedFact], {
          factKeys: new Set(),
          groups: new Map([
            [
              amendedFact.restatementGroupKey,
              {
                maxRevision: 1,
                latestFactId: 77,
                latestFactKey: null,
                factIdsByKey: new Map(),
              },
            ],
          ]),
        }),
      /exact predecessor fact key/,
    );

    const { writes } = assignRevisions([amendedFact], {
      factKeys: new Set(['sec:prior-observation']),
      groups: new Map([
        [
          amendedFact.restatementGroupKey,
          {
            maxRevision: 1,
            latestFactId: 77,
            latestFactKey: 'sec:prior-observation',
            factIdsByKey: new Map(),
          },
        ],
      ]),
    });
    assert.equal(writes[0]?.supersedesFactKey, 'sec:prior-observation');
    assert.equal(writes[0]?.supersedesNumericFactId, null);
    assert.equal('supersedesKey' in writes[0]!, false);
  });
});

describe('provider-neutral schema preflight', () => {
  it('reports PIT, period, currency, and definition violations before writes', () => {
    const plan = buildSecFactPlan([draft()], PLAN_CONTEXT);
    const fact = {
      ...plan.facts[0]!,
      knownAt: '2025-01-01T00:00:00.000Z',
      availableAt: '2025-02-01T00:00:00.000Z',
      instantAt: '2024-12-31T23:59:59.999Z',
      periodStart: '2024-10-01',
      periodEnd: '2024-12-31',
      unit: 'shares',
      currency: 'USD',
    };
    const definition = {
      ...plan.definitions[0]!,
      definitionKey: `${'x'.repeat(129)}`,
      definitionScope: 'issuer' as const,
      issuerEntityId: null,
    };
    const violations = findSchemaViolations({ facts: [fact], definitions: [definition] });
    const rules = violations.map(({ rule }) => rule);

    assert.ok(rules.includes('known_at before available_at'));
    assert.ok(rules.includes('must fill exactly one of instant or period'));
    assert.ok(rules.includes('currency is allowed only when unit is currency'));
    assert.ok(rules.includes('definition_key fails its pattern'));
    assert.ok(rules.includes('issuer-scoped definition names no issuer'));
  });
});

describe('folded SEC parity is diagnostic only', () => {
  it('reports both values for a disagreement without changing canonical facts', () => {
    const plan = buildSecFactPlan([draft()], PLAN_CONTEXT);
    const folded: FoldedFinancialFact[] = [
      {
        entityId: 41,
        concept: 'revenue',
        value: 99,
        unit: 'USD',
        currency: 'USD',
        periodStart: '2024-10-01',
        periodEnd: '2024-12-31',
        fiscalPeriod: 'Q1',
        filingRef: '0000320193-25-000008',
      },
    ];
    const before = structuredClone(plan.facts);
    const result = checkSecFinancialParity(plan.facts, folded, [
      { concept: 'revenue', usGaapTags: [TAG], unitClass: 'currency' },
    ]);

    assert.equal(result.comparable, 1);
    assert.equal(result.agreed, 0);
    assert.equal(result.disagreed, 1);
    assert.deepEqual(result.disagreementSamples[0], {
      factKey: plan.facts[0]!.factKey,
      concept: 'revenue',
      canonicalValue: 100,
      foldedValue: 99,
    });
    assert.deepEqual(plan.facts, before, 'diagnostics must not mutate or filter canonical facts');
  });

  it('excludes YTD and unmapped facts honestly', () => {
    const ytd = draft({
      unitEntry: entry({ start: '2024-01-01', fp: 'Q3', end: '2024-09-30' }),
    });
    const plan = buildSecFactPlan([ytd], PLAN_CONTEXT);
    const result = checkSecFinancialParity(plan.facts, [], []);

    assert.equal(result.comparable, 0);
    assert.equal(result.excluded, 1);
    assert.equal(plan.facts.length, 1, 'folded rows are never inputs to the canonical plan');
  });

  it('indexes folded candidates once instead of scanning them for every canonical fact', () => {
    const base = buildSecFactPlan([draft()], PLAN_CONTEXT).facts[0]!;
    const count = 200;
    const facts = Array.from({ length: count }, (_, index) => ({
      ...base,
      entityId: index + 1,
      factKey: `${base.factKey}:${index}`,
    }));
    const folded = Array.from(
      { length: count },
      (_, index): FoldedFinancialFact => ({
        entityId: index + 1,
        concept: 'revenue',
        value: 100,
        unit: 'USD',
        currency: 'USD',
        periodStart: '2024-10-01',
        periodEnd: '2024-12-31',
        fiscalPeriod: 'Q1',
        filingRef: '0000320193-25-000008',
      }),
    );
    let indexedReads = 0;
    const observed = new Proxy(folded, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const result = checkSecFinancialParity(facts, observed, [
      { concept: 'revenue', usGaapTags: [TAG], unitClass: 'currency' },
    ]);
    assert.equal(result.comparable, count);
    assert.ok(indexedReads <= count * 2, `expected linear folded reads, got ${indexedReads}`);
  });
});
