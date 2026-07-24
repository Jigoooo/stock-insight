import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileCryptoCoreRelation } from '../src/crypto/cross-domain-relation.ts';

const digest = 'a'.repeat(64);
const base = {
  cryptoEntityKey: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
  coreEntityKey: 'COMPANY:US:MSTR',
  relationKind: 'treasury_held_by_company',
  relationState: 'verified',
  economicMagnitude: 214_000,
  economicMagnitudeUnit: 'BTC',
  epistemicConfidence: 0.99,
  reviewerId: 'research-reviewer',
  sourceRevisionId: 123,
  evidenceDigest: digest,
  availableAt: '2026-07-20T00:00:00.000Z',
  knownAt: '2026-07-20T01:00:00.000Z',
};

describe('P6-5 crypto-core relation compiler', () => {
  it('represents bitcoin treasury exposure without collapsing stock and crypto identity', () => {
    const result = compileCryptoCoreRelation(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.cryptoEntityKey, base.cryptoEntityKey);
    assert.equal(result.coreEntityKey, 'COMPANY:US:MSTR');
    assert.equal(result.relationKind, 'treasury_held_by_company');
    assert.equal(result.economicMagnitude, 214_000);
    assert.equal(result.epistemicConfidence, 0.99);
    assert.equal(result.readOnly, true);
    assert.equal(result.orderExecutable, false);
    assert.equal(
      compileCryptoCoreRelation({ ...base, coreEntityKey: 'US:MSTR' }).status,
      'abstained',
    );
  });

  it('supports stablecoin issuer and reserve-manager company links', () => {
    const cases = [
      {
        ...base,
        cryptoEntityKey:
          'crypto:stablecoin:eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        coreEntityKey: 'COMPANY:US:CIRCLE',
        relationKind: 'issued_by_company',
        economicMagnitude: null,
        economicMagnitudeUnit: null,
      },
      {
        ...base,
        cryptoEntityKey:
          'crypto:stablecoin:eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7',
        coreEntityKey: 'LEGAL_ENTITY:VG:TETHER',
        relationKind: 'reserve_managed_by_company',
        economicMagnitude: null,
        economicMagnitudeUnit: null,
      },
    ];
    for (const input of cases) {
      const result = compileCryptoCoreRelation(input);
      assert.equal(result.status, 'ok');
      if (result.status === 'ok') assert.equal(result.relationKind, input.relationKind);
    }
  });

  it('fails closed on ticker-only core IDs, missing review, weighted magnitude, or chronology errors', () => {
    for (const input of [
      { ...base, coreEntityKey: 'MSTR' },
      { ...base, reviewerId: null },
      { ...base, confidenceWeightedMagnitude: 211_860 },
      { ...base, knownAt: '2026-07-19T00:00:00.000Z' },
      { ...base, economicMagnitude: 10, economicMagnitudeUnit: null },
      { ...base, cryptoEntityKey: 'crypto:x' },
    ]) {
      assert.deepEqual(compileCryptoCoreRelation(input), {
        status: 'abstained',
        reason: 'INVALID_CRYPTO_CORE_RELATION',
        readOnly: true,
        orderExecutable: false,
      });
    }
  });
});
