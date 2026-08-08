import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCorporateActionRows,
  corporateActionKey,
  exactRatio,
  type CollectedAction,
} from '../src/backfill/security-corporate-action.ts';

function action(overrides: Partial<CollectedAction> = {}): CollectedAction {
  return {
    securityMasterId: 148,
    actionType: 'split',
    effectiveDate: '2022-04-08',
    ratio: '2',
    currency: 'KRW',
    sourceProvider: 'yfinance',
    availableAt: '2026-07-18T07:04:19.771Z',
    ...overrides,
  };
}

describe('split ratios — the fraction somebody announced', () => {
  it('reads a two for one as 2/1', () => {
    assert.deepEqual(exactRatio(2), { numerator: 2, denominator: 1 });
  });

  it('reads three for two as 3/2', () => {
    assert.deepEqual(exactRatio(1.5), { numerator: 3, denominator: 2 });
  });

  it('reads a Korean five percent bonus issue as 21/20', () => {
    // 27 of the 508 collected splits carry 1.05, which is a 무상증자 rather than
    // a split, and yfinance reports it in the same column.
    assert.deepEqual(exactRatio(1.05), { numerator: 21, denominator: 20 });
  });

  it('reads a one for ten reverse split as 1/10', () => {
    assert.deepEqual(exactRatio(0.1), { numerator: 1, denominator: 10 });
  });

  it('resolves a repeating decimal to the fraction it repeats', () => {
    // A one for three arrives as 0.3333333333333333. A fixed epsilon over a
    // denominator scan misses it; a continued fraction does not.
    assert.deepEqual(exactRatio(0.3333333333333333), { numerator: 1, denominator: 3 });
    assert.deepEqual(exactRatio(1.3333333333333333), { numerator: 4, denominator: 3 });
  });

  it('refuses a number nobody would announce as a ratio', () => {
    // 0.9878 and 0.650655 sit in the same column as the real ratios and are
    // price factors, not exchanges. Rounding them to 81/82 or 65/100 would put a
    // fabricated announcement in the record.
    assert.equal(exactRatio(0.9878), null);
    assert.equal(exactRatio(0.650655), null);
  });

  it('refuses a ratio that is not a positive number', () => {
    for (const value of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(exactRatio(value), null);
    }
  });
});

describe('the continuity bridge takes continuity events', () => {
  it('records a split above one as a split', () => {
    const { rows } = buildCorporateActionRows([action()]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actionKind, 'split');
    assert.equal(rows[0].ratioNumerator, 2);
    assert.equal(rows[0].ratioDenominator, 1);
  });

  it('records a ratio below one as a reverse split', () => {
    const { rows } = buildCorporateActionRows([action({ ratio: '0.1' })]);
    assert.equal(rows[0].actionKind, 'reverse_split');
    assert.deepEqual([rows[0].ratioNumerator, rows[0].ratioDenominator], [1, 10]);
  });

  it('keeps the event when only its ratio is unusable', () => {
    // The split is evidenced by the collector even when the number it carries is
    // not an announced exchange. Dropping the event would lose a real
    // discontinuity; filling the ratio would invent one.
    const { rows, skips } = buildCorporateActionRows([action({ ratio: '0.650655' })]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ratioNumerator, null);
    assert.equal(rows[0].ratioDenominator, null);
    assert.equal(rows[0].metadata.observedRatio, 0.650655);
    assert.equal(rows[0].metadata.ratioNotExact, true);
    assert.ok(skips.some((skip) => /not an announced fraction/.test(skip.reason)));
  });

  it('leaves dividends where they are', () => {
    // action_kind has no word for a dividend, and nothing in the payload
    // separates a special dividend from an ordinary one.
    const { rows, skips } = buildCorporateActionRows([
      action({ actionType: 'dividend', ratio: null }),
    ]);
    assert.equal(rows.length, 0);
    assert.match(skips[0].reason, /not a claim-continuity event/);
  });

  it('drops a one for one split, which bridges nothing', () => {
    const { rows, skips } = buildCorporateActionRows([action({ ratio: '1' })]);
    assert.equal(rows.length, 0);
    assert.match(skips[0].reason, /changes nothing/);
  });

  it('dates knowledge from collection, the only moment the payload states', () => {
    // announced_at is null for all 10,040 collected rows, so an earlier known_at
    // would be invented and a later one would hide that we hold it.
    const { rows } = buildCorporateActionRows([action()]);
    assert.equal(rows[0].knownAt, '2026-07-18T07:04:19.771Z');
    assert.ok(rows[0].knownAt > rows[0].effectiveAt);
  });
});

describe('an event that happened once is written once', () => {
  it('gives the same key to the same split seen on two collections', () => {
    // The collector appends a row per run, so the bridge would otherwise grow a
    // duplicate every night for a split from 1965.
    const first = buildCorporateActionRows([action()]).rows[0];
    const second = buildCorporateActionRows([action({ availableAt: '2026-08-01T00:00:00.000Z' })])
      .rows[0];
    assert.equal(corporateActionKey(first), corporateActionKey(second));
  });

  it('separates a split from a reverse split on the same day', () => {
    const split = buildCorporateActionRows([action()]).rows[0];
    const reverse = buildCorporateActionRows([action({ ratio: '0.5' })]).rows[0];
    assert.notEqual(corporateActionKey(split), corporateActionKey(reverse));
  });
});
