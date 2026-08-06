import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapEventCalendar, mapMacroCalendar } from '../src/ingest/run-calendar-promote.ts';

/**
 * The dates existed on disk for months and never reached the database. What this
 * job must not do while fixing that is invent one — a calendar entry with a made-up
 * date is worse than a missing entry, because it reads as knowledge.
 */
describe('macro calendar promotion', () => {
  it('takes a forward-dated central bank meeting', () => {
    const { events } = mapMacroCalendar({
      upcoming_central_banks: [
        { date: '2026-08-28', cb: 'BOK', note: '한국은행 금통위', d_minus: 21, imminent: false },
      ],
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventKind, 'central_bank_meeting');
    assert.equal(events[0]?.scheduledDate, '2026-08-28');
    assert.equal(events[0]?.title, '한국은행 금통위');
  });

  it('drops an entry with no usable date and says so', () => {
    // Never defaulted to today. A date is the whole content of a calendar row.
    const { events, skipped } = mapMacroCalendar({
      upcoming_central_banks: [
        { date: '', cb: 'BOK' },
        { date: 'soon', cb: 'FED' },
      ],
    });
    assert.deepEqual(events, []);
    assert.equal(skipped['central_bank_missing_date_or_name'], 2);
  });

  it('refuses to promote legislation headlines as schedules', () => {
    // macro_calendar.py tags news with a category. There is no vote date, no
    // chamber, no bill id — putting these in a table called scheduled_event would
    // dress a headline as a schedule. Counted so the refusal is visible.
    const { events, skipped } = mapMacroCalendar({
      policy_events: [
        {
          category: 'crypto_legislation',
          title: 'CLARITY Bill Is Running Out Of Time',
          pub_date: 'Mon, 03 Aug 2026',
        },
      ],
    });
    assert.deepEqual(events, []);
    assert.equal(skipped['policy_events_are_headlines_not_schedules'], 1);
  });
});

describe('event calendar promotion', () => {
  it('keeps actual/consensus, because a release carries its own outcome', () => {
    const { events } = mapEventCalendar({
      economic_events: [
        {
          date: '2026-08-06',
          event: 'Interest Rate Decision',
          country: 'India',
          actual: '5.25%',
          consensus: '5.25%',
          previous: '5.25%',
          high_signal: true,
        },
      ],
    });
    assert.equal(events[0]?.eventKind, 'economic_release');
    assert.equal(events[0]?.region, 'India');
    assert.equal(events[0]?.detail['actual'], '5.25%');
    assert.equal(events[0]?.detail['high_signal'], true);
  });

  it('gives the same event on the same day the same key, so a revision replaces it', () => {
    const first = mapEventCalendar({
      economic_events: [{ date: '2026-08-06', event: 'CPI', country: 'US', consensus: '2.9%' }],
    });
    const revised = mapEventCalendar({
      economic_events: [{ date: '2026-08-06', event: 'CPI', country: 'US', actual: '3.0%' }],
    });
    assert.equal(first.events[0]?.dedupeKey, revised.events[0]?.dedupeKey);
  });

  it('keys earnings by symbol and date, not by company name', () => {
    // The name in the feed varies ('ConocoPhillips' vs 'Conoco Phillips'); the
    // symbol does not.
    const a = mapEventCalendar({
      earnings: [{ date: '2026-08-06', symbol: 'COP', name: 'ConocoPhillips' }],
    });
    const b = mapEventCalendar({
      earnings: [{ date: '2026-08-06', symbol: 'COP', name: 'Conoco Phillips' }],
    });
    assert.equal(a.events[0]?.dedupeKey, b.events[0]?.dedupeKey);
  });

  it('survives a snapshot with none of the expected keys', () => {
    // The upstream shape is another project's and can change without warning.
    const { events } = mapEventCalendar({ unexpected: true });
    assert.deepEqual(events, []);
    assert.deepEqual(mapMacroCalendar(null).events, []);
  });
});
