import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDartCellLocator,
  buildNumericFactDrafts,
  dartFactKey,
  parseDartConcept,
  resolveDartAvailability,
  resolveDartPeriod,
  type DartStatementRow,
} from '../src/backfill/dart-numeric-fact.ts';

const DEC = '12';

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

describe('DART period resolution — a December fiscal year', () => {
  const base = { fiscalMonth: DEC, businessYear: '2025', cumulative: false };

  it('places a Q1 balance sheet at the end of March', () => {
    const period = resolveDartPeriod({ ...base, reportCode: '11013', statementDivision: 'BS' });
    assert.equal(period.kind, 'instant');
    assert.match(period.instantAt, /^2025-03-31/);
  });

  it('places a half-year balance sheet at the end of June, not March', () => {
    // 11012 closes at month 6. Reading the report code as "quarter 2 means three
    // months" would put a half-year balance three months early.
    const period = resolveDartPeriod({ ...base, reportCode: '11012', statementDivision: 'BS' });
    assert.match(period.instantAt, /^2025-06-30/);
  });

  it('places a Q3 balance sheet at the end of September', () => {
    const period = resolveDartPeriod({ ...base, reportCode: '11014', statementDivision: 'BS' });
    assert.match(period.instantAt, /^2025-09-30/);
  });

  it('spans an annual income statement over the whole fiscal year', () => {
    const period = resolveDartPeriod({ ...base, reportCode: '11011', statementDivision: 'CIS' });
    assert.equal(period.kind, 'duration');
    assert.match(period.periodStart, /^2025-01-01/);
    assert.match(period.periodEnd, /^2025-12-31/);
  });

  it('spans a Q3 quarter-only amount over July to September', () => {
    const period = resolveDartPeriod({ ...base, reportCode: '11014', statementDivision: 'CIS' });
    assert.match(period.periodStart, /^2025-07-01/);
    assert.match(period.periodEnd, /^2025-09-30/);
  });

  it('spans a Q3 cumulative amount from January to September', () => {
    const period = resolveDartPeriod({
      ...base,
      reportCode: '11014',
      statementDivision: 'CIS',
      cumulative: true,
    });
    assert.match(period.periodStart, /^2025-01-01/);
    assert.match(period.periodEnd, /^2025-09-30/);
  });
});

describe('DART period resolution — a non-December fiscal year', () => {
  // Every issuer measured on 2026-08-08 closes in December, so this case is not
  // exercised by real data. The arithmetic is general anyway: a March closer has
  // every quarter shifted, and defaulting them to calendar quarters would be
  // wrong for exactly the companies nobody would check.
  it('shifts a March closer so Q1 ends in June', () => {
    const period = resolveDartPeriod({
      fiscalMonth: '3',
      businessYear: '2025',
      reportCode: '11013',
      statementDivision: 'BS',
      cumulative: false,
    });
    assert.match(period.instantAt, /^2024-06-30/);
  });

  it('runs a March closer fiscal year from April to March', () => {
    const period = resolveDartPeriod({
      fiscalMonth: '3',
      businessYear: '2025',
      reportCode: '11011',
      statementDivision: 'CIS',
      cumulative: false,
    });
    assert.match(period.periodStart, /^2024-04-01/);
    assert.match(period.periodEnd, /^2025-03-31/);
  });
});

describe('DART period resolution — refusals', () => {
  it('refuses when the issuer fiscal month is unknown', () => {
    // Guessing December is the false precision this exists to avoid.
    const period = resolveDartPeriod({
      fiscalMonth: null,
      businessYear: '2025',
      reportCode: '11013',
      statementDivision: 'BS',
      cumulative: false,
    });
    assert.equal(period.refused, true);
    assert.match(period.reason, /fiscal month unknown/);
  });

  it('refuses an unrecognised report code rather than assuming annual', () => {
    const period = resolveDartPeriod({
      fiscalMonth: DEC,
      businessYear: '2025',
      reportCode: '99999',
      statementDivision: 'BS',
      cumulative: false,
    });
    assert.match(period.reason, /unrecognised report code/);
  });

  it('refuses a cumulative balance sheet — a position has no span', () => {
    const period = resolveDartPeriod({
      fiscalMonth: DEC,
      businessYear: '2025',
      reportCode: '11013',
      statementDivision: 'BS',
      cumulative: true,
    });
    assert.match(period.reason, /balance sheet has no cumulative/);
  });
});

describe('DART concept parsing', () => {
  it('splits a standard taxonomy id into namespace and key', () => {
    assert.deepEqual(parseDartConcept('ifrs-full_Assets', '자산총계', '00117212'), {
      namespace: 'ifrs-full',
      key: 'Assets',
      standard: true,
    });
  });

  it('handles the dart taxonomy the same way', () => {
    assert.deepEqual(parseDartConcept('dart_OperatingIncomeLoss', '영업이익', '00992871'), {
      namespace: 'dart',
      key: 'OperatingIncomeLoss',
      standard: true,
    });
  });

  it('namespaces a non-standard account to its issuer', () => {
    // Two companies using the same Korean label are not making the same claim,
    // and migration 084's registry refuses to put them in one group.
    const concept = parseDartConcept('-표준계정코드 미사용-', '기타영업수익', '00117212');
    assert.deepEqual(concept, {
      namespace: 'dart-issuer:00117212',
      key: '기타영업수익',
      standard: false,
    });
  });

  it('returns null when nothing identifies the concept', () => {
    assert.equal(parseDartConcept('-표준계정코드 미사용-', '', '00117212'), null);
  });
});

describe('DART cell locator', () => {
  it('addresses the cell, not the API call (REQ-EVD-004)', () => {
    const locator = buildDartCellLocator(row(), false);
    assert.equal(locator.receiptNo, '20250515002181');
    assert.equal(locator.statementDivision, 'BS');
    assert.equal(locator.ordinal, '7');
    assert.equal(locator.amountField, 'thstrm_amount');
  });

  it('always carries account detail so an SCE matrix cell stays distinguishable', () => {
    // 자본변동표 repeats one line item per equity component: 16,836 of 20,221 SCE
    // rows measured share an ordinal with a sibling.
    const first = buildDartCellLocator(
      row({ sj_div: 'SCE', ord: '1', account_detail: '자본금' }),
      false,
    );
    const second = buildDartCellLocator(
      row({ sj_div: 'SCE', ord: '1', account_detail: '이익잉여금' }),
      false,
    );
    assert.notDeepEqual(first, second);
  });

  it('distinguishes the two amounts of one row', () => {
    assert.notEqual(
      buildDartCellLocator(row(), false).amountField,
      buildDartCellLocator(row(), true).amountField,
    );
  });
});

describe('DART fact drafts', () => {
  it('emits one fact for a balance sheet cell', () => {
    const { drafts, skips } = buildNumericFactDrafts(row(), { fiscalMonth: DEC });
    assert.equal(skips.length, 0);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.value, 30791952000000);
    assert.equal(drafts[0]?.currency, 'KRW');
    assert.equal(drafts[0]?.period.kind, 'instant');
  });

  it('emits two facts when a quarterly income statement carries both spans', () => {
    // The quarter and the year to date are different facts about different
    // periods, and DART hands us both.
    const { drafts } = buildNumericFactDrafts(
      row({
        sj_div: 'CIS',
        reprt_code: '11014',
        thstrm_amount: '100',
        thstrm_add_amount: '250',
      }),
      { fiscalMonth: DEC },
    );
    assert.equal(drafts.length, 2);
    const quarter = drafts.find((d) => !d.cumulative);
    const cumulative = drafts.find((d) => d.cumulative);
    assert.match(quarter.period.periodStart, /^2025-07-01/);
    assert.match(cumulative.period.periodStart, /^2025-01-01/);
    assert.notEqual(dartFactKey(quarter), dartFactKey(cumulative));
  });

  it('refuses a quarterly cash flow, whose span the payload never states', () => {
    // CF and SCE quarterly rows carry one amount and no cumulative field. Korean
    // practice is cumulative, but practice is not evidence, and a cash-flow number
    // filed under the wrong span is wrong exactly where quarters are compared.
    const { drafts, skips } = buildNumericFactDrafts(
      row({ sj_div: 'CF', reprt_code: '11013', account_id: 'ifrs-full_CashFlows' }),
      { fiscalMonth: DEC },
    );
    assert.equal(drafts.length, 0);
    assert.equal(skips.length, 1);
    assert.match(skips[0].reason, /span not established/);
  });

  it('accepts an annual cash flow — the span is the fiscal year', () => {
    const { drafts, skips } = buildNumericFactDrafts(
      row({ sj_div: 'CF', reprt_code: '11011', account_id: 'ifrs-full_CashFlows' }),
      { fiscalMonth: DEC },
    );
    assert.equal(skips.length, 0);
    assert.equal(drafts.length, 1);
    assert.match(drafts[0].period.periodEnd, /^2025-12-31/);
  });

  it('skips rather than guesses when the issuer profile is missing', () => {
    const { drafts, skips } = buildNumericFactDrafts(row(), { fiscalMonth: null });
    assert.equal(drafts.length, 0);
    assert.match(skips[0].reason, /fiscal month unknown/);
  });

  it('carries the equity component as a dimension, not as part of the concept', () => {
    const { drafts } = buildNumericFactDrafts(
      row({
        sj_div: 'SCE',
        reprt_code: '11011',
        account_id: 'dart_EquityAtBeginningOfPeriod',
        account_detail: '이익잉여금',
      }),
      { fiscalMonth: DEC },
    );
    assert.equal(drafts[0]?.dimensions.accountDetail, '이익잉여금');
    assert.equal(drafts[0]?.conceptKey, 'EquityAtBeginningOfPeriod');
  });

  it('drops a cell with no parseable amount without inventing one', () => {
    const { drafts } = buildNumericFactDrafts(row({ thstrm_amount: '-' }), { fiscalMonth: DEC });
    assert.equal(drafts.length, 0);
  });

  it('keeps a negative amount in parentheses negative', () => {
    const { drafts } = buildNumericFactDrafts(row({ thstrm_amount: '(8,810,638,260)' }), {
      fiscalMonth: DEC,
    });
    assert.equal(drafts[0]?.value, -8810638260);
  });
});

describe('DART availability — the two time axes', () => {
  it('reads availability from the receipt, not from when we fetched it', () => {
    // Measured 2026-08-08: receipt 2026-05-14, source_revision.available_at
    // 2026-08-07. Using the fetch time would date every historical fact to the
    // backfill and make the column useless.
    const availability = resolveDartAvailability({
      receiptNo: '20260514001471',
      ingestedAt: '2026-08-07T20:23:26.826Z',
    });
    assert.equal(availability.receiptDate, '2026-05-14');
    assert.equal(availability.availableAt, '2026-05-14T14:59:59.999Z');
    assert.equal(availability.availableAtBound, 'receipt_day_end_kst');
  });

  it('places the bound at the end of the receipt day in KST', () => {
    // 23:59:59.999 KST is 14:59:59.999 UTC. An earlier bound would claim the
    // filing was readable before it was, which is the direction that leaks.
    const { availableAt } = resolveDartAvailability({
      receiptNo: '20250515002181',
      ingestedAt: '2025-06-01T00:00:00.000Z',
    });
    assert.equal(availableAt, '2025-05-15T14:59:59.999Z');
  });

  it('tightens to the ingestion moment when we fetched it the same day', () => {
    // Both values bound the true moment from above, so the tighter one is still
    // sound — and it keeps known_at >= available_at, which numeric_fact enforces.
    const availability = resolveDartAvailability({
      receiptNo: '20250515002181',
      ingestedAt: '2025-05-15T02:00:00.000Z',
    });
    assert.equal(availability.availableAt, '2025-05-15T02:00:00.000Z');
    assert.equal(availability.availableAtBound, 'ingested_at');
  });

  it('never reports knowing a filing before it was available', () => {
    for (const ingestedAt of [
      '2025-05-14T23:00:00.000Z',
      '2025-05-15T02:00:00.000Z',
      '2025-05-15T20:00:00.000Z',
      '2026-08-07T20:23:26.826Z',
    ]) {
      const a = resolveDartAvailability({ receiptNo: '20250515002181', ingestedAt });
      assert.ok(a.knownAt >= a.availableAt, `${ingestedAt} produced known_at < available_at`);
    }
  });

  it('keeps known_at as the ingestion moment untouched', () => {
    const { knownAt } = resolveDartAvailability({
      receiptNo: '20250515002181',
      ingestedAt: '2026-08-07T20:23:26.826Z',
    });
    assert.equal(knownAt, '2026-08-07T20:23:26.826Z');
  });

  it('refuses a receipt number that carries no real date', () => {
    // Date.UTC rolls 2025-02-30 into March without complaint, which would turn a
    // malformed receipt into a plausible timestamp.
    assert.match(
      resolveDartAvailability({ receiptNo: '20250230001234', ingestedAt: '2025-06-01T00:00:00Z' })
        .reason,
      /no real date/,
    );
    assert.match(
      resolveDartAvailability({ receiptNo: '2025', ingestedAt: '2025-06-01T00:00:00Z' }).reason,
      /unparseable receipt number/,
    );
  });
});

describe('DART dimensions — a Korean label is not unique inside a statement', () => {
  it('separates two issuer accounts that share a name at different positions', () => {
    // One live balance sheet lists 충당부채 at ordinal 40 for 1,290,427,460 and
    // again at ordinal 51 for 82,993,173,087 — current and non-current
    // provisions, sharing a label. Without the position they become one claim and
    // a reader taking the latest revision loses a line of the balance sheet.
    const current = buildNumericFactDrafts(
      row({ account_id: '-표준계정코드 미사용-', account_nm: '충당부채', ord: '40' }),
      { fiscalMonth: DEC },
    ).drafts[0];
    const nonCurrent = buildNumericFactDrafts(
      row({ account_id: '-표준계정코드 미사용-', account_nm: '충당부채', ord: '51' }),
      { fiscalMonth: DEC },
    ).drafts[0];

    assert.equal(current.conceptKey, nonCurrent.conceptKey, 'still the same label');
    assert.notDeepEqual(current.dimensions, nonCurrent.dimensions);
    assert.equal(current.dimensions.statementOrdinal, '40');
  });

  it('leaves a standard taxonomy concept without a position dimension', () => {
    // The concept key already identifies it, and pinning the ordinal would stop a
    // correction that shifts line positions from colliding with what it replaces.
    const { drafts } = buildNumericFactDrafts(row({ ord: '7' }), { fiscalMonth: DEC });
    assert.equal(drafts[0].dimensions.statementOrdinal, undefined);
  });
});
