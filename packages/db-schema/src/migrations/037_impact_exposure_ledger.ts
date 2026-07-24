export const impactExposureLedgerMigrationSql = `
-- P2-WA — Impact engine exposure ledger with forced score decomposition
-- (enhancement plan P2-1/P2-2/P2-3, §7.1-§7.4).
-- Additive migration 037. Models the standard impact chain
-- Event -> Shock -> Channel -> Exposure, storing the full §7.3 exposure field
-- set and the §7.4 eight-way score decomposition. Hard rules: a single collapsed
-- confidence is forbidden, and epistemic confidence is never multiplied into the
-- economic magnitude. Append-only; anchors on P1 world.event_revision.

-- ── shock: an event's economic disturbance, anchored to a live event revision ─
CREATE TABLE IF NOT EXISTS analytics.impact_shock (
    impact_shock_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shock_key            TEXT NOT NULL UNIQUE,
    event_revision_id    BIGINT NOT NULL REFERENCES world.event_revision(event_revision_id),
    shock_type           TEXT NOT NULL CHECK (length(btrim(shock_type)) > 0),
    magnitude            NUMERIC,
    magnitude_unit       TEXT,
    evidence_locator     JSONB NOT NULL,
    available_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(shock_key)) > 0),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at)
);
CREATE INDEX IF NOT EXISTS ix_impact_shock_event
  ON analytics.impact_shock (event_revision_id);

-- ── channel: controlled transmission-channel vocabulary (§7.2, 17 classes) ────
CREATE TABLE IF NOT EXISTS analytics.impact_channel (
    impact_channel_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    channel_class        TEXT NOT NULL UNIQUE,
    channel_group        TEXT NOT NULL CHECK (channel_group IN ('demand','cost','financing','policy','supply','fx','sentiment','operational')),
    description          TEXT,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(channel_class)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- ── exposure: the §7.3 field set, append-only bitemporal revision ─────────────
-- economic_magnitude (§7.4 economic size) and epistemic_confidence (§7.4 belief)
-- live in SEPARATE columns and are never collapsed into one number.
CREATE TABLE IF NOT EXISTS analytics.impact_exposure_revision (
    impact_exposure_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exposure_key         TEXT NOT NULL,
    revision_no          INTEGER NOT NULL CHECK (revision_no > 0),
    impact_shock_id      BIGINT NOT NULL REFERENCES analytics.impact_shock(impact_shock_id),
    impact_channel_id    BIGINT NOT NULL REFERENCES analytics.impact_channel(impact_channel_id),
    entity_id            BIGINT NOT NULL REFERENCES core.entity(entity_id),
    sign                 TEXT NOT NULL CHECK (sign IN ('positive','negative','ambiguous')),
    sensitivity          NUMERIC,
    horizon              TEXT CHECK (horizon IS NULL OR horizon IN ('immediate','short','medium','long')),
    lag_days             INTEGER CHECK (lag_days IS NULL OR lag_days >= 0),
    regime               TEXT,
    threshold            NUMERIC,
    substitutability     NUMERIC CHECK (substitutability IS NULL OR (substitutability >= 0 AND substitutability <= 1)),
    materiality          NUMERIC CHECK (materiality IS NULL OR (materiality >= 0 AND materiality <= 1)),
    uncertainty          NUMERIC CHECK (uncertainty IS NULL OR (uncertainty >= 0 AND uncertainty <= 1)),
    -- §7.4 separation: economic size vs. belief. Kept apart on purpose.
    economic_magnitude   NUMERIC,
    economic_magnitude_unit TEXT,
    epistemic_confidence NUMERIC CHECK (epistemic_confidence IS NULL OR (epistemic_confidence >= 0 AND epistemic_confidence <= 1)),
    exposure_state       TEXT NOT NULL DEFAULT 'building'
      CHECK (exposure_state IN ('building','sealed','superseded','retracted')),
    evidence_locator     JSONB NOT NULL,
    source_revision_id   BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    available_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    sealed_at            TIMESTAMPTZ,
    supersedes_impact_exposure_revision_id BIGINT
      REFERENCES analytics.impact_exposure_revision(impact_exposure_revision_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (exposure_key, revision_no),
    CHECK (length(btrim(exposure_key)) > 0),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at),
    CHECK (
      (revision_no = 1 AND supersedes_impact_exposure_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_impact_exposure_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_impact_exposure_entity_pit
  ON analytics.impact_exposure_revision (entity_id, impact_channel_id, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_impact_exposure_shock
  ON analytics.impact_exposure_revision (impact_shock_id);

-- ── score component: the §7.4 eight-way decomposition (one row per factor) ─────
CREATE TABLE IF NOT EXISTS analytics.impact_score_component (
    impact_score_component_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    impact_exposure_revision_id BIGINT NOT NULL
      REFERENCES analytics.impact_exposure_revision(impact_exposure_revision_id),
    component_kind       TEXT NOT NULL CHECK (component_kind IN (
      'evidence_confidence','relation_strength','materiality','transmission',
      'direction','lag','market_reflection','model_uncertainty'
    )),
    component_value      NUMERIC NOT NULL,
    rationale            TEXT,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (impact_exposure_revision_id, component_kind)
);
CREATE INDEX IF NOT EXISTS ix_impact_score_component_exposure
  ON analytics.impact_score_component (impact_exposure_revision_id);

-- ── guards ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.reject_impact_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- Append-only exposure with a forward-only lifecycle. Sealing requires the full
-- eight-component §7.4 decomposition to be present, and the §7.4 hard rule that
-- epistemic confidence is never folded into the economic magnitude is enforced
-- structurally: the two live in distinct columns and a sealed exposure that
-- claims a magnitude must not have collapsed confidence into it (metadata flag).
CREATE OR REPLACE FUNCTION analytics.guard_impact_exposure_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prev_key TEXT;
  v_prev_revision INTEGER;
  v_component_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.impact_exposure_revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- A new exposure must enter as 'building'; sealing is only ever reached
    -- through the building -> sealed UPDATE transition, which enforces the full
    -- eight-component decomposition. A direct sealed/superseded INSERT would
    -- bypass that gate (score components cannot exist before the row does).
    IF NEW.exposure_state <> 'building' THEN
      RAISE EXCEPTION 'impact exposure must be inserted as building; seal via the building->sealed transition';
    END IF;
    IF NEW.revision_no > 1 THEN
      SELECT previous.exposure_key, previous.revision_no
      INTO v_prev_key, v_prev_revision
      FROM analytics.impact_exposure_revision previous
      WHERE previous.impact_exposure_revision_id = NEW.supersedes_impact_exposure_revision_id;
      IF v_prev_key IS DISTINCT FROM NEW.exposure_key
         OR v_prev_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
        RAISE EXCEPTION 'impact exposure supersession must reference the previous revision of the same exposure';
      END IF;
    END IF;
    -- §7.4: a collapsed single confidence is forbidden. An exposure may not carry
    -- a pre-multiplied confidence*magnitude value in metadata.
    IF NEW.metadata ? 'collapsed_confidence' OR NEW.metadata ? 'confidence_weighted_magnitude' THEN
      RAISE EXCEPTION 'epistemic confidence must not be multiplied into economic magnitude (§7.4)';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: only the building -> sealed / superseded / retracted transitions.
  IF ROW(
    NEW.impact_exposure_revision_id, NEW.exposure_key, NEW.revision_no,
    NEW.impact_shock_id, NEW.impact_channel_id, NEW.entity_id,
    NEW.economic_magnitude, NEW.epistemic_confidence, NEW.available_at, NEW.known_at
  ) IS DISTINCT FROM ROW(
    OLD.impact_exposure_revision_id, OLD.exposure_key, OLD.revision_no,
    OLD.impact_shock_id, OLD.impact_channel_id, OLD.entity_id,
    OLD.economic_magnitude, OLD.epistemic_confidence, OLD.available_at, OLD.known_at
  ) THEN
    RAISE EXCEPTION 'impact exposure immutable fields cannot change' USING ERRCODE = '55000';
  END IF;
  IF OLD.exposure_state = 'building' AND NEW.exposure_state = 'sealed' THEN
    SELECT count(DISTINCT component_kind) INTO v_component_count
    FROM analytics.impact_score_component
    WHERE impact_exposure_revision_id = OLD.impact_exposure_revision_id;
    IF v_component_count <> 8 THEN
      RAISE EXCEPTION 'exposure requires the full eight-component score decomposition before sealing (found %)', v_component_count;
    END IF;
    IF NEW.sealed_at IS NULL THEN
      RAISE EXCEPTION 'sealed exposure requires sealed_at';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.exposure_state = 'building' AND NEW.exposure_state = 'retracted' THEN
    RETURN NEW;
  END IF;
  IF OLD.exposure_state = 'sealed' AND NEW.exposure_state IN ('superseded','retracted')
     AND NEW.sealed_at IS NOT DISTINCT FROM OLD.sealed_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid impact exposure state transition % -> %', OLD.exposure_state, NEW.exposure_state;
END $$;

-- ── channel taxonomy seed (§7.2, exactly 17 controlled classes) ───────────────
INSERT INTO analytics.impact_channel (channel_class, channel_group, description)
VALUES
  ('final_demand', 'demand', 'End demand for the firm''s products'),
  ('intermediate_demand', 'demand', 'Demand from downstream industries'),
  ('export_demand', 'demand', 'Foreign demand exposure'),
  ('input_cost', 'cost', 'Raw material / component cost'),
  ('energy_cost', 'cost', 'Energy and fuel cost'),
  ('labor_cost', 'cost', 'Wage and labor cost'),
  ('logistics_cost', 'cost', 'Freight and logistics cost'),
  ('financing_cost', 'financing', 'Cost of debt / rates'),
  ('equity_financing', 'financing', 'Equity capital access'),
  ('policy_subsidy', 'policy', 'Subsidy / incentive'),
  ('policy_tariff', 'policy', 'Tariff / trade barrier'),
  ('policy_regulation', 'policy', 'Regulatory compliance burden'),
  ('supply_disruption', 'supply', 'Upstream supply interruption'),
  ('supply_substitution', 'supply', 'Alternative-supplier availability'),
  ('fx_translation', 'fx', 'Currency translation on reported results'),
  ('fx_transaction', 'fx', 'Currency exposure on transactions'),
  ('sentiment_confidence', 'sentiment', 'Investor / consumer confidence shift')
ON CONFLICT (channel_class) DO NOTHING;

DO $$
DECLARE v_channels INTEGER;
BEGIN
  -- P2-WA channel seed parity: the §7.2 taxonomy is fixed at 17 classes.
  SELECT count(*) INTO v_channels FROM analytics.impact_channel;
  IF v_channels < 17 THEN
    RAISE EXCEPTION 'P2-WA channel seed incomplete: expected 17 channels, found %', v_channels;
  END IF;
END $$;

-- ── install guards after seed ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS impact_exposure_write_guard ON analytics.impact_exposure_revision;
CREATE TRIGGER impact_exposure_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.impact_exposure_revision
FOR EACH ROW EXECUTE FUNCTION analytics.guard_impact_exposure_write();

DROP TRIGGER IF EXISTS impact_shock_write_guard ON analytics.impact_shock;
CREATE TRIGGER impact_shock_write_guard
BEFORE UPDATE OR DELETE ON analytics.impact_shock
FOR EACH ROW EXECUTE FUNCTION analytics.reject_impact_child_mutation();

DROP TRIGGER IF EXISTS impact_score_component_write_guard ON analytics.impact_score_component;
CREATE TRIGGER impact_score_component_write_guard
BEFORE UPDATE OR DELETE ON analytics.impact_score_component
FOR EACH ROW EXECUTE FUNCTION analytics.reject_impact_child_mutation();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
GRANT USAGE ON SCHEMA analytics TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  analytics.impact_shock,
  analytics.impact_channel,
  analytics.impact_exposure_revision,
  analytics.impact_score_component
TO si_analytics;
GRANT UPDATE (exposure_state, sealed_at) ON analytics.impact_exposure_revision TO si_analytics;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics, si_knowledge, si_publisher;

GRANT SELECT ON
  analytics.impact_shock,
  analytics.impact_channel,
  analytics.impact_exposure_revision,
  analytics.impact_score_component
TO si_knowledge, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;
    GRANT SELECT ON
      analytics.impact_shock,
      analytics.impact_channel,
      analytics.impact_exposure_revision,
      analytics.impact_score_component
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
