export const legislativeActionMigrationSql = `
-- Admit legislative actions into market.scheduled_event.
--
-- Migration 074 said plainly that this table was NOT a legislative calendar,
-- because no project collected one — macro_calendar.py's 'policy_events' are news
-- headlines with a category, carrying no vote date, no chamber and no bill id.
-- That was true when 074 was written. CONGRESS_GOV_API_KEY was added on
-- 2026-08-07 and api.congress.gov returns exactly the missing shape:
--
--   S850    2026-08-05  Passed Senate with amendments by Unanimous Consent
--   HR9882  2026-07-22  Referred to the House Committee on Homeland Security
--
-- A date, a chamber, and an identity. So the kind is admitted now, and 074's
-- comment is superseded rather than left to read as still-current.
--
-- MODELLED AS AN ACTION, NOT A BILL. A bill has identity and a stream of actions
-- over months; this table holds dated rows. One row per (bill, action date) is the
-- honest fit for a calendar and is what the collector writes. A first-class bill
-- with revision history is a larger thing and is deliberately not faked here by
-- overloading 'title'.
ALTER TABLE market.scheduled_event
  DROP CONSTRAINT IF EXISTS scheduled_event_kind_check;

ALTER TABLE market.scheduled_event
  ADD CONSTRAINT scheduled_event_kind_check CHECK (event_kind = ANY (ARRAY[
    'central_bank_meeting',
    'economic_release',
    'earnings',
    -- One dated action on one bill: introduced, referred, passed, vetoed. The
    -- chamber and bill id live in detail; the date is what makes it a calendar row.
    'legislative_action'
  ]));
`;
