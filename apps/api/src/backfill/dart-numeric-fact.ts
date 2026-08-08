import { parseDartAmount } from './opendart.ts';

/**
 * DART financial statement rows → world.numeric_fact shapes.
 *
 * Pure mapping. The runner owns fetching, entity resolution and writing; this
 * module owns the part that has to be right: which period a number belongs to,
 * where the cell it came from lives, and which numbers we refuse to emit.
 *
 * REQ-EVD-004 requires a number to be re-executable back to the original cell.
 * DART gives us that — every row carries the filing receipt (`rcept_no`), the
 * statement division and an ordinal — so the locator is a real address, not a
 * citation of the API call.
 *
 * WHAT THIS REFUSES TO EMIT, AND WHY. A financial number attached to the wrong
 * period is worse than a missing one: it passes every provenance check and lies
 * at the moment of comparison. Two cases are refused rather than guessed.
 */

/** Rows as DART returns them from fnlttSinglAcntAll. */
export type DartStatementRow = {
  rcept_no?: string;
  reprt_code?: string;
  bsns_year?: string;
  corp_code?: string;
  sj_div?: string;
  account_id?: string;
  account_nm?: string;
  account_detail?: string;
  ord?: string;
  currency?: string;
  thstrm_nm?: string;
  thstrm_amount?: string;
  thstrm_add_amount?: string;
};

/**
 * 11011 사업보고서 (annual) · 11012 반기 · 11013 1분기 · 11014 3분기.
 * The quarter number is how far into the fiscal year the report closes, which is
 * what the period arithmetic below needs — 11012 closes at month 6, not month 3.
 */
const REPORT_CODE_CLOSING_QUARTER: Record<string, 1 | 2 | 3 | 4> = {
  '11013': 1,
  '11012': 2,
  '11014': 3,
  '11011': 4,
};

/** Balance sheet is a position at an instant; the rest describe a span. */
const INSTANT_STATEMENTS = new Set(['BS']);

export type FiscalPeriod =
  | { kind: 'instant'; instantAt: string }
  | { kind: 'duration'; periodStart: string; periodEnd: string };

export type PeriodRefusal = { refused: true; reason: string };

function text(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Last calendar day of a month, in UTC. */
function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function iso(date: Date): string {
  return date.toISOString();
}

/**
 * Resolves the period a row's amount belongs to.
 *
 * `fiscalMonth` is DART's `acc_mt` — the month the issuer's fiscal year closes,
 * read per company from its profile rather than assumed. Every company measured
 * on 2026-08-08 reports 12, but a company that closes in March would have every
 * quarter shifted, so the arithmetic is general and a missing profile refuses
 * rather than defaults.
 *
 * `cumulative` selects between the two amounts DART carries on quarterly income
 * statements: `thstrm_amount` is the quarter alone, `thstrm_add_amount` is the
 * span from the fiscal year start. They are different periods and both are real.
 */
export function resolveDartPeriod(input: {
  fiscalMonth: string | null | undefined;
  businessYear: string | null | undefined;
  reportCode: string | null | undefined;
  statementDivision: string | null | undefined;
  cumulative: boolean;
}): FiscalPeriod | PeriodRefusal {
  const fiscalMonth = Number(text(input.fiscalMonth));
  const businessYear = Number(text(input.businessYear));
  const closingQuarter = REPORT_CODE_CLOSING_QUARTER[text(input.reportCode)];
  const division = text(input.statementDivision);

  if (!Number.isInteger(fiscalMonth) || fiscalMonth < 1 || fiscalMonth > 12) {
    // No profile, or a profile without acc_mt. Guessing December here is exactly
    // the false precision this function exists to avoid.
    return { refused: true, reason: 'issuer fiscal month unknown' };
  }
  if (!Number.isInteger(businessYear) || businessYear < 1800 || businessYear > 3000) {
    return { refused: true, reason: 'business year unusable' };
  }
  if (closingQuarter === undefined) {
    return { refused: true, reason: `unrecognised report code ${text(input.reportCode)}` };
  }
  if (division === '') {
    return { refused: true, reason: 'statement division missing' };
  }

  // The fiscal year labelled `bsns_year` ends in `fiscalMonth` of that year.
  const fiscalYearEnd = endOfMonth(businessYear, fiscalMonth);
  // Start of the fiscal year: twelve months earlier, first instant of that month.
  const fiscalYearStart = new Date(Date.UTC(businessYear - 1, fiscalMonth, 1, 0, 0, 0, 0));
  const closingMonthOffset = closingQuarter * 3;
  const closing = endOfMonth(businessYear - 1, fiscalMonth + closingMonthOffset);

  if (INSTANT_STATEMENTS.has(division)) {
    if (input.cumulative) {
      return { refused: true, reason: 'balance sheet has no cumulative amount' };
    }
    return { kind: 'instant', instantAt: iso(closing) };
  }

  if (cumulativeIsWholeYear(closingQuarter)) {
    // An annual report covers the fiscal year however the amount is labelled.
    return { kind: 'duration', periodStart: iso(fiscalYearStart), periodEnd: iso(fiscalYearEnd) };
  }

  if (input.cumulative) {
    return { kind: 'duration', periodStart: iso(fiscalYearStart), periodEnd: iso(closing) };
  }

  // Quarter alone: the three months ending at the close.
  const quarterStart = new Date(
    Date.UTC(businessYear - 1, fiscalMonth + closingMonthOffset - 3, 1, 0, 0, 0, 0),
  );
  return { kind: 'duration', periodStart: iso(quarterStart), periodEnd: iso(closing) };
}

function cumulativeIsWholeYear(closingQuarter: 1 | 2 | 3 | 4): boolean {
  return closingQuarter === 4;
}

export type ConceptRef = {
  namespace: string;
  key: string;
  /** False when DART reports the issuer used no standard account code. */
  standard: boolean;
};

/**
 * `ifrs-full_Assets` → namespace `ifrs-full`, key `Assets`.
 *
 * DART also emits the literal marker `-표준계정코드 미사용-` (37,714 of 256,024 rows
 * measured 2026-08-08) for line items an issuer reports under no standard code.
 * Those are the issuer's own accounts: two companies using the same Korean label
 * are not making the same claim, so the concept is namespaced to the issuer and
 * `standard` is false. Migration 084's registry is where that distinction is then
 * enforced — an issuer-scoped definition does not share a comparability group.
 */
export function parseDartConcept(
  accountId: string | null | undefined,
  accountName: string | null | undefined,
  corpCode: string | null | undefined,
): ConceptRef | null {
  const id = text(accountId);
  const name = text(accountName);
  const corp = text(corpCode);

  if (id !== '' && id !== '-표준계정코드 미사용-') {
    const separator = id.indexOf('_');
    if (separator > 0 && separator < id.length - 1) {
      return { namespace: id.slice(0, separator), key: id.slice(separator + 1), standard: true };
    }
    // An account id with no namespace separator still identifies something, but
    // not a standard taxonomy concept.
    return { namespace: 'dart-raw', key: id, standard: false };
  }

  if (name === '' || corp === '') return null;
  return { namespace: `dart-issuer:${corp}`, key: name, standard: false };
}

/**
 * Where the number physically is.
 *
 * `(rcept_no, sj_div, ord)` uniquely addresses a cell in BS, CIS, CF and IS.
 * It does not in SCE: 자본변동표 is a matrix, and one line item repeats per equity
 * component — 16,836 of 20,221 SCE rows measured share an ord with a sibling.
 * `account_detail` plus `account_id` separates them, so both are always part of
 * the locator rather than only when they happen to be needed.
 */
export function buildDartCellLocator(row: DartStatementRow, cumulative: boolean) {
  return {
    provider: 'opendart',
    receiptNo: text(row.rcept_no),
    statementDivision: text(row.sj_div),
    ordinal: text(row.ord),
    accountId: text(row.account_id),
    accountDetail: text(row.account_detail),
    amountField: cumulative ? 'thstrm_add_amount' : 'thstrm_amount',
  };
}

export type NumericFactDraft = {
  conceptNamespace: string;
  conceptKey: string;
  standardConcept: boolean;
  value: number;
  unit: 'currency' | 'pure';
  currency: string | null;
  period: FiscalPeriod;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  dimensions: Record<string, string>;
  locator: ReturnType<typeof buildDartCellLocator>;
  cumulative: boolean;
};

export type NumericFactSkip = { skipped: true; reason: string; row: DartStatementRow };

/**
 * Turns one DART row into the facts it actually supports — nought, one or two.
 *
 * Two, because a quarterly income statement carries both the quarter and the
 * year-to-date span and they are different facts about different periods.
 *
 * Nought, for the case this module refuses: CF and SCE in a quarterly report
 * carry a single amount and no `thstrm_add_amount`, so nothing in the payload
 * says whether it covers the quarter or the year to date. Korean practice is
 * cumulative, but practice is not evidence, and a cash-flow number filed under
 * the wrong span is wrong precisely where someone compares quarters. They are
 * skipped with the reason recorded until the distinction can be read rather than
 * assumed.
 */
export function buildNumericFactDrafts(
  row: DartStatementRow,
  context: { fiscalMonth: string | null | undefined },
): { drafts: NumericFactDraft[]; skips: NumericFactSkip[] } {
  const drafts: NumericFactDraft[] = [];
  const skips: NumericFactSkip[] = [];

  const division = text(row.sj_div);
  const reportCode = text(row.reprt_code);
  const closingQuarter = REPORT_CODE_CLOSING_QUARTER[reportCode];
  const concept = parseDartConcept(row.account_id, row.account_nm, row.corp_code);

  if (concept === null) {
    skips.push({ skipped: true, reason: 'concept unresolvable', row });
    return { drafts, skips };
  }
  if (closingQuarter === undefined) {
    skips.push({ skipped: true, reason: `unrecognised report code ${reportCode}`, row });
    return { drafts, skips };
  }

  const isQuarterly = closingQuarter !== 4;
  const hasCumulativeField = text(row.thstrm_add_amount) !== '';
  const durationWithoutSpanEvidence =
    isQuarterly && !INSTANT_STATEMENTS.has(division) && !hasCumulativeField;

  if (durationWithoutSpanEvidence) {
    skips.push({
      skipped: true,
      reason: `${division} in a quarterly report carries one amount and no cumulative field; span not established`,
      row,
    });
    return { drafts, skips };
  }

  const currency = text(row.currency) || null;
  const fiscalYear = Number(text(row.bsns_year));
  const dimensions: Record<string, string> = {};
  const detail = text(row.account_detail);
  if (detail !== '' && detail !== '-') dimensions.accountDetail = detail;
  if (text(row.account_nm) !== '') dimensions.accountName = text(row.account_nm);

  // A Korean account label is not unique inside one statement. Measured on the
  // live corpus 2026-08-08: 599 groups collided this way, all of them
  // issuer-specific accounts, 549 of them carrying *different* values — one
  // balance sheet lists 충당부채 at ordinal 40 for 1,290,427,460 and again at
  // ordinal 51 for 82,993,173,087, the current and non-current provisions sharing
  // a name and separated only by where they sit.
  //
  // Real XBRL would separate these with a dimension. We do not have one, but we
  // do have the position, so record that as the dimension it is standing in for.
  // The alternative is worse than imprecise: without it the two lines share a
  // restatement group, one supersedes the other, and a reader taking the latest
  // revision silently loses an entire line of the balance sheet.
  //
  // Standard taxonomy concepts are left alone — the concept key already
  // identifies them, and none of the 599 collisions involved one. Adding the
  // ordinal there would break restatement detection, since a correction that
  // shifts line positions must still collide with what it replaces.
  if (!concept.standard) dimensions.statementOrdinal = text(row.ord);

  const emit = (rawAmount: string | undefined, cumulative: boolean) => {
    const value = parseDartAmount(rawAmount);
    if (value === undefined) return;
    const period = resolveDartPeriod({
      fiscalMonth: context.fiscalMonth,
      businessYear: row.bsns_year,
      reportCode,
      statementDivision: division,
      cumulative,
    });
    if ('refused' in period) {
      skips.push({ skipped: true, reason: period.reason, row });
      return;
    }
    drafts.push({
      conceptNamespace: concept.namespace,
      conceptKey: concept.key,
      standardConcept: concept.standard,
      value,
      unit: currency === null ? 'pure' : 'currency',
      currency: currency !== null && /^[A-Z]{3}$/.test(currency) ? currency : null,
      period,
      fiscalYear,
      fiscalQuarter: closingQuarter,
      dimensions,
      locator: buildDartCellLocator(row, cumulative),
      cumulative,
    });
  };

  emit(row.thstrm_amount, false);
  if (hasCumulativeField) emit(row.thstrm_add_amount, true);

  return { drafts, skips };
}

/**
 * A stable fact key. Built from the locator rather than from the values, so a
 * restated filing produces the same key and lands as a revision instead of a
 * duplicate — which is what `restatement_group_key` is for.
 */
export function dartFactKey(draft: NumericFactDraft): string {
  const l = draft.locator;
  return [
    'dart',
    l.receiptNo,
    l.statementDivision,
    l.ordinal,
    l.accountId || draft.conceptKey,
    l.accountDetail || '-',
    draft.cumulative ? 'cum' : 'period',
  ].join(':');
}

/**
 * When a filing became available to the public, and when we knew it.
 *
 * `ingestion.source_revision.available_at` is when *we fetched* the filing. For a
 * 2025 filing collected during a 2026 backfill that is a year late, and writing
 * it into `numeric_fact.available_at` would make every historical fact appear to
 * arrive at backfill time — destroying the only question the column exists to
 * answer. Measured 2026-08-08: receipt 2026-05-14, fetched 2026-08-07.
 *
 * The receipt number carries the receipt date (`20250515002181` → 2025-05-15) and
 * DART publishes on receipt. But the payload states no time of day, so an honest
 * value is a bound, not a moment. Two bounds are available and both are sound:
 *
 *   - the end of the receipt day in KST — it was certainly available by then
 *   - the moment we ingested it — we cannot have fetched it before it existed
 *
 * Both are upper bounds, so the tighter one is still an upper bound: take the
 * minimum. Using an upper bound for `available_at` errs toward pessimism — an
 * analysis sees the fact no earlier than it truly could have — which is the
 * direction that cannot manufacture lookahead.
 *
 * `known_at` is the ingestion moment unchanged. That is the axis that protects a
 * backtest from our own collection history, and it is a fact about us rather
 * than an estimate.
 */
export type DartAvailability = {
  availableAt: string;
  knownAt: string;
  receiptDate: string;
  /** Which of the two bounds won. Recorded so the estimate stays auditable. */
  availableAtBound: 'receipt_day_end_kst' | 'ingested_at';
};

const KST_UTC_OFFSET_HOURS = 9;

export function resolveDartAvailability(input: {
  receiptNo: string;
  ingestedAt: string | Date;
}): DartAvailability | PeriodRefusal {
  const receipt = text(input.receiptNo);
  if (!/^\d{14}$/.test(receipt)) {
    return { refused: true, reason: `unparseable receipt number: ${receipt || '(empty)'}` };
  }

  const year = Number(receipt.slice(0, 4));
  const month = Number(receipt.slice(4, 6));
  const day = Number(receipt.slice(6, 8));

  // The last instant of the receipt day in KST, expressed in UTC: 23:59 KST is
  // 14:59 UTC the same day, so this never crosses a UTC date boundary.
  const LAST_HOUR_OF_DAY = 23;
  const dayEndUtc = new Date(
    Date.UTC(year, month - 1, day, LAST_HOUR_OF_DAY - KST_UTC_OFFSET_HOURS, 59, 59, 999),
  );
  // Date.UTC rolls an impossible day over silently; catching it here keeps a
  // malformed receipt from becoming a plausible-looking timestamp.
  if (dayEndUtc.getUTCMonth() !== month - 1 || dayEndUtc.getUTCDate() !== day) {
    return { refused: true, reason: `receipt number carries no real date: ${receipt}` };
  }

  const ingested = input.ingestedAt instanceof Date ? input.ingestedAt : new Date(input.ingestedAt);
  if (Number.isNaN(ingested.getTime())) {
    return { refused: true, reason: `unparseable ingestion time for receipt ${receipt}` };
  }

  const useIngested = ingested.getTime() < dayEndUtc.getTime();
  return {
    availableAt: (useIngested ? ingested : dayEndUtc).toISOString(),
    knownAt: ingested.toISOString(),
    receiptDate: `${receipt.slice(0, 4)}-${receipt.slice(4, 6)}-${receipt.slice(6, 8)}`,
    availableAtBound: useIngested ? 'ingested_at' : 'receipt_day_end_kst',
  };
}
