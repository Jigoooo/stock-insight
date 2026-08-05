import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MIN_MENTION_LENGTH_HANGUL,
  MIN_MENTION_LENGTH_LATIN,
  minimumMentionLength,
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
const LS_ELECTRIC_ISSUER = 706;

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
  // A real merge, not a shadow: 엘에스일렉트릭 and LS ELECTRIC share no substring
  // yet name one issuer. This is what ISSUED_BY collapsing exists for, and the
  // 사업보고서 sample contains it verbatim.
  { entityId: 17, issuerEntityId: LS_ELECTRIC_ISSUER, name: '엘에스일렉트릭 주식회사' },
  { entityId: 18, issuerEntityId: LS_ELECTRIC_ISSUER, name: 'LS ELECTRIC' },
];

describe('supply disclosure name resolution', () => {
  it('counts two names of one issuer once, and says it merged them', () => {
    // 엘에스일렉트릭 and LS ELECTRIC share no substring, so neither shadows the
    // other — only the issuer id ties them together. That is a MERGE, and the
    // distinction matters: 한국전력 inside 한국전력공사 is shadowing, a different
    // decision with a different reason.
    const { resolved, mergedByIssuer, rejections } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '삼양식품(주)',
      contextWindows: ['주요 매출처 엘에스일렉트릭 주식회사 및 LS ELECTRIC'],
      catalog,
    });

    assert.deepEqual(
      resolved.map((row) => row.issuerEntityId),
      [LS_ELECTRIC_ISSUER],
    );
    // The merge is reported, not silent. A summary that folds rows away without
    // saying so is how 20 of the sample's 89 hits vanished unexplained.
    assert.equal(mergedByIssuer, 1);
    assert.deepEqual(resolved[0]!.mergedNames, ['엘에스일렉트릭 주식회사']);
    assert.ok(!rejections.some((row) => row.reason === 'shadowed_by_longer_match'));
  });

  it('does not let a two-letter issuer name reject every counterparty', () => {
    // (주)LS normalizes to `ls`. An ungated containment check makes it reject any
    // name containing those letters — `wolseley` included — so containment now
    // requires the REPORTING name to clear the specificity floor as well. Exact
    // equality still applies at any length, so a short name is still never its
    // own customer.
    const { resolved } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '(주)LS',
      contextWindows: ['주요 매출처 현대자동차(주)'],
      catalog,
    });

    assert.deepEqual(
      resolved.map((row) => row.issuerEntityId),
      [HYUNDAI_MOTOR_ISSUER],
    );
  });

  it('calls a prefix a shadow, not a merge', () => {
    // 한국전력 IS a substring of 한국전력공사, so the shorter one loses to the
    // longer rather than folding into it. Same outcome for the caller, different
    // reason — and the reason is what a reader needs to judge the rule.
    const { resolved, rejections, mergedByIssuer } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '현대건설(주)',
      contextWindows: ['주요 매출처는 한국전력 및 한국전력공사(주) 등이다'],
      catalog,
    });

    assert.deepEqual(
      resolved.map((row) => row.issuerEntityId),
      [KEPCO_ISSUER],
    );
    assert.equal(mergedByIssuer, 0);
    assert.ok(rejections.some((row) => row.reason === 'shadowed_by_longer_match'));
  });

  it('closes the arithmetic: every hit is resolved, rejected, or merged', () => {
    // Re-measured on the 40-report sample 2026-08-05: 89 raw hits became 35
    // mentions with 34 rejections, and the missing 20 were merges that left no
    // trace. Nothing may leave this function uncounted.
    const window =
      '주요 매출처 한국전력 한국전력공사(주) 한국전력기술(주) 현대자동차(주) 현대모비스 GS NC';
    const { resolved, rejections, mergedByIssuer } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '삼양식품(주)',
      contextWindows: [window],
      catalog,
    });

    const normalizedWindow = normalizeCompanyName(window);
    const hits = new Set(
      catalog
        .map((entry) => normalizeCompanyName(entry.name))
        .filter((needle) => needle.length > 0 && normalizedWindow.includes(needle)),
    );

    assert.equal(
      resolved.length + rejections.length + mergedByIssuer,
      hits.size,
      `resolved ${resolved.length} + rejected ${rejections.length} + merged ${mergedByIssuer} must equal ${hits.size} hits`,
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

  it('sees 기아 now — the floor is by script, not by length', () => {
    // This test used to assert the opposite: that the flat floor of 4 dropped 기아,
    // a real two-character customer, and that the cost was recorded rather than
    // hidden. Measuring the whole catalog on 2026-08-06 showed the floor was paying
    // for the wrong thing — 19 of 24 sub-4 Hangul names collide with NOTHING, while
    // every dangerous case (t 66 collisions, lg 4, sk 3, ls 2, gm 1) is Latin.
    assert.equal(MIN_MENTION_LENGTH_HANGUL, 2);
    const { resolved } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '포스코홀딩스(주)',
      contextWindows: ['주요 매출처 기아'],
      catalog: [{ entityId: 30, issuerEntityId: 810, name: '기아' }],
    });
    assert.deepEqual(resolved, [{ issuerEntityId: 810, matchedName: '기아', mergedNames: [] }]);
  });

  it('still refuses the short Latin names that hide inside other words', () => {
    // The protection this change had to preserve. `gm` is inside figma, `ls` inside
    // wellsfargo, `sk` inside novonordiskas — all measured in the live catalog, and
    // all under 4 characters, so the Latin floor still excludes them.
    assert.equal(MIN_MENTION_LENGTH_LATIN, 4);
    const { resolved, rejections } = resolveCustomerMentions({
      reportingIssuerEntityId: 900,
      reportingName: '포스코홀딩스(주)',
      contextWindows: ['주요 매출처 Figma, Inc. 와 Wells Fargo & Company'],
      catalog: [
        { entityId: 40, issuerEntityId: 820, name: 'GM' },
        { entityId: 41, issuerEntityId: 821, name: '(주)LS' },
      ],
    });
    assert.deepEqual(resolved, []);
    assert.deepEqual(rejections.map((row) => row.reason).sort(), [
      'below_minimum_specificity',
      'below_minimum_specificity',
    ]);
  });

  it('treats a mixed-script name as Hangul, because the Hangul is what makes it specific', () => {
    // `lg전자` cannot hide inside a Latin word: the moment a Hangul syllable is in
    // the needle, the failure mode the Latin floor guards against is gone.
    assert.equal(minimumMentionLength('lg전자'), MIN_MENTION_LENGTH_HANGUL);
    assert.equal(minimumMentionLength('gm'), MIN_MENTION_LENGTH_LATIN);
    assert.equal(minimumMentionLength('기아'), MIN_MENTION_LENGTH_HANGUL);
  });
});
