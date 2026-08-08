import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEconomicClaims,
  findClaimViolations,
  krxTickerRulesOutPreferred,
  planClaimWrites,
  type SecurityReading,
} from '../src/backfill/economic-claim.ts';

const KNOWN_AT = '2026-08-08T12:00:00.000Z';

function security(overrides: Partial<SecurityReading> = {}): SecurityReading {
  return {
    securityMasterId: 26,
    primaryTicker: '086520',
    issuerEntityId: 412,
    currency: 'KRW',
    listedFrom: '2021-03-01T00:00:00.000Z',
    createdAt: '2026-07-18T00:00:00.000Z',
    hasHoldingsSnapshot: false,
    ...overrides,
  };
}

describe('the KRX code settles less than it looks', () => {
  it('rules out a preferred line when the code ends in zero', () => {
    assert.equal(krxTickerRulesOutPreferred('005930'), true);
  });

  it('does not rule out a fund, which numbers the same way', () => {
    // 069500 is KODEX 200. Reading "ends in 0" as "common share" would classify
    // every Korean ETF as equity in an issuer.
    assert.equal(krxTickerRulesOutPreferred('069500'), true);
    const { rows } = buildEconomicClaims([security({ primaryTicker: '069500' })], KNOWN_AT);
    assert.equal(rows[0].claimTypeState, 'undetermined');
  });

  it('says nothing about a preferred line or a foreign ticker', () => {
    assert.equal(krxTickerRulesOutPreferred('005935'), false);
    assert.equal(krxTickerRulesOutPreferred('AMZN'), false);
  });
});

describe('what the database can actually determine', () => {
  it('determines a fund unit from a collected holdings snapshot', () => {
    // Two of 297 — XLE and XLK. A security we hold a basket listing for holds a
    // basket, and a claim on a basket is a claim on the fund.
    const { rows, determined } = buildEconomicClaims(
      [security({ primaryTicker: 'XLE', hasHoldingsSnapshot: true })],
      KNOWN_AT,
    );
    assert.equal(determined, 1);
    assert.equal(rows[0].claimType, 'FUND_UNIT');
    assert.equal(rows[0].claimTypeState, 'determined');
    assert.match(rows[0].determinationBasis, /holds a basket/);
  });

  it('leaves everything else undetermined rather than assuming common equity', () => {
    // SMH is a VanEck ETF carrying entity_type='Stock' with no snapshot. A
    // COMMON_EQUITY default would state that it is equity in an issuer.
    const { rows } = buildEconomicClaims([security({ primaryTicker: 'SMH' })], KNOWN_AT);
    assert.equal(rows[0].claimType, null);
    assert.equal(rows[0].claimTypeState, 'undetermined');
  });

  it('says what was looked at when it found nothing', () => {
    // Otherwise a later reader cannot tell a gap in the data from a gap in the
    // effort.
    const { rows } = buildEconomicClaims([security()], KNOWN_AT);
    assert.match(rows[0].determinationBasis, /no claim-type evidence/);
    assert.match(rows[0].determinationBasis, /no share-class field/);
    assert.match(rows[0].determinationBasis, /rules out a preferred line but not a fund/);
  });

  it('omits the KRX note for a ticker the convention does not cover', () => {
    const { rows } = buildEconomicClaims([security({ primaryTicker: 'AMZN' })], KNOWN_AT);
    assert.doesNotMatch(rows[0].determinationBasis, /KRX/);
  });
});

describe('when the claim starts', () => {
  it('starts from the listing rather than from our record of it', () => {
    const { rows } = buildEconomicClaims([security()], KNOWN_AT);
    assert.equal(rows[0].validFrom, '2021-03-01T00:00:00.000Z');
  });

  it('falls back to our own row when there is no listing', () => {
    const { rows } = buildEconomicClaims([security({ listedFrom: null })], KNOWN_AT);
    assert.equal(rows[0].validFrom, '2026-07-18T00:00:00.000Z');
  });

  it('carries the issuer so the claim names what it is a claim against', () => {
    const { rows } = buildEconomicClaims([security()], KNOWN_AT);
    assert.equal(rows[0].issuerEntityId, 412);
  });
});

describe('violations are counted before a transaction opens', () => {
  it('passes a well formed set', () => {
    const { rows } = buildEconomicClaims(
      [security(), security({ securityMasterId: 27, hasHoldingsSnapshot: true })],
      KNOWN_AT,
    );
    assert.deepEqual(findClaimViolations(rows), []);
  });

  it('catches a state that disagrees with its claim type', () => {
    const [row] = buildEconomicClaims([security()], KNOWN_AT).rows;
    const broken = [{ ...row, claimTypeState: 'determined' as const }];
    assert.equal(
      findClaimViolations(broken)[0]?.rule,
      'claim_type_state disagrees with claim_type',
    );
  });

  it('catches a claim known before it existed', () => {
    const [row] = buildEconomicClaims([security()], '2000-01-01T00:00:00.000Z').rows;
    assert.ok(findClaimViolations([row]).some((v) => v.rule === 'known_at precedes valid_from'));
  });
});

describe('an unknown must be able to stop being unknown', () => {
  // The first version of this writer skipped every security that had an open
  // claim, which froze all 295 undetermined rows: `etf:` documents number 231 and
  // grow, so a snapshot arriving for a security we could not classify would have
  // its FUND_UNIT discarded on the way to the database.
  const undetermined = (securityMasterId: number) => ({
    economicClaimId: securityMasterId * 10,
    securityMasterId,
    claimType: null,
    claimTypeState: 'undetermined' as const,
  });

  it('fills in a determination that arrives later', () => {
    const built = buildEconomicClaims(
      [security({ primaryTicker: 'SMH', hasHoldingsSnapshot: true })],
      KNOWN_AT,
    ).rows;
    const plan = planClaimWrites(built, [undetermined(26)]);

    assert.equal(plan.fills.length, 1);
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.fills[0].economicClaimId, 260);
    assert.equal(plan.fills[0].row.claimType, 'FUND_UNIT');
    assert.equal(plan.fills[0].previousState, 'undetermined');
  });

  it('leaves a claim that has not changed alone', () => {
    const built = buildEconomicClaims([security()], KNOWN_AT).rows;
    const plan = planClaimWrites(built, [undetermined(26)]);
    assert.equal(plan.unchanged, 1);
    assert.equal(plan.fills.length, 0);
    assert.equal(plan.inserts.length, 0);
  });

  it('opens a claim for a security that has none', () => {
    const plan = planClaimWrites(buildEconomicClaims([security()], KNOWN_AT).rows, []);
    assert.equal(plan.inserts.length, 1);
  });

  it('refuses to overwrite a claim that was already stated', () => {
    // Nothing in the current rules produces this — there is one determination
    // rule and it only ever adds — so if it appears the cause is upstream and
    // rewriting silently is the worst available response.
    const built = buildEconomicClaims([security()], KNOWN_AT).rows;
    const plan = planClaimWrites(built, [
      {
        economicClaimId: 260,
        securityMasterId: 26,
        claimType: 'FUND_UNIT',
        claimTypeState: 'determined',
      },
    ]);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.fills.length, 0);
    assert.equal(plan.inserts.length, 0);
    assert.deepEqual(plan.conflicts[0], {
      economicClaimId: 260,
      storedClaimType: 'FUND_UNIT',
      builtClaimType: null,
    });
  });

  it('does not move valid_from when it fills one in', () => {
    // The claim did not change, our knowledge of it did. A new interval starting
    // today would state that the security became a fund unit today.
    const built = buildEconomicClaims([security({ hasHoldingsSnapshot: true })], KNOWN_AT).rows;
    const plan = planClaimWrites(built, [undetermined(26)]);
    assert.equal(plan.fills[0].row.validFrom, '2021-03-01T00:00:00.000Z');
    assert.equal(plan.fills[0].row.knownAt, KNOWN_AT);
  });
});
