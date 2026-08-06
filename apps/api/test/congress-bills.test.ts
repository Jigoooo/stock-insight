import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapBills } from '../src/ingest/run-congress-bills.ts';

/**
 * The gap this fills was recorded in migration 074 as "no project collects bill
 * status or chamber schedules". The risk in filling it is the opposite of the
 * risk in leaving it empty: congress.gov returns a date on every row, and only
 * one of them means what a reader will assume.
 */
describe('congress bill actions', () => {
  it('takes the action date and the chamber from the bill type', () => {
    const { actions } = mapBills({
      bills: [
        {
          type: 'S',
          number: '850',
          congress: 119,
          title: 'Northern Border Security Enhancement and Review Act',
          latestAction: { actionDate: '2026-08-05', text: 'Passed Senate with amendments.' },
        },
      ],
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.scheduledDate, '2026-08-05');
    assert.equal(actions[0]?.detail['chamber'], 'Senate');
    assert.equal(actions[0]?.detail['bill_id'], 'S850');
    assert.match(actions[0]!.title, /^S850 — Northern Border/);
  });

  it('reads HR as the House', () => {
    const { actions } = mapBills({
      bills: [
        {
          type: 'HR',
          number: '9882',
          title: 'DHS Act',
          latestAction: { actionDate: '2026-07-22' },
        },
      ],
    });
    assert.equal(actions[0]?.detail['chamber'], 'House');
  });

  it('drops a bill whose only date is updateDate', () => {
    // The trap. congress.gov puts updateDate on every row — it is when the API
    // RECORD changed, not when a chamber did anything. Substituting it would place
    // an administrative timestamp where a reader expects a legislative one.
    const { actions, skipped } = mapBills({
      bills: [
        {
          type: 'HR',
          number: '1',
          title: 'Some Act',
          updateDate: '2026-08-06T16:18:43Z',
          latestAction: {},
        },
      ],
    });
    assert.deepEqual(actions, []);
    assert.equal(skipped['no_action_date'], 1);
  });

  it('refuses a row that cannot name the bill', () => {
    const { actions, skipped } = mapBills({
      bills: [{ type: '', number: '', title: '', latestAction: { actionDate: '2026-08-05' } }],
    });
    assert.deepEqual(actions, []);
    assert.equal(skipped['incomplete_bill_identity'], 1);
  });

  it('keys one row per bill and action date, so a later action is a new row', () => {
    const { actions } = mapBills({
      bills: [
        { type: 'S', number: '850', title: 'Act', latestAction: { actionDate: '2026-08-05' } },
        { type: 'S', number: '850', title: 'Act', latestAction: { actionDate: '2026-08-06' } },
      ],
    });
    assert.notEqual(actions[0]?.dedupeKey, actions[1]?.dedupeKey);
    assert.equal(actions[0]?.dedupeKey, 'bill:s850:2026-08-05');
  });

  it('survives a payload with no bills', () => {
    assert.deepEqual(mapBills({}).actions, []);
    assert.deepEqual(mapBills(null).actions, []);
  });
});
