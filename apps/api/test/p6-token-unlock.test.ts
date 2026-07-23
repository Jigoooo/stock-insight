import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateTokenUnlock } from '../src/crypto/token-unlock.ts';

const base = {
  tokenEntityKey: 'crypto:token:eip155:1:0x0000000000000000000000000000000000000001',
  amountUnit: 'TOKEN',
  unlockAmount: 100,
  circulatingSupply: 1_000,
  totalSupply: 2_000,
  percentageOfTotalSupply: 0.05,
  unlockAt: '2026-08-01T00:00:00.000Z',
  availableAt: '2026-07-20T00:00:00.000Z',
  knownAt: '2026-07-20T01:00:00.000Z',
};

describe('P6-3 token unlock coefficient evaluation', () => {
  it('preserves raw coefficients and derives unit-safe supply ratios without price claims', () => {
    const result = evaluateTokenUnlock(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.deepEqual(result.coefficients, {
      unlockAmount: 100,
      circulatingSupply: 1_000,
      totalSupply: 2_000,
      percentageOfTotalSupply: 0.05,
      amountUnit: 'TOKEN',
    });
    assert.equal(result.unlockToCirculatingRatio, 0.1);
    assert.equal(result.unlockToTotalRatio, 0.05);
    assert.equal(result.priceImpactClaimAllowed, false);
    assert.equal(result.readOnly, true);
    assert.equal(result.orderExecutable, false);
  });

  it('does not round or mutate the supplied coefficients', () => {
    const result = evaluateTokenUnlock({
      ...base,
      unlockAmount: 1,
      circulatingSupply: 3,
      totalSupply: 20,
      percentageOfTotalSupply: 0.05,
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.equal(result.unlockToCirculatingRatio, 1 / 3);
      assert.equal(result.coefficients.unlockAmount, 1);
    }
  });

  it('fails closed on inconsistent percentages, invalid chronology, missing units, or impossible supply', () => {
    for (const input of [
      { ...base, percentageOfTotalSupply: 0.2 },
      { ...base, knownAt: '2026-07-19T00:00:00.000Z' },
      { ...base, amountUnit: '' },
      { ...base, unlockAmount: 3_000 },
      { ...base, circulatingSupply: 3_000 },
    ]) {
      assert.deepEqual(evaluateTokenUnlock(input), {
        status: 'abstained',
        reason: 'INVALID_TOKEN_UNLOCK_INPUT',
        priceImpactClaimAllowed: false,
        readOnly: true,
        orderExecutable: false,
      });
    }
  });
});
