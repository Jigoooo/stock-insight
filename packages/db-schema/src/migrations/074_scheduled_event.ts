export const scheduledEventMigrationSql = `
-- Dated things that have not happened yet — and the ones that just did.
--
-- research-common has been collecting this daily for months and throwing the dates
-- away. scripts/event_calendar.py and research_common/macro_calendar.py are both
-- scheduled in run_collectors.py; both write a JSON file. What reaches Postgres is
-- a derived signal card by way of signal_graph.db, and the card keeps the
-- narrative, not the date. Measured 2026-08-07: macro-calendar-latest.json holds
-- 'BOK 2026-08-28 한국은행 금통위, D-21' and nothing in this database knows it.
--
-- WHAT THIS TABLE IS NOT. It is not a legislative calendar. The user asked for
-- bill status and chamber schedules (상원/하원, 국회 의안정보) and NO project
-- collects them — macro_calendar.py's 'policy_events' are news headlines tagged
-- with a category ('crypto_legislation' + a Forbes title), not a schedule with a
-- vote date. That needs a new external source (Congress.gov, 열린국회정보) and is
-- deliberately out of scope here rather than half-modelled.
--
-- Bitemporal because a calendar is revised: a release date moves, a consensus is
-- updated, an actual lands. observed_at is when the upstream snapshot was
-- generated; known_at is when we read it. Rows are upserted on dedupe_key so a
-- revision replaces the forecast rather than accumulating duplicates — this is a
-- calendar, not a ledger, and the previous consensus is not evidence anyone cites.
CREATE TABLE IF NOT EXISTS market.scheduled_event (
  scheduled_event_id BIGSERIAL PRIMARY KEY,
  -- Which upstream snapshot produced it, so a bad feed can be found by source.
  source_key      TEXT NOT NULL,
  event_kind      TEXT NOT NULL,
  scheduled_date  DATE NOT NULL,
  -- Country or market as the upstream states it. Not normalised to our own
  -- market codes: 'India' and 'Euro Zone' appear here and have no entity.
  region          TEXT,
  title           TEXT NOT NULL,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key      TEXT NOT NULL,
  observed_at     TIMESTAMPTZ NOT NULL,
  known_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_event_dedupe_key_unique UNIQUE (dedupe_key),
  CONSTRAINT scheduled_event_kind_check CHECK (event_kind = ANY (ARRAY[
    -- A forward-dated decision. The only genuinely forward-looking kind today.
    'central_bank_meeting',
    -- Economic release. Carries actual/consensus/previous once published, so a
    -- row can be in the past.
    'economic_release',
    'earnings'
  ])),
  CONSTRAINT scheduled_event_title_check CHECK (length(btrim(title)) > 0),
  CONSTRAINT scheduled_event_dedupe_check CHECK (length(btrim(dedupe_key)) > 0),
  CONSTRAINT scheduled_event_detail_check CHECK (jsonb_typeof(detail) = 'object'),
  CONSTRAINT scheduled_event_known_after_observed CHECK (known_at >= observed_at)
);

CREATE INDEX IF NOT EXISTS scheduled_event_date_idx
  ON market.scheduled_event (scheduled_date DESC, event_kind);

COMMENT ON TABLE market.scheduled_event IS
  'Dated events promoted from research-common calendar snapshots. Not a legislative calendar — bill status and chamber schedules are collected by no project and need a new external source.';

GRANT SELECT ON market.scheduled_event TO stock_insight_app_reader;
`;
