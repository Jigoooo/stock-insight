import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDartFactPlan,
  findSchemaViolations,
  type DartFactContext,
} from '../src/backfill/dart-numeric-fact-plan.ts';
import { type DartStatementRow } from '../src/backfill/dart-numeric-fact.ts';

const context: DartFactContext = {
  corpCode: '00117212',
  entityId: 382,
  fiscalMonth: '12',
  sourceRevisionId: 4711,
  availableAt: '2025-05-15T09:00:00.000Z',
  knownAt: '2025-05-15T10:00:00.000Z',
};

function row(overrides: Partial<DartStatementRow> = {}): DartStatementRow {
  return {
    rcept_no: '20250515002181',
    reprt_code: '11013',
    bsns_year: '2025',
    corp_code: '00117212',
    sj_div: 'BS',
    account_id: 'ifrs-full_Assets',
    account_nm: '자산총계',
    account_detail: '-',
    ord: '7',
    currency: 'KRW',
    thstrm_amount: '30791952000000',
    ...overrides,
  };
}

describe('DART fact plan — the two keys are not the same key', () => {
  it('separates a restating filing by fact_key but collides it by restatement group', () => {
    // The collision is the mechanism: numeric_fact forces revision_no > 1 to name
    // what it supersedes, so a restatement cannot be written as an independent
    // observation.
    const original = buildDartFactPlan([row()], context).facts[0];
    const restated = buildDartFactPlan(
      [row({ rcept_no: '20250820004444', thstrm_amount: '30800000000000' })],
      context,
    ).facts[0];

    assert.notEqual(original.factKey, restated.factKey, 'each cell stays addressable');
    assert.equal(
      original.restatementGroupKey,
      restated.restatementGroupKey,
      'the same claim about the same period must collide',
    );
  });

  it('keeps the receipt out of the restatement group key', () => {
    assert.ok(
      !buildDartFactPlan([row()], context).facts[0].restatementGroupKey.includes('2025051'),
    );
  });

  it('separates an instant from a duration that ends at the same moment', () => {
    // A balance at quarter end is not the quarter's flow, so the period kind is
    // part of the signature rather than only the endpoints.
    const instant = buildDartFactPlan([row({ sj_div: 'BS' })], context).facts;
    const durations = buildDartFactPlan(
      [row({ sj_div: 'CIS', thstrm_add_amount: '1' })],
      context,
    ).facts;

    assert.equal(instant.length, 1);
    assert.equal(durations.length, 2, 'quarter and year-to-date');

    assert.ok(instant[0].restatementGroupKey.includes(':i:'));
    for (const fact of durations) assert.ok(fact.restatementGroupKey.includes(':d:'));

    // The Q1 balance sheet and the Q1 cumulative flow both close on 31 March, and
    // must still be different claims.
    const cumulative = durations.find((f) => f.periodStart?.startsWith('2025-01-01'));
    assert.ok(cumulative);
    assert.equal(instant[0].instantAt?.slice(0, 10), '2025-03-31');
    assert.equal(cumulative.periodEnd?.slice(0, 10), '2025-03-31');
    assert.notEqual(instant[0].restatementGroupKey, cumulative.restatementGroupKey);
  });

  it('separates the quarter from the year to date', () => {
    const facts = buildDartFactPlan(
      [row({ sj_div: 'CIS', reprt_code: '11014', thstrm_amount: '100', thstrm_add_amount: '250' })],
      context,
    ).facts;
    assert.equal(facts.length, 2);
    assert.notEqual(facts[0].restatementGroupKey, facts[1].restatementGroupKey);
  });
});

describe('DART fact plan — metric definitions', () => {
  it('registers a canonical definition for a standard taxonomy concept', () => {
    const { definitions } = buildDartFactPlan([row()], context);
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].definitionScope, 'canonical');
    assert.equal(definitions[0].issuerEntityId, null);
    assert.equal(definitions[0].accountingBasis, 'ifrs');
    assert.equal(definitions[0].periodBasis, 'instant');
  });

  it('registers an issuer-scoped definition for a non-standard account', () => {
    const { definitions } = buildDartFactPlan(
      [row({ account_id: '-표준계정코드 미사용-', account_nm: '기타영업수익' })],
      context,
    );
    assert.equal(definitions[0].definitionScope, 'issuer');
    assert.equal(definitions[0].issuerEntityId, 382);
    assert.equal(definitions[0].accountingBasis, 'internal');
  });

  it('never shares a comparability group between two issuers writing the same label', () => {
    // Migration 084 returns COMPARABLE for a shared group without anyone assessing
    // it, so this is the line that stops two unrelated 기타영업수익 being ranked
    // against each other.
    const first = buildDartFactPlan(
      [row({ account_id: '-표준계정코드 미사용-', account_nm: '기타영업수익' })],
      context,
    ).definitions[0];
    const second = buildDartFactPlan(
      [
        row({
          corp_code: '00999999',
          account_id: '-표준계정코드 미사용-',
          account_nm: '기타영업수익',
        }),
      ],
      { ...context, corpCode: '00999999', entityId: 999 },
    ).definitions[0];

    assert.notEqual(first.comparabilityGroupKey, second.comparabilityGroupKey);
  });

  it('does share a comparability group between two issuers on the same taxonomy concept', () => {
    const first = buildDartFactPlan([row()], context).definitions[0];
    const second = buildDartFactPlan([row({ corp_code: '00999999' })], {
      ...context,
      corpCode: '00999999',
      entityId: 999,
    }).definitions[0];
    assert.equal(first.comparabilityGroupKey, second.comparabilityGroupKey);
  });

  it('separates annual from quarterly under one concept', () => {
    // The same taxonomy concept measured over a year and over a quarter is not an
    // interchangeable number (canonical/02 §7 lists period basis in the definition).
    const annual = buildDartFactPlan([row({ sj_div: 'CIS', reprt_code: '11011' })], context)
      .definitions[0];
    const quarterly = buildDartFactPlan(
      [row({ sj_div: 'CIS', reprt_code: '11014', thstrm_add_amount: '1' })],
      context,
    ).definitions;
    assert.equal(annual.periodBasis, 'duration_annual');
    assert.ok(quarterly.some((d) => d.periodBasis === 'duration_quarter'));
    assert.ok(quarterly.some((d) => d.periodBasis === 'duration_ytd'));
    for (const d of quarterly)
      assert.notEqual(d.comparabilityGroupKey, annual.comparabilityGroupKey);
  });

  it('deduplicates definitions across many rows', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row({ ord: String(index + 1) }));
    const { definitions, facts } = buildDartFactPlan(rows, context);
    assert.equal(facts.length, 20);
    assert.equal(definitions.length, 1);
  });
});

describe('DART fact plan — refusals are counted, not hidden', () => {
  it('reports the quarterly cash-flow skip with its reason', () => {
    const { facts, skips } = buildDartFactPlan(
      [row({ sj_div: 'CF', reprt_code: '11013' })],
      context,
    );
    assert.equal(facts.length, 0);
    assert.equal(skips[0].count, 1);
    assert.match(skips[0].reason, /span not established/);
  });

  it('counts a duplicate cell address instead of silently dropping one', () => {
    const { facts, skips } = buildDartFactPlan([row(), row()], context);
    assert.equal(facts.length, 1);
    assert.ok(skips.some((s) => /duplicate cell address/.test(s.reason) && s.count === 1));
  });

  it('produces nothing at all when the issuer fiscal month is unknown', () => {
    const { facts, definitions, skips } = buildDartFactPlan([row()], {
      ...context,
      fiscalMonth: null,
    });
    assert.equal(facts.length, 0);
    assert.equal(definitions.length, 0);
    assert.match(skips[0].reason, /fiscal month unknown/);
  });
});

describe('DART fact plan — numeric_fact column shapes', () => {
  it('fills exactly one of instant or period, as the CHECK requires', () => {
    const instant = buildDartFactPlan([row()], context).facts[0];
    assert.ok(instant.instantAt !== null);
    assert.equal(instant.periodStart, null);
    assert.equal(instant.periodEnd, null);

    const duration = buildDartFactPlan([row({ sj_div: 'CIS', reprt_code: '11011' })], context)
      .facts[0];
    assert.equal(duration.instantAt, null);
    assert.ok(duration.periodEnd !== null);
  });

  it('keeps known_at at or after available_at', () => {
    const fact = buildDartFactPlan([row()], context).facts[0];
    assert.ok(fact.knownAt >= fact.availableAt);
  });

  it('carries the source revision and a cell locator, not an API citation', () => {
    const fact = buildDartFactPlan([row()], context).facts[0];
    assert.equal(fact.sourceRevisionId, 4711);
    assert.equal(fact.locator.receiptNo, '20250515002181');
    assert.equal(fact.locator.ordinal, '7');
  });

  it('reports whole won, matching what the endpoint carries', () => {
    assert.equal(buildDartFactPlan([row()], context).facts[0].scalePower, 0);
  });
});

describe('DART fact plan — one concept stated in two statements', () => {
  it('does not turn a second presentation into a restatement of the first', () => {
    // Measured on the live corpus 2026-08-08: 988 groups collided, every one of
    // them inside a single filing stating the same ProfitLoss in both 손익계산서
    // and 포괄손익계산서 with identical values. Colliding them forced the second
    // to land as revision 2 superseding the first — a restatement history that
    // never happened.
    const [income, comprehensive] = [
      buildDartFactPlan(
        [row({ sj_div: 'IS', reprt_code: '11011', account_id: 'ifrs-full_ProfitLoss', ord: '20' })],
        context,
      ).facts[0],
      buildDartFactPlan(
        [
          row({
            sj_div: 'CIS',
            reprt_code: '11011',
            account_id: 'ifrs-full_ProfitLoss',
            ord: '20',
          }),
        ],
        context,
      ).facts[0],
    ];

    assert.notEqual(income.restatementGroupKey, comprehensive.restatementGroupKey);
  });

  it('still collides a correction of the same line of the same statement', () => {
    // The division is kept because it does not change between an original and
    // its restatement; the receipt number is dropped because it does.
    const original = buildDartFactPlan([row({ sj_div: 'CIS', reprt_code: '11011' })], context)
      .facts[0];
    const corrected = buildDartFactPlan(
      [row({ sj_div: 'CIS', reprt_code: '11011', rcept_no: '20250820004444' })],
      context,
    ).facts[0];

    assert.equal(original.restatementGroupKey, corrected.restatementGroupKey);
    assert.notEqual(original.factKey, corrected.factKey);
  });

  it('keeps the two presentations in one comparability group', () => {
    // Separating the restatement groups must not make the same measure look
    // incomparable — that question belongs to the definition registry.
    const income = buildDartFactPlan(
      [row({ sj_div: 'IS', reprt_code: '11011', account_id: 'ifrs-full_ProfitLoss' })],
      context,
    ).definitions[0];
    const comprehensive = buildDartFactPlan(
      [row({ sj_div: 'CIS', reprt_code: '11011', account_id: 'ifrs-full_ProfitLoss' })],
      context,
    ).definitions[0];

    assert.equal(income.comparabilityGroupKey, comprehensive.comparabilityGroupKey);
  });
});

describe('DART fact plan — definition keys fit what the table accepts', () => {
  const LONG_IFRS_CONCEPT =
    'ShareOfOtherComprehensiveIncomeOfAssociatesAndJointVenturesAccountedForUsingEquityMethodThatWillBeReclassifiedToProfitOrLossNetOfTax';

  it('keeps a long IFRS concept inside the 128 character limit', () => {
    // Migration 084's CHECK is ^[a-z0-9][a-z0-9._:-]{0,127}$. Measured
    // 2026-08-08, 89 of 6,100 keys overflowed it, and a violation inside the
    // insert aborts all 168,417 rows while naming one.
    const { definitions } = buildDartFactPlan(
      [row({ sj_div: 'CIS', reprt_code: '11011', account_id: `ifrs-full_${LONG_IFRS_CONCEPT}` })],
      context,
    );
    assert.match(definitions[0].definitionKey, /^[a-z0-9][a-z0-9._:-]{0,127}$/);
  });

  it('does not collide two long concepts that share a prefix', () => {
    // Truncation alone would merge them, and IFRS has several such families.
    const keys = [`${LONG_IFRS_CONCEPT}Gross`, `${LONG_IFRS_CONCEPT}NetOfTax`].map(
      (concept) =>
        buildDartFactPlan(
          [row({ sj_div: 'CIS', reprt_code: '11011', account_id: `ifrs-full_${concept}` })],
          context,
        ).definitions[0].definitionKey,
    );
    assert.notEqual(keys[0], keys[1]);
  });

  it('leaves a short key untouched so it stays readable', () => {
    assert.equal(
      buildDartFactPlan([row()], context).definitions[0].definitionKey,
      'dart.ifrs-full.assets.instant.krw',
    );
  });

  it('reports every rule a planned row would break instead of the first', () => {
    const { facts, definitions } = buildDartFactPlan([row()], context);
    assert.deepEqual(findSchemaViolations(facts, definitions), []);

    const broken = [{ ...facts[0], currency: 'won', knownAt: '2000-01-01T00:00:00.000Z' }];
    const rules = findSchemaViolations(broken, definitions).map((v) => v.rule);
    assert.ok(rules.includes('currency must be three upper-case letters'));
    assert.ok(rules.includes('known_at before available_at'));
  });
});
