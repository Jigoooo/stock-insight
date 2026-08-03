import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluateUser, type PositionRow } from '../src/personalization/run-portfolio-snapshot.ts';

// personalization.portfolio_snapshot and portfolio_lot_snapshot had readers since
// they were created and no writer at all. Registration already worked
// (POST /api/positions), so the gap was only the snapshot the personalization
// read models select from.

const source = readFileSync(
  new URL('../src/personalization/run-portfolio-snapshot.ts', import.meta.url).pathname,
  'utf8',
);

function row(over: Partial<PositionRow> = {}): PositionRow {
  return {
    user_id: 'u1',
    id: 1,
    entity_key: 'KR:000660',
    security_entity_id: 10,
    market: 'KR',
    currency: 'KRW',
    quantity: '10',
    avg_price: '1500000',
    opened_at: null,
    latest_price: 1_718_000,
    price_as_of: new Date('2026-07-31T00:00:00Z'),
    market_value: '17180000',
    krw_per_usd: '1460.76',
    fx_observation_date: new Date('2026-07-24T00:00:00Z'),
    ...over,
  } as PositionRow;
}

test('a holding with no current price refuses the whole snapshot', () => {
  // portfolio_weight is NOT NULL per lot, so dropping one unpriced holding
  // silently rescales every other weight, and position_count plus
  // total_market_value would describe a portfolio the user does not have.
  const outcome = evaluateUser('u1', [
    row(),
    row({ id: 2, entity_key: 'KR:999999', market_value: null }),
  ]);
  assert.equal(outcome.written, false);
  assert.deepEqual(outcome.unpriced, ['KR:999999']);
});

test('a holding whose entity cannot be resolved refuses too', () => {
  // security_entity_id is NOT NULL on the lot table.
  const outcome = evaluateUser('u1', [row({ security_entity_id: null, market_value: null })]);
  assert.equal(outcome.written, false);
  assert.deepEqual(outcome.unresolved, ['KR:000660']);
});

test('a fully priced portfolio is written with the oldest price time', () => {
  // The row claims "the portfolio as of T"; that has to hold for every lot, so the
  // oldest price wins rather than the newest.
  const outcome = evaluateUser('u1', [
    row({ price_as_of: new Date('2026-07-31T00:00:00Z') }),
    row({ id: 2, entity_key: 'US:AMD', price_as_of: new Date('2026-07-27T00:00:00Z') }),
  ]);
  assert.equal(outcome.written, true);
  assert.equal(outcome.snapshotAsOf, '2026-07-27T00:00:00.000Z');
});

test('a zero-value portfolio is refused rather than divided by', () => {
  const outcome = evaluateUser('u1', [row({ market_value: '0' })]);
  assert.equal(outcome.written, false);
  assert.match(outcome.reason ?? '', /zero/);
});

test('the exchange rate is part of the digest', () => {
  // Otherwise a portfolio looks unchanged through a currency swing even though
  // total_market_value moved.
  assert.match(source, /row\.krw_per_usd \?\? ''/);
});

test('the rate is point-in-time, not merely the newest row', () => {
  assert.match(source, /ORDER BY 1, vintage\.observation_date DESC, vintage\.vintage_date DESC/);
});

test('a snapshot is appended only when the portfolio actually changed', () => {
  // Unique is (user_id, snapshot_as_of, snapshot_digest), so an unchanged
  // portfolio at a new as_of would otherwise insert on every pipeline run.
  assert.match(source, /latest\.rows\[0\]\?\.snapshot_digest === digest/);
  assert.match(source, /ON CONFLICT \(user_id, snapshot_as_of, snapshot_digest\) DO NOTHING/);
});

test('exposure is left alone', () => {
  // impact-read-model.ts also reads analytics.impact_exposure_revision. Filling it
  // would mean inventing sign, materiality and economic magnitude per holding.
  assert.doesNotMatch(source, /INSERT INTO analytics\.impact_exposure_revision/);
  assert.match(source, /stays empty on purpose/);
});
