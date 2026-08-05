import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MIN_MENTION_LENGTH,
  normalizeCompanyName,
  resolveCustomerMentions,
  type NameCatalogEntry,
} from '../src/ingest/supply-disclosure-resolution.ts';

/**
 * Every case here is a real row from the 40-report sample measured 2026-08-05.
 *
 * A naive substring match produced 89 pairs where the honest count is 37. The 52
 * extra were three mistakes, and this suite pins each one — because the mistake
 * is invisible in aggregate: 89 looks like a better yield than 37.
 */
const KEPCO_ISSUER = 700;
const KEPCO_TECH_ISSUER = 701;
const HYUNDAI_MOTOR_ISSUER = 702;
const MOBIS_ISSUER = 703;

const catalog: NameCatalogEntry[] = [
  // 한국전력 is a SECURITY name; ISSUED_BY collapses it onto the issuer, which is
  // why the two forms must count once, not twice.
  { entityId: 10, issuerEntityId: KEPCO_ISSUER, name: '한국전력' },
  { entityId: 11, issuerEntityId: KEPCO_ISSUER, name: '한국전력공사(주)' },
  // A real prefix trap from the ledger: 한전기술 → 한국전력기술(주).
  { entityId: 12, issuerEntityId: KEPCO_TECH_ISSUER, name: '한국전력기술(주)' },
  { entityId: 13, issuerEntityId: HYUNDAI_MOTOR_ISSUER, name: '현대자동차(주)' },
  { entityId: 14, issuerEntityId: MOBIS_ISSUER, name: '현대모비스' },
  { entityId: 15, issuerEntityId: 704, name: 'GS' },
  { entityId: 16, issuerEntityId: 705, name: 'NC' },
];

describe('supply disclosure name resolution', () => {
  it('counts two names of one issuer once', () => {
    // 현대건설's report names both forms. Before ISSUED_BY collapsing, this pair
    // was two rows and inflated the yield.
    const { resolved } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '현대건설(주)',
      contextWindows: ['주요 매출처는 한국전력 및 한국전력공사(주) 등이다'],
      catalog,
    });

    assert.deepEqual(
      resolved.map((row) => row.issuerEntityId),
      [KEPCO_ISSUER],
    );
  });

  it('gives a mention to the longer name, not its prefix', () => {
    // 한국전력 is a genuine prefix of 한국전력기술. A shorter name must not claim
    // a mention that belongs to the longer one.
    const { resolved, rejections } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '삼양식품(주)',
      contextWindows: ['주요 매출처 한국전력기술(주)'],
      catalog,
    });

    assert.deepEqual(
      resolved.map((row) => row.issuerEntityId),
      [KEPCO_TECH_ISSUER],
    );
    assert.ok(
      rejections.some((row) => row.reason === 'shadowed_by_longer_match'),
      '한국전력 matched the same window and must lose to 한국전력기술',
    );
  });

  it('drops the short names that matched anywhere in the window', () => {
    // 롯데에너지머티리얼즈 → "NC, GS" was the clearest noise in the sample: both
    // are two characters and appear inside unrelated words.
    const { resolved, rejections } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '롯데에너지머티리얼즈(주)',
      contextWindows: ['주요 매출처 관련 NCM 양극재와 GS칼텍스 인근 물류'],
      catalog,
    });

    assert.deepEqual(resolved, []);
    for (const needle of ['gs', 'nc']) {
      assert.ok(
        rejections.some(
          (row) => row.needle === needle && row.reason === 'below_minimum_specificity',
        ),
        `${needle} is ${needle.length} characters and cannot be a mention`,
      );
    }
  });

  it('never lets a report name itself as a customer', () => {
    // 대한전선 → 대한전선 was in the raw output.
    const { resolved, rejections } = resolveCustomerMentions({
      reportingIssuerEntityId: HYUNDAI_MOTOR_ISSUER,
      reportingName: '현대자동차(주)',
      contextWindows: ['주요 매출처는 현대자동차(주) 및 현대모비스'],
      catalog,
    });

    assert.deepEqual(
      resolved.map((row) => row.issuerEntityId),
      [MOBIS_ISSUER],
    );
    assert.ok(rejections.some((row) => row.reason === 'self_or_same_name_group'));
  });

  it('refuses a name that two issuers share', () => {
    // One string, two counterparties. Choosing either is the guess these jobs
    // exist to avoid — the same rule run-event-text-attribution applies.
    const shared: NameCatalogEntry[] = [
      { entityId: 20, issuerEntityId: 800, name: '대한전선' },
      { entityId: 21, issuerEntityId: 801, name: '대한전선' },
    ];
    const { resolved, rejections } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '삼성전자(주)',
      contextWindows: ['주요 매출처 대한전선'],
      catalog: shared,
    });

    assert.deepEqual(resolved, []);
    assert.deepEqual(rejections, [{ needle: '대한전선', reason: 'ambiguous_across_issuers' }]);
  });

  it('normalizes the corporate forms Korean filings vary freely', () => {
    assert.equal(normalizeCompanyName('(주)포스코퓨처엠'), '포스코퓨처엠');
    assert.equal(normalizeCompanyName('엘에스일렉트릭 주식회사'), '엘에스일렉트릭');
    assert.equal(normalizeCompanyName('삼성 SDI ㈜'), '삼성sdi');
  });

  it('states the specificity floor it cannot see past', () => {
    // 기아 is a real 포스코홀딩스 customer and two characters long. The floor
    // costs it, and that cost is the reason this is a threshold rather than a
    // solution — recorded so the next reader does not lower it by accident.
    assert.equal(MIN_MENTION_LENGTH, 4);
    const { resolved } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '포스코홀딩스(주)',
      contextWindows: ['주요 매출처 기아'],
      catalog: [{ entityId: 30, issuerEntityId: 810, name: '기아' }],
    });
    assert.deepEqual(resolved, [], '기아 is genuine and this rule still drops it');
  });
});
