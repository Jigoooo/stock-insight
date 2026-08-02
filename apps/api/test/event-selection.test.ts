import assert from 'node:assert/strict';
import test from 'node:test';

import { rankEventsByStrength } from '../src/analytics/run-v2-analytics-publish.ts';

// EVENT_LIMIT is a compute budget, and the rule that spends it only matters once
// it binds. It used to spend it on the most RECENT events. When event attribution
// doubled the candidate pool, recency handed 210 of 500 slots to events whose
// entities have no edge in the relation graph — they cannot produce a path by
// construction — and paths fell 9,312 to 5,527 while 35 holdings lost their
// impact brief. Adding information made coverage worse.

const ASOF = '2026-08-03T00:00:00.000Z';

type Row = Parameters<typeof rankEventsByStrength>[0][number];

function event(overrides: Partial<Row> & { event_id: number }): Row {
  return {
    event_type: 'earnings',
    target_entity_id: 1,
    occurred_at: ASOF,
    has_document: true,
    ...overrides,
  } as Row;
}

const connected = new Set([1, 2, 3]);

test('an event on an entity with no edges is never selected', () => {
  // The walk starts at the event's entity and has nowhere to go. Spending a slot
  // on it is not a weak choice, it is a guaranteed-empty one.
  const selected = rankEventsByStrength(
    [event({ event_id: 1, target_entity_id: 99 }), event({ event_id: 2, target_entity_id: 1 })],
    ASOF,
    10,
    connected,
  );
  assert.deepEqual(
    selected.map((row) => Number(row.event_id)),
    [2],
  );
});

test('freshness decay outweighs the type weight within a month', () => {
  const selected = rankEventsByStrength(
    [
      // insider_trade carries the lowest type weight.
      event({ event_id: 1, event_type: 'insider_trade', target_entity_id: 1 }),
      event({ event_id: 2, event_type: 'ma_deal', target_entity_id: 2 }),
      event({
        event_id: 3,
        event_type: 'ma_deal',
        target_entity_id: 3,
        occurred_at: '2026-07-04T00:00:00.000Z',
      }),
    ],
    ASOF,
    3,
    connected,
  );
  // Same-day M&A 0.99, same-day insider trade 0.54, 30-day-old M&A 0.22. The
  // half-life is 14 days, so a month of age costs more than the widest gap
  // between type weights (1.1 vs 0.6) — worth knowing before tuning either.
  assert.deepEqual(
    selected.map((row) => Number(row.event_id)),
    [2, 1, 3],
  );
});

test('the budget is respected and spent on the strongest', () => {
  const rows = [
    event({ event_id: 1, event_type: 'insider_trade', target_entity_id: 1 }),
    event({ event_id: 2, event_type: 'ma_deal', target_entity_id: 2 }),
    event({ event_id: 3, event_type: 'earnings', target_entity_id: 3 }),
  ];
  const selected = rankEventsByStrength(rows, ASOF, 2, connected);
  assert.equal(selected.length, 2);
  assert.equal(
    selected.some((row) => Number(row.event_id) === 1),
    false,
    'the weakest is what gets dropped',
  );
});

test('selection is deterministic so a replay picks the same set', () => {
  // Two events identical in every scoring input: without a tiebreak the order
  // would depend on load order and a replay could publish a different snapshot.
  const rows = [
    event({ event_id: 7, target_entity_id: 1 }),
    event({ event_id: 9, target_entity_id: 2 }),
  ];
  const first = rankEventsByStrength(rows, ASOF, 1, connected);
  const second = rankEventsByStrength([...rows].reverse(), ASOF, 1, connected);
  assert.deepEqual(
    first.map((row) => Number(row.event_id)),
    second.map((row) => Number(row.event_id)),
  );
});

test('an empty connected set selects nothing rather than everything', () => {
  // Fail closed: a snapshot with no edges must yield no paths, not every event.
  const selected = rankEventsByStrength([event({ event_id: 1 })], ASOF, 10, new Set());
  assert.deepEqual(selected, []);
});
