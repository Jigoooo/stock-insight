export const geoExposurePitUniverseMigrationSql = `
-- P1-W5 — Geo exposure and point-in-time security universe
-- (enhancement plan Task 7, P1-16·20).
-- Additive migration 035. Country/facility exposure ratios carry their base and
-- evidence; the security master preserves ticker tenure without overlap and a
-- point-in-time universe never leaks a future constituent. Existing core.listing
-- rows are only read for the additive security-master seed; nothing is rewritten.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── geo exposure: an evidenced ratio that can never drop its denominator ──────
CREATE TABLE IF NOT EXISTS geo.entity_exposure_revision (
    geo_entity_exposure_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exposure_key         TEXT NOT NULL,
    revision_no          INTEGER NOT NULL CHECK (revision_no > 0),
    entity_id            BIGINT NOT NULL REFERENCES core.entity(entity_id),
    geo_entity_id        BIGINT NOT NULL REFERENCES geo.entity(geo_entity_id),
    exposure_kind        TEXT NOT NULL
      CHECK (exposure_kind IN ('revenue','asset','production','supply','employment')),
    numerator            NUMERIC NOT NULL,
    denominator          NUMERIC,
    ratio                NUMERIC,
    unit                 TEXT,
    currency             TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    period_start         DATE,
    period_end           DATE,
    derivation_priority  INTEGER NOT NULL DEFAULT 100 CHECK (derivation_priority >= 0),
    evidence_locator     JSONB NOT NULL,
    source_revision_id   BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    available_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    supersedes_geo_entity_exposure_revision_id BIGINT
      REFERENCES geo.entity_exposure_revision(geo_entity_exposure_revision_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (exposure_key, revision_no),
    CHECK (length(btrim(exposure_key)) > 0),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at),
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
    -- A ratio may only exist alongside a non-zero denominator: no bare ratio.
    CHECK (ratio IS NULL OR (denominator IS NOT NULL AND denominator <> 0)),
    CHECK (
      (revision_no = 1 AND supersedes_geo_entity_exposure_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_geo_entity_exposure_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_geo_exposure_entity_pit
  ON geo.entity_exposure_revision (entity_id, geo_entity_id, exposure_kind, known_at, revision_no DESC);

-- ── security master: canonical security identity + append-only listing rev ────
CREATE TABLE IF NOT EXISTS core.security_master (
    security_master_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    security_key         TEXT NOT NULL UNIQUE,
    security_entity_id   BIGINT NOT NULL REFERENCES core.entity(entity_id),
    primary_ticker       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(security_key)) > 0)
);
CREATE INDEX IF NOT EXISTS ix_security_master_entity ON core.security_master (security_entity_id);

CREATE TABLE IF NOT EXISTS core.security_listing_revision (
    security_listing_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    security_master_id   BIGINT NOT NULL REFERENCES core.security_master(security_master_id),
    revision_no          INTEGER NOT NULL CHECK (revision_no > 0),
    exchange_entity_id   BIGINT REFERENCES core.entity(entity_id),
    local_ticker         TEXT,
    share_class          TEXT,
    currency             TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    listing_status       TEXT NOT NULL DEFAULT 'active'
      CHECK (listing_status IN ('active','suspended','delisted')),
    valid_from           TIMESTAMPTZ,
    valid_to             TIMESTAMPTZ,
    known_at             TIMESTAMPTZ NOT NULL,
    supersedes_security_listing_revision_id BIGINT
      REFERENCES core.security_listing_revision(security_listing_revision_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (security_master_id, revision_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CHECK (
      (revision_no = 1 AND supersedes_security_listing_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_security_listing_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_security_listing_revision_master
  ON core.security_listing_revision (security_master_id, revision_no DESC);

-- ── ticker tenure: a ticker may not overlap on the same exchange ──────────────
CREATE TABLE IF NOT EXISTS core.security_ticker_history (
    security_ticker_history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exchange_entity_id   BIGINT NOT NULL REFERENCES core.entity(entity_id),
    ticker               TEXT NOT NULL CHECK (length(btrim(ticker)) > 0),
    security_master_id   BIGINT NOT NULL REFERENCES core.security_master(security_master_id),
    tenure_start         TIMESTAMPTZ NOT NULL,
    tenure_end           TIMESTAMPTZ,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (tenure_end IS NULL OR tenure_end >= tenure_start),
    -- A ticker on an exchange cannot be held by two securities at once. The
    -- range uses an open upper bound (NULL = still active) via 'infinity'.
    EXCLUDE USING gist (
      exchange_entity_id WITH =,
      ticker WITH =,
      tstzrange(tenure_start, coalesce(tenure_end, 'infinity'::timestamptz), '[)') WITH &&
    )
);
CREATE INDEX IF NOT EXISTS ix_security_ticker_history_master
  ON core.security_ticker_history (security_master_id);

-- ── corporate actions: delisting / split / merger / ticker reuse ──────────────
CREATE TABLE IF NOT EXISTS core.security_corporate_action (
    security_corporate_action_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    security_master_id   BIGINT NOT NULL REFERENCES core.security_master(security_master_id),
    action_kind          TEXT NOT NULL
      CHECK (action_kind IN ('delisting','split','reverse_split','merger','spinoff','ticker_reuse','rename')),
    effective_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    ratio_numerator      NUMERIC,
    ratio_denominator    NUMERIC,
    related_security_master_id BIGINT REFERENCES core.security_master(security_master_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object'),
    -- A corporate action may be known up to one day before it is effective
    -- (pre-announced), but never earlier than that.
    CHECK (known_at >= effective_at - interval '1 day'),
    CHECK (ratio_denominator IS NULL OR ratio_denominator <> 0)
);
CREATE INDEX IF NOT EXISTS ix_security_corporate_action_master
  ON core.security_corporate_action (security_master_id, effective_at);

-- ── point-in-time universe membership (macroeconomic vintage aware) ───────────
CREATE TABLE IF NOT EXISTS analytics.pit_universe_membership (
    pit_universe_membership_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    universe_key         TEXT NOT NULL CHECK (length(btrim(universe_key)) > 0),
    security_master_id   BIGINT NOT NULL REFERENCES core.security_master(security_master_id),
    as_of                TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    membership_status    TEXT NOT NULL DEFAULT 'member'
      CHECK (membership_status IN ('member','removed','candidate')),
    vintage_label        TEXT,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object'),
    -- known_at dominates as_of so a constituent is never visible before it was known.
    CHECK (known_at >= as_of),
    UNIQUE (universe_key, security_master_id, as_of, known_at)
);
CREATE INDEX IF NOT EXISTS ix_pit_universe_pit
  ON analytics.pit_universe_membership (universe_key, as_of, known_at);

-- ── guards ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.guard_security_listing_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prev_master BIGINT;
  v_prev_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'core.security_listing_revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.security_master_id, previous.revision_no
    INTO v_prev_master, v_prev_revision
    FROM core.security_listing_revision previous
    WHERE previous.security_listing_revision_id = NEW.supersedes_security_listing_revision_id;
    IF v_prev_master IS DISTINCT FROM NEW.security_master_id
       OR v_prev_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'security listing supersession must reference the previous revision of the same security';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION analytics.guard_pit_universe_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'analytics.pit_universe_membership is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.known_at < NEW.as_of THEN
    RAISE EXCEPTION 'point-in-time universe cannot admit a future constituent (known_at % < as_of %)',
      NEW.known_at, NEW.as_of;
  END IF;
  RETURN NEW;
END $$;

-- ── additive security-master seed from existing listings ──────────────────────
-- Each distinct listed security becomes one security_master + one listing
-- revision + one ticker-history tenure. No core.listing row is modified.
INSERT INTO core.security_master (security_key, security_entity_id, primary_ticker)
SELECT DISTINCT 'legacy-security:'||listing.security_entity_id::text,
       listing.security_entity_id,
       (array_agg(listing.local_ticker ORDER BY listing.valid_from))[1]
FROM core.listing listing
GROUP BY listing.security_entity_id
ON CONFLICT (security_key) DO NOTHING;

INSERT INTO core.security_listing_revision (
  security_master_id, revision_no, exchange_entity_id, local_ticker,
  currency, listing_status, valid_from, valid_to, known_at, metadata
)
SELECT master.security_master_id,
       1,
       listing.exchange_entity_id,
       listing.local_ticker,
       listing.currency,
       CASE lower(coalesce(listing.listing_status, 'active'))
         WHEN 'listed' THEN 'active'
         WHEN 'active' THEN 'active'
         WHEN 'suspended' THEN 'suspended'
         WHEN 'delisted' THEN 'delisted'
         ELSE 'active'
       END,
       listing.valid_from,
       listing.valid_to,
       coalesce(listing.valid_from, now()),
       jsonb_build_object('seed_policy','p1-w5-legacy-v1','legacy_listing_id',listing.listing_id)
FROM core.listing listing
JOIN core.security_master master
  ON master.security_key = 'legacy-security:'||listing.security_entity_id::text
WHERE listing.listing_id = (
  SELECT min(inner_listing.listing_id) FROM core.listing inner_listing
  WHERE inner_listing.security_entity_id = listing.security_entity_id
)
AND NOT EXISTS (
  SELECT 1 FROM core.security_listing_revision existing
  WHERE existing.security_master_id = master.security_master_id AND existing.revision_no = 1
);

-- Ticker tenure seed: one non-overlapping tenure per (exchange, ticker, security).
INSERT INTO core.security_ticker_history (
  exchange_entity_id, ticker, security_master_id, tenure_start, tenure_end
)
SELECT DISTINCT ON (listing.exchange_entity_id, listing.local_ticker)
       listing.exchange_entity_id,
       listing.local_ticker,
       master.security_master_id,
       coalesce(listing.valid_from, '2000-01-01T00:00:00Z'),
       listing.valid_to
FROM core.listing listing
JOIN core.security_master master
  ON master.security_key = 'legacy-security:'||listing.security_entity_id::text
WHERE listing.exchange_entity_id IS NOT NULL AND listing.local_ticker IS NOT NULL
ORDER BY listing.exchange_entity_id, listing.local_ticker, coalesce(listing.valid_from, '2000-01-01T00:00:00Z')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_securities BIGINT;
  v_masters BIGINT;
  v_revisions BIGINT;
BEGIN
  SELECT count(DISTINCT security_entity_id) INTO v_securities FROM core.listing;
  SELECT count(*) INTO v_masters FROM core.security_master WHERE security_key LIKE 'legacy-security:%';
  SELECT count(*) INTO v_revisions
  FROM core.security_listing_revision revision
  JOIN core.security_master master USING (security_master_id)
  WHERE master.security_key LIKE 'legacy-security:%' AND revision.revision_no = 1;
  IF v_masters <> v_securities OR v_revisions <> v_securities THEN
    RAISE EXCEPTION 'P1-W5 security-master seed parity mismatch: securities=% masters=% revisions=%',
      v_securities, v_masters, v_revisions;
  END IF;
END $$;

-- ── install guards after the validated seed ──────────────────────────────────
DROP TRIGGER IF EXISTS security_listing_revision_write_guard ON core.security_listing_revision;
CREATE TRIGGER security_listing_revision_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON core.security_listing_revision
FOR EACH ROW EXECUTE FUNCTION core.guard_security_listing_revision_write();

DROP TRIGGER IF EXISTS pit_universe_write_guard ON analytics.pit_universe_membership;
CREATE TRIGGER pit_universe_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.pit_universe_membership
FOR EACH ROW EXECUTE FUNCTION analytics.guard_pit_universe_write();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
-- analytics schema USAGE is required for the pit_universe_membership grant to be
-- reachable (geo/core USAGE already granted upstream); without it a least-
-- privilege writer/reader cannot touch the PIT surface.
GRANT USAGE ON SCHEMA analytics TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  geo.entity_exposure_revision,
  core.security_master,
  core.security_listing_revision,
  core.security_ticker_history,
  core.security_corporate_action,
  analytics.pit_universe_membership
TO si_knowledge;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA geo TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_knowledge, si_analytics, si_publisher;

GRANT SELECT ON
  geo.entity_exposure_revision,
  core.security_master,
  core.security_listing_revision,
  core.security_ticker_history,
  core.security_corporate_action,
  analytics.pit_universe_membership
TO si_analytics, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON
      geo.entity_exposure_revision,
      core.security_master,
      core.security_listing_revision,
      core.security_ticker_history,
      core.security_corporate_action,
      analytics.pit_universe_membership
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
