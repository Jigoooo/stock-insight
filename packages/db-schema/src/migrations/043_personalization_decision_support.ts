export const personalizationDecisionSupportMigrationSql = `
-- P4 — private personalization and read-only decision-support ledgers.
-- Personal data is append-only and user-scoped. It may reference immutable
-- common evidence, but no common graph/training table may reference these rows.

CREATE SCHEMA IF NOT EXISTS personalization;

CREATE TABLE IF NOT EXISTS personalization.user_profile_revision (
    user_profile_revision_id       UUID PRIMARY KEY,
    user_id                        UUID NOT NULL,
    revision_no                    INTEGER NOT NULL CHECK (revision_no >= 1),
    supersedes_profile_revision_id UUID,
    risk_capacity                  TEXT NOT NULL CHECK (risk_capacity IN ('low','medium','high','unknown')),
    max_position_weight            NUMERIC(9,8) NOT NULL CHECK (max_position_weight > 0 AND max_position_weight <= 1),
    no_trade_band                  NUMERIC(9,8) NOT NULL CHECK (no_trade_band >= 0 AND no_trade_band < 1),
    decision_horizon_days          INTEGER NOT NULL CHECK (decision_horizon_days BETWEEN 1 AND 3650),
    constraints_json               JSONB NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(constraints_json) = 'object'),
    valid_from                     TIMESTAMPTZ NOT NULL,
    valid_to                       TIMESTAMPTZ,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_profile_revision_id, user_id),
    UNIQUE (user_id, revision_no),
    UNIQUE (supersedes_profile_revision_id, user_id),
    FOREIGN KEY (supersedes_profile_revision_id, user_id)
      REFERENCES personalization.user_profile_revision (user_profile_revision_id, user_id)
      ON DELETE RESTRICT,
    CHECK (valid_to IS NULL OR valid_to > valid_from),
    CHECK (supersedes_profile_revision_id IS DISTINCT FROM user_profile_revision_id),
    CHECK ((revision_no = 1) = (supersedes_profile_revision_id IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_user_profile_revision_head
  ON personalization.user_profile_revision (user_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS personalization.portfolio_snapshot (
    portfolio_snapshot_id UUID PRIMARY KEY,
    user_id               UUID NOT NULL,
    snapshot_as_of        TIMESTAMPTZ NOT NULL,
    source_known_at       TIMESTAMPTZ NOT NULL,
    base_currency         TEXT NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
    total_market_value    NUMERIC(28,8) NOT NULL CHECK (total_market_value >= 0),
    position_count        INTEGER NOT NULL CHECK (position_count >= 0),
    snapshot_digest       TEXT NOT NULL CHECK (snapshot_digest ~ '^[a-f0-9]{64}$'),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (portfolio_snapshot_id, user_id),
    UNIQUE (user_id, snapshot_as_of, snapshot_digest),
    CHECK (source_known_at >= snapshot_as_of)
);
CREATE INDEX IF NOT EXISTS ix_portfolio_snapshot_user_latest
  ON personalization.portfolio_snapshot (user_id, snapshot_as_of DESC);

CREATE TABLE IF NOT EXISTS personalization.portfolio_lot_snapshot (
    portfolio_lot_snapshot_id UUID PRIMARY KEY,
    portfolio_snapshot_id     UUID NOT NULL,
    user_id                   UUID NOT NULL,
    security_entity_id        BIGINT NOT NULL REFERENCES core.entity(entity_id),
    lot_key                   TEXT NOT NULL,
    market                    TEXT NOT NULL CHECK (market IN ('KR','US')),
    currency                  TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    quantity                  NUMERIC(28,10) NOT NULL CHECK (quantity > 0),
    market_value              NUMERIC(28,8) NOT NULL CHECK (market_value >= 0),
    portfolio_weight          NUMERIC(9,8) NOT NULL CHECK (portfolio_weight >= 0 AND portfolio_weight <= 1),
    cost_basis_total          NUMERIC(28,8) CHECK (cost_basis_total IS NULL OR cost_basis_total >= 0),
    acquired_at               TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (portfolio_snapshot_id, security_entity_id, lot_key),
    FOREIGN KEY (portfolio_snapshot_id, user_id)
      REFERENCES personalization.portfolio_snapshot (portfolio_snapshot_id, user_id)
      ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_portfolio_lot_snapshot_user_security
  ON personalization.portfolio_lot_snapshot (user_id, security_entity_id, portfolio_snapshot_id);

CREATE TABLE IF NOT EXISTS personalization.portfolio_snapshot_seal (
    portfolio_snapshot_id UUID NOT NULL,
    user_id               UUID NOT NULL,
    sealed_at             TIMESTAMPTZ NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (portfolio_snapshot_id, user_id),
    FOREIGN KEY (portfolio_snapshot_id, user_id)
      REFERENCES personalization.portfolio_snapshot (portfolio_snapshot_id, user_id)
      ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS personalization.thesis_revision (
    thesis_revision_id            UUID PRIMARY KEY,
    user_id                       UUID NOT NULL,
    security_entity_id            BIGINT NOT NULL REFERENCES core.entity(entity_id),
    revision_no                   INTEGER NOT NULL CHECK (revision_no >= 1),
    supersedes_thesis_revision_id UUID,
    thesis_text                   TEXT NOT NULL CHECK (length(trim(thesis_text)) > 0),
    evidence_refs                 JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
    counter_evidence              JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(counter_evidence) = 'array'),
    invalidation_conditions JSONB NOT NULL DEFAULT '[]'::jsonb
      CHECK (jsonb_typeof(invalidation_conditions) = 'array'),
    status                        TEXT NOT NULL CHECK (status IN ('active','invalidated','superseded')),
    valid_from                    TIMESTAMPTZ NOT NULL,
    valid_to                      TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (thesis_revision_id, user_id),
    UNIQUE (thesis_revision_id, user_id, security_entity_id),
    UNIQUE (user_id, security_entity_id, revision_no),
    UNIQUE (supersedes_thesis_revision_id, user_id, security_entity_id),
    FOREIGN KEY (supersedes_thesis_revision_id, user_id, security_entity_id)
      REFERENCES personalization.thesis_revision (thesis_revision_id, user_id, security_entity_id)
      ON DELETE RESTRICT,
    CHECK (valid_to IS NULL OR valid_to > valid_from),
    CHECK ((status = 'active' AND valid_to IS NULL) OR status <> 'active'),
    CHECK (supersedes_thesis_revision_id IS DISTINCT FROM thesis_revision_id),
    CHECK ((revision_no = 1) = (supersedes_thesis_revision_id IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_thesis_revision_head
  ON personalization.thesis_revision (user_id, security_entity_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS personalization.decision_packet (
    decision_packet_id       UUID PRIMARY KEY,
    user_id                  UUID NOT NULL,
    security_entity_id       BIGINT NOT NULL REFERENCES core.entity(entity_id),
    user_profile_revision_id UUID NOT NULL,
    portfolio_snapshot_id    UUID NOT NULL,
    thesis_revision_id       UUID,
    common_view_kind         TEXT NOT NULL,
    common_view_key          TEXT NOT NULL,
    common_view_digest       TEXT NOT NULL CHECK (common_view_digest ~ '^[a-f0-9]{64}$'),
    common_view_as_of        TIMESTAMPTZ NOT NULL,
    derivation_id            BIGINT REFERENCES knowledge.derivation(derivation_id),
    action                   TEXT NOT NULL CHECK (action IN
      ('ADD','HOLD','REDUCE','EXIT','WATCH','NO_ACTION','INSUFFICIENT_DATA')),
    action_reason            TEXT NOT NULL CHECK (length(trim(action_reason)) > 0),
    counter_evidence         JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(counter_evidence) = 'array'),
    failure_conditions       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(failure_conditions) = 'array'),
    estimated_costs          JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(estimated_costs) = 'object'),
    tax_assumptions          JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tax_assumptions) = 'object'),
    uncertainty             JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(uncertainty) = 'object'),
    expires_at               TIMESTAMPTZ NOT NULL,
    abstention_reason        TEXT,
    legal_review_status      TEXT NOT NULL DEFAULT 'required'
      CHECK (legal_review_status = 'required'),
    advice_prohibited        BOOLEAN NOT NULL DEFAULT true CHECK (advice_prohibited),
    order_executable         BOOLEAN NOT NULL DEFAULT false CHECK (NOT order_executable),
    engine_version           TEXT NOT NULL,
    packet_digest            TEXT NOT NULL CHECK (packet_digest ~ '^[a-f0-9]{64}$'),
    generated_at             TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (decision_packet_id, user_id),
    UNIQUE (user_id, security_entity_id, generated_at),
    FOREIGN KEY (user_profile_revision_id, user_id)
      REFERENCES personalization.user_profile_revision (user_profile_revision_id, user_id)
      ON DELETE RESTRICT,
    FOREIGN KEY (portfolio_snapshot_id, user_id)
      REFERENCES personalization.portfolio_snapshot (portfolio_snapshot_id, user_id)
      ON DELETE RESTRICT,
    FOREIGN KEY (thesis_revision_id, user_id, security_entity_id)
      REFERENCES personalization.thesis_revision (thesis_revision_id, user_id, security_entity_id)
      ON DELETE RESTRICT,
    CHECK (common_view_as_of <= generated_at),
    CHECK (expires_at > generated_at),
    CHECK (
      (action = 'INSUFFICIENT_DATA' AND abstention_reason IS NOT NULL)
      OR (action <> 'INSUFFICIENT_DATA' AND abstention_reason IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_decision_packet_user_security_latest
  ON personalization.decision_packet (user_id, security_entity_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS personalization.decision_packet_legal_review (
    decision_packet_legal_review_id UUID PRIMARY KEY,
    decision_packet_id              UUID NOT NULL,
    user_id                         UUID NOT NULL,
    review_status                   TEXT NOT NULL CHECK (review_status IN ('approved_read_only','rejected')),
    reviewer_ref                    TEXT NOT NULL CHECK (length(trim(reviewer_ref)) > 0),
    review_note                     TEXT NOT NULL CHECK (length(trim(review_note)) > 0),
    reviewed_at                     TIMESTAMPTZ NOT NULL,
    advice_prohibited               BOOLEAN NOT NULL DEFAULT true CHECK (advice_prohibited),
    order_executable                BOOLEAN NOT NULL DEFAULT false CHECK (NOT order_executable),
    review_digest                   TEXT NOT NULL CHECK (review_digest ~ '^[a-f0-9]{64}$'),
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, decision_packet_id, reviewed_at),
    FOREIGN KEY (decision_packet_id, user_id)
      REFERENCES personalization.decision_packet (decision_packet_id, user_id)
      ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_decision_packet_legal_review_latest
  ON personalization.decision_packet_legal_review (user_id, decision_packet_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION personalization.reject_private_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'private personalization ledgers are append-only' USING ERRCODE = '55000';
END
$$;

CREATE OR REPLACE FUNCTION personalization.guard_portfolio_lot_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.portfolio_snapshot_id::text, 0));
  IF EXISTS (
    SELECT 1
    FROM personalization.portfolio_snapshot_seal seal
    WHERE seal.portfolio_snapshot_id = NEW.portfolio_snapshot_id
      AND seal.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'sealed portfolio snapshot cannot accept additional lots'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION personalization.guard_portfolio_snapshot_seal_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_position_count INTEGER;
  snapshot_total_market_value NUMERIC;
  snapshot_source_known_at TIMESTAMPTZ;
  actual_position_count BIGINT;
  actual_market_value NUMERIC;
  actual_weight NUMERIC;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.portfolio_snapshot_id::text, 0));
  SELECT position_count, total_market_value, source_known_at
    INTO expected_position_count, snapshot_total_market_value, snapshot_source_known_at
  FROM personalization.portfolio_snapshot
  WHERE portfolio_snapshot_id = NEW.portfolio_snapshot_id
    AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio snapshot seal requires a same-user snapshot'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT security_entity_id),
         coalesce(sum(market_value), 0),
         coalesce(sum(portfolio_weight), 0)
    INTO actual_position_count, actual_market_value, actual_weight
  FROM personalization.portfolio_lot_snapshot
  WHERE portfolio_snapshot_id = NEW.portfolio_snapshot_id
    AND user_id = NEW.user_id;

  IF actual_position_count <> expected_position_count
     OR actual_market_value > snapshot_total_market_value
     OR actual_weight > 1
     OR NEW.sealed_at < snapshot_source_known_at THEN
    RAISE EXCEPTION 'portfolio snapshot seal does not match its immutable lot set'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION personalization.guard_decision_packet_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  snapshot_source_known_at TIMESTAMPTZ;
  snapshot_sealed_at TIMESTAMPTZ;
  profile_valid_from TIMESTAMPTZ;
  profile_valid_to TIMESTAMPTZ;
  profile_has_effective_successor BOOLEAN;
  thesis_valid_from TIMESTAMPTZ;
  thesis_valid_to TIMESTAMPTZ;
  thesis_status TEXT;
  thesis_has_effective_successor BOOLEAN;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.portfolio_snapshot_id::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('p4-profile:' || NEW.user_id::text, 0)
  );
  IF NEW.thesis_revision_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'p4-thesis:' || NEW.user_id::text || ':' || NEW.security_entity_id::text,
        0
      )
    );
  END IF;
  SELECT snapshot.source_known_at, seal.sealed_at
    INTO snapshot_source_known_at, snapshot_sealed_at
  FROM personalization.portfolio_snapshot snapshot
  JOIN personalization.portfolio_snapshot_seal seal
    ON seal.portfolio_snapshot_id = snapshot.portfolio_snapshot_id
   AND seal.user_id = snapshot.user_id
  WHERE snapshot.portfolio_snapshot_id = NEW.portfolio_snapshot_id
    AND snapshot.user_id = NEW.user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio snapshot must be sealed before packet creation'
      USING ERRCODE = '23514';
  END IF;

  SELECT profile.valid_from, profile.valid_to,
         EXISTS (
           SELECT 1
           FROM personalization.user_profile_revision successor
           WHERE successor.supersedes_profile_revision_id = profile.user_profile_revision_id
             AND successor.user_id = profile.user_id
             AND successor.valid_from <= NEW.generated_at
         )
    INTO profile_valid_from, profile_valid_to, profile_has_effective_successor
  FROM personalization.user_profile_revision profile
  WHERE profile.user_profile_revision_id = NEW.user_profile_revision_id
    AND profile.user_id = NEW.user_id;

  IF NEW.thesis_revision_id IS NOT NULL THEN
    SELECT thesis.valid_from, thesis.valid_to, thesis.status,
           EXISTS (
             SELECT 1
             FROM personalization.thesis_revision successor
             WHERE successor.supersedes_thesis_revision_id = thesis.thesis_revision_id
               AND successor.user_id = thesis.user_id
               AND successor.security_entity_id = thesis.security_entity_id
               AND successor.valid_from <= NEW.generated_at
           )
      INTO thesis_valid_from, thesis_valid_to, thesis_status, thesis_has_effective_successor
    FROM personalization.thesis_revision thesis
    WHERE thesis.thesis_revision_id = NEW.thesis_revision_id
      AND thesis.user_id = NEW.user_id
      AND thesis.security_entity_id = NEW.security_entity_id;
  END IF;

  IF profile_valid_from IS NULL
     OR (NEW.thesis_revision_id IS NOT NULL AND thesis_valid_from IS NULL)
     OR NEW.generated_at < snapshot_source_known_at
     OR NEW.generated_at < snapshot_sealed_at
     OR NEW.generated_at < profile_valid_from
     OR (thesis_valid_from IS NOT NULL AND NEW.generated_at < thesis_valid_from) THEN
    RAISE EXCEPTION 'decision packet cannot predate its bound private inputs'
      USING ERRCODE = '23514';
  END IF;

  IF (profile_valid_to IS NOT NULL AND NEW.generated_at >= profile_valid_to)
     OR profile_has_effective_successor THEN
    RAISE EXCEPTION 'decision packet profile revision is not valid at generation time'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.thesis_revision_id IS NOT NULL
     AND ((thesis_valid_to IS NOT NULL AND NEW.generated_at >= thesis_valid_to)
          OR thesis_status = 'superseded'
          OR thesis_has_effective_successor) THEN
    RAISE EXCEPTION 'decision packet thesis revision is not valid at generation time'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION personalization.guard_profile_revision_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  predecessor_revision_no INTEGER;
  predecessor_valid_from TIMESTAMPTZ;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('p4-profile:' || NEW.user_id::text, 0)
  );
  IF NEW.revision_no = 1 THEN
    RETURN NEW;
  END IF;

  SELECT revision_no, valid_from
    INTO predecessor_revision_no, predecessor_valid_from
  FROM personalization.user_profile_revision
  WHERE user_profile_revision_id = NEW.supersedes_profile_revision_id
    AND user_id = NEW.user_id;

  IF NOT FOUND
     OR predecessor_revision_no <> NEW.revision_no - 1
     OR NEW.valid_from <= predecessor_valid_from THEN
    RAISE EXCEPTION 'profile revision must supersede the immediately preceding same-user revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION personalization.guard_thesis_revision_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  predecessor_revision_no INTEGER;
  predecessor_valid_from TIMESTAMPTZ;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'p4-thesis:' || NEW.user_id::text || ':' || NEW.security_entity_id::text,
      0
    )
  );
  IF NEW.revision_no = 1 THEN
    RETURN NEW;
  END IF;

  SELECT revision_no, valid_from
    INTO predecessor_revision_no, predecessor_valid_from
  FROM personalization.thesis_revision
  WHERE thesis_revision_id = NEW.supersedes_thesis_revision_id
    AND user_id = NEW.user_id
    AND security_entity_id = NEW.security_entity_id;

  IF NOT FOUND
     OR predecessor_revision_no <> NEW.revision_no - 1
     OR NEW.valid_from <= predecessor_valid_from THEN
    RAISE EXCEPTION 'thesis revision must supersede the immediately preceding same-user security revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION personalization.guard_legal_review_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  packet_generated_at TIMESTAMPTZ;
BEGIN
  SELECT generated_at
    INTO packet_generated_at
  FROM personalization.decision_packet
  WHERE decision_packet_id = NEW.decision_packet_id
    AND user_id = NEW.user_id;

  IF NOT FOUND OR NEW.reviewed_at < packet_generated_at THEN
    RAISE EXCEPTION 'legal review cannot predate its decision packet'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE personalization.user_profile_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization.user_profile_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE personalization.portfolio_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization.portfolio_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE personalization.portfolio_lot_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization.portfolio_lot_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE personalization.portfolio_snapshot_seal ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization.portfolio_snapshot_seal FORCE ROW LEVEL SECURITY;
ALTER TABLE personalization.thesis_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization.thesis_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE personalization.decision_packet ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization.decision_packet FORCE ROW LEVEL SECURITY;
ALTER TABLE personalization.decision_packet_legal_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization.decision_packet_legal_review FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS user_profile_revision_chain_guard
  ON personalization.user_profile_revision;
CREATE TRIGGER user_profile_revision_chain_guard BEFORE INSERT
  ON personalization.user_profile_revision FOR EACH ROW
  EXECUTE FUNCTION personalization.guard_profile_revision_insert();
DROP TRIGGER IF EXISTS thesis_revision_chain_guard
  ON personalization.thesis_revision;
CREATE TRIGGER thesis_revision_chain_guard BEFORE INSERT
  ON personalization.thesis_revision FOR EACH ROW
  EXECUTE FUNCTION personalization.guard_thesis_revision_insert();
DROP TRIGGER IF EXISTS decision_packet_legal_review_time_guard
  ON personalization.decision_packet_legal_review;
CREATE TRIGGER decision_packet_legal_review_time_guard BEFORE INSERT
  ON personalization.decision_packet_legal_review FOR EACH ROW
  EXECUTE FUNCTION personalization.guard_legal_review_insert();
DROP TRIGGER IF EXISTS portfolio_lot_snapshot_seal_guard
  ON personalization.portfolio_lot_snapshot;
CREATE TRIGGER portfolio_lot_snapshot_seal_guard BEFORE INSERT
  ON personalization.portfolio_lot_snapshot FOR EACH ROW
  EXECUTE FUNCTION personalization.guard_portfolio_lot_insert();
DROP TRIGGER IF EXISTS portfolio_snapshot_seal_guard
  ON personalization.portfolio_snapshot_seal;
CREATE TRIGGER portfolio_snapshot_seal_guard BEFORE INSERT
  ON personalization.portfolio_snapshot_seal FOR EACH ROW
  EXECUTE FUNCTION personalization.guard_portfolio_snapshot_seal_insert();
DROP TRIGGER IF EXISTS decision_packet_snapshot_guard
  ON personalization.decision_packet;
CREATE TRIGGER decision_packet_snapshot_guard BEFORE INSERT
  ON personalization.decision_packet FOR EACH ROW
  EXECUTE FUNCTION personalization.guard_decision_packet_insert();

DROP TRIGGER IF EXISTS user_profile_revision_append_only
  ON personalization.user_profile_revision;
CREATE TRIGGER user_profile_revision_append_only BEFORE UPDATE OR DELETE
  ON personalization.user_profile_revision FOR EACH ROW
  EXECUTE FUNCTION personalization.reject_private_ledger_mutation();
DROP TRIGGER IF EXISTS portfolio_snapshot_append_only
  ON personalization.portfolio_snapshot;
CREATE TRIGGER portfolio_snapshot_append_only BEFORE UPDATE OR DELETE
  ON personalization.portfolio_snapshot FOR EACH ROW
  EXECUTE FUNCTION personalization.reject_private_ledger_mutation();
DROP TRIGGER IF EXISTS portfolio_lot_snapshot_append_only
  ON personalization.portfolio_lot_snapshot;
CREATE TRIGGER portfolio_lot_snapshot_append_only BEFORE UPDATE OR DELETE
  ON personalization.portfolio_lot_snapshot FOR EACH ROW
  EXECUTE FUNCTION personalization.reject_private_ledger_mutation();
DROP TRIGGER IF EXISTS portfolio_snapshot_seal_append_only
  ON personalization.portfolio_snapshot_seal;
CREATE TRIGGER portfolio_snapshot_seal_append_only BEFORE UPDATE OR DELETE
  ON personalization.portfolio_snapshot_seal FOR EACH ROW
  EXECUTE FUNCTION personalization.reject_private_ledger_mutation();
DROP TRIGGER IF EXISTS thesis_revision_append_only
  ON personalization.thesis_revision;
CREATE TRIGGER thesis_revision_append_only BEFORE UPDATE OR DELETE
  ON personalization.thesis_revision FOR EACH ROW
  EXECUTE FUNCTION personalization.reject_private_ledger_mutation();
DROP TRIGGER IF EXISTS decision_packet_append_only
  ON personalization.decision_packet;
CREATE TRIGGER decision_packet_append_only BEFORE UPDATE OR DELETE
  ON personalization.decision_packet FOR EACH ROW
  EXECUTE FUNCTION personalization.reject_private_ledger_mutation();
DROP TRIGGER IF EXISTS decision_packet_legal_review_append_only
  ON personalization.decision_packet_legal_review;
CREATE TRIGGER decision_packet_legal_review_append_only BEFORE UPDATE OR DELETE
  ON personalization.decision_packet_legal_review FOR EACH ROW
  EXECUTE FUNCTION personalization.reject_private_ledger_mutation();

GRANT USAGE ON SCHEMA personalization TO stock_insight_reader, stock_insight_writer;
REVOKE ALL PRIVILEGES ON
  personalization.user_profile_revision,
  personalization.portfolio_snapshot,
  personalization.portfolio_lot_snapshot,
  personalization.portfolio_snapshot_seal,
  personalization.thesis_revision,
  personalization.decision_packet,
  personalization.decision_packet_legal_review
FROM PUBLIC, stock_insight_reader, stock_insight_writer;
GRANT SELECT ON
  personalization.user_profile_revision,
  personalization.portfolio_snapshot,
  personalization.portfolio_lot_snapshot,
  personalization.portfolio_snapshot_seal,
  personalization.thesis_revision,
  personalization.decision_packet,
  personalization.decision_packet_legal_review
TO stock_insight_reader, stock_insight_writer;
GRANT INSERT ON
  personalization.user_profile_revision,
  personalization.portfolio_snapshot,
  personalization.portfolio_lot_snapshot,
  personalization.portfolio_snapshot_seal,
  personalization.thesis_revision,
  personalization.decision_packet
TO stock_insight_writer;

DO $p4_policies$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'user_profile_revision',
    'portfolio_snapshot',
    'portfolio_lot_snapshot',
    'portfolio_snapshot_seal',
    'thesis_revision',
    'decision_packet',
    'decision_packet_legal_review'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS p4_reader_select_%I ON personalization.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS p4_reader_scope_%I ON personalization.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS p4_writer_insert_%I ON personalization.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS p4_writer_scope_%I ON personalization.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY p4_reader_select_%I ON personalization.%I AS PERMISSIVE FOR SELECT TO stock_insight_reader, stock_insight_writer USING (true)',
      table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY p4_reader_scope_%I ON personalization.%I AS RESTRICTIVE FOR SELECT TO stock_insight_reader, stock_insight_writer USING (user_id = nullif(current_setting(''stock_insight.user_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
    IF table_name <> 'decision_packet_legal_review' THEN
      EXECUTE format(
        'CREATE POLICY p4_writer_insert_%I ON personalization.%I AS PERMISSIVE FOR INSERT TO stock_insight_writer WITH CHECK (true)',
        table_name,
        table_name
      );
      EXECUTE format(
        'CREATE POLICY p4_writer_scope_%I ON personalization.%I AS RESTRICTIVE FOR INSERT TO stock_insight_writer WITH CHECK (user_id = nullif(current_setting(''stock_insight.user_id'', true), '''')::uuid)',
        table_name,
        table_name
      );
    END IF;
  END LOOP;
END
$p4_policies$;
`;
