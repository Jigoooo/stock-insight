export const scenarioSpatialImpactMigrationSql = `
-- P2-WD — Scenario branches and spatial impact paths
-- (enhancement plan P2-7/P2-12, §24 / §22.8-§22.9). Additive migration 040.
-- Scenarios are bull/base/bear with optional policy delay/exemption modifiers and
-- MUST carry counter-evidence and an invalidation condition. Spatial impact
-- paths use one of the three standard patterns and a named stable method; pure
-- spatial distance may never promote an impact edge.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── scenario set (a coherent family of branches for one situation) ────────────
CREATE TABLE IF NOT EXISTS analytics.scenario_set (
    scenario_set_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scenario_set_key     TEXT NOT NULL UNIQUE,
    impact_shock_id      BIGINT REFERENCES analytics.impact_shock(impact_shock_id),
    title                TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    as_of                TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(scenario_set_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= as_of)
);

-- ── scenario branch (bull/base/bear + policy modifier) ────────────────────────
CREATE TABLE IF NOT EXISTS analytics.scenario_branch (
    scenario_branch_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scenario_set_id      BIGINT NOT NULL REFERENCES analytics.scenario_set(scenario_set_id),
    branch_key           TEXT NOT NULL UNIQUE,
    branch_kind          TEXT NOT NULL CHECK (branch_kind IN ('bull','base','bear')),
    policy_modifier      TEXT CHECK (policy_modifier IS NULL OR policy_modifier IN ('delay','exemption','none')),
    narrative            TEXT,
    probability          NUMERIC CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
    branch_state         TEXT NOT NULL DEFAULT 'building'
      CHECK (branch_state IN ('building','sealed','invalidated')),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(branch_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_scenario_branch_set
  ON analytics.scenario_branch (scenario_set_id, branch_kind);

-- ── invalidation + counter-evidence (mandatory before sealing a branch) ───────
CREATE TABLE IF NOT EXISTS analytics.scenario_invalidation (
    scenario_invalidation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scenario_branch_id   BIGINT NOT NULL REFERENCES analytics.scenario_branch(scenario_branch_id),
    invalidation_condition TEXT NOT NULL CHECK (length(btrim(invalidation_condition)) > 0),
    counter_evidence_locator JSONB NOT NULL,
    monitored_signal     TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(counter_evidence_locator) = 'object'),
    UNIQUE (scenario_branch_id, invalidation_condition)
);
CREATE INDEX IF NOT EXISTS ix_scenario_invalidation_branch
  ON analytics.scenario_invalidation (scenario_branch_id);

-- ── spatial impact path (one of three standard patterns, named stable method) ─
CREATE TABLE IF NOT EXISTS analytics.spatial_impact_path (
    spatial_impact_path_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    path_key             TEXT NOT NULL UNIQUE,
    path_kind            TEXT NOT NULL CHECK (path_kind IN ('disaster_facility','sanction_jurisdiction','port_closure')),
    stable_method        TEXT NOT NULL CHECK (stable_method IN (
      'spatial_join','hierarchy_rollup','event_coreference','gravity','io_facility_graph','regional_panel'
    )),
    origin_geo_entity_id BIGINT REFERENCES geo.entity(geo_entity_id),
    affected_entity_id   BIGINT REFERENCES core.entity(entity_id),
    affected_geometry    geometry(Geometry, 4326),
    path_state           TEXT NOT NULL DEFAULT 'building'
      CHECK (path_state IN ('building','sealed','rejected')),
    evidence_locator     JSONB NOT NULL,
    available_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(path_key)) > 0),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at)
);
CREATE INDEX IF NOT EXISTS ix_spatial_impact_path_kind
  ON analytics.spatial_impact_path (path_kind, stable_method);
CREATE INDEX IF NOT EXISTS ix_spatial_impact_path_geom
  ON analytics.spatial_impact_path USING gist (affected_geometry);

-- ── spatial impact step (each step carries evidence + method) ─────────────────
CREATE TABLE IF NOT EXISTS analytics.spatial_impact_step (
    spatial_impact_step_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    spatial_impact_path_id BIGINT NOT NULL REFERENCES analytics.spatial_impact_path(spatial_impact_path_id),
    step_no              INTEGER NOT NULL CHECK (step_no >= 1),
    step_method          TEXT NOT NULL CHECK (length(btrim(step_method)) > 0),
    evidence_locator     JSONB NOT NULL,
    detail               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    UNIQUE (spatial_impact_path_id, step_no)
);
CREATE INDEX IF NOT EXISTS ix_spatial_impact_step_path
  ON analytics.spatial_impact_step (spatial_impact_path_id, step_no);

-- ── guards ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.reject_scenario_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- A scenario branch can only be sealed after an invalidation condition +
-- counter-evidence row exists for it.
CREATE OR REPLACE FUNCTION analytics.guard_scenario_branch_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_invalidations INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.scenario_branch is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.branch_state = 'sealed' AND OLD.branch_state <> 'sealed' THEN
    SELECT count(*) INTO v_invalidations
    FROM analytics.scenario_invalidation
    WHERE scenario_branch_id = OLD.scenario_branch_id;
    IF v_invalidations = 0 THEN
      RAISE EXCEPTION 'scenario branch requires counter-evidence and an invalidation condition before sealing';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.branch_state = 'sealed' THEN
    RAISE EXCEPTION 'scenario branch requires counter-evidence and an invalidation condition before sealing; insert as building first';
  END IF;
  RETURN NEW;
END $$;

-- A spatial impact path can only be sealed with at least one evidenced step, and
-- a step whose only method is bare spatial distance may not promote the edge.
CREATE OR REPLACE FUNCTION analytics.guard_spatial_impact_path_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_steps INTEGER;
  v_distance_only INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.spatial_impact_path is append-only' USING ERRCODE = '55000';
  END IF;
  -- A new path must enter as 'building'; sealing is only reached through the
  -- building -> sealed UPDATE transition below, which enforces the evidenced-step
  -- and not-distance-only rules. A direct sealed INSERT would bypass both
  -- (steps cannot exist before the path row does).
  IF TG_OP = 'INSERT' AND NEW.path_state = 'sealed' THEN
    RAISE EXCEPTION 'spatial impact path must be inserted as building; seal via the building->sealed transition';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.path_state = 'sealed' AND OLD.path_state <> 'sealed' THEN
    SELECT count(*) INTO v_steps
    FROM analytics.spatial_impact_step WHERE spatial_impact_path_id = OLD.spatial_impact_path_id;
    IF v_steps = 0 THEN
      RAISE EXCEPTION 'spatial impact path requires at least one evidenced step before sealing';
    END IF;
    SELECT count(*) INTO v_distance_only
    FROM analytics.spatial_impact_step
    WHERE spatial_impact_path_id = OLD.spatial_impact_path_id
      AND lower(step_method) IN ('distance','proximity','spatial_distance','nearest');
    IF v_distance_only = v_steps THEN
      RAISE EXCEPTION 'spatial proximity alone cannot promote an impact edge (all steps are distance-only)';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── install guards ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS scenario_branch_write_guard ON analytics.scenario_branch;
CREATE TRIGGER scenario_branch_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.scenario_branch
FOR EACH ROW EXECUTE FUNCTION analytics.guard_scenario_branch_write();

DROP TRIGGER IF EXISTS scenario_invalidation_write_guard ON analytics.scenario_invalidation;
CREATE TRIGGER scenario_invalidation_write_guard
BEFORE UPDATE OR DELETE ON analytics.scenario_invalidation
FOR EACH ROW EXECUTE FUNCTION analytics.reject_scenario_child_mutation();

DROP TRIGGER IF EXISTS spatial_impact_path_write_guard ON analytics.spatial_impact_path;
CREATE TRIGGER spatial_impact_path_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.spatial_impact_path
FOR EACH ROW EXECUTE FUNCTION analytics.guard_spatial_impact_path_write();

DROP TRIGGER IF EXISTS spatial_impact_step_write_guard ON analytics.spatial_impact_step;
CREATE TRIGGER spatial_impact_step_write_guard
BEFORE UPDATE OR DELETE ON analytics.spatial_impact_step
FOR EACH ROW EXECUTE FUNCTION analytics.reject_scenario_child_mutation();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
GRANT USAGE ON SCHEMA analytics TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  analytics.scenario_set,
  analytics.scenario_branch,
  analytics.scenario_invalidation,
  analytics.spatial_impact_path,
  analytics.spatial_impact_step
TO si_analytics;
GRANT UPDATE (branch_state) ON analytics.scenario_branch TO si_analytics;
GRANT UPDATE (path_state) ON analytics.spatial_impact_path TO si_analytics;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics, si_knowledge, si_publisher;

GRANT SELECT ON
  analytics.scenario_set,
  analytics.scenario_branch,
  analytics.scenario_invalidation,
  analytics.spatial_impact_path,
  analytics.spatial_impact_step
TO si_knowledge, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;
    GRANT SELECT ON
      analytics.scenario_set,
      analytics.scenario_branch,
      analytics.scenario_invalidation,
      analytics.spatial_impact_path,
      analytics.spatial_impact_step
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
