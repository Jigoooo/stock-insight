import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEconomicClaims,
  findClaimViolations,
  krxTickerRulesOutPreferred,
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
