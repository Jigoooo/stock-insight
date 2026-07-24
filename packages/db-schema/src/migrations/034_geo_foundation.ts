export const geoFoundationMigrationSql = `
-- P1-W4 — Geo foundation: canonical location objects with role, precision, time,
-- and evidence (enhancement plan Task 6, P1-14·15·17·18).
-- Additive migration 034. Requires PostGIS (verified against the timescaledb-ha
-- pg16 image, PostGIS 3.6.4). Existing core.entity rows are only read for the
-- additive country seed; nothing is rewritten, renamed, or deleted.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS geo;

-- The machine gate: a location candidate below this score may never be
-- auto-resolved. Abstention is always allowed instead of a forced pick.
CREATE TABLE IF NOT EXISTS geo.resolution_policy (
    geo_resolution_policy_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    policy_key           TEXT NOT NULL UNIQUE,
    geo_auto_resolve_threshold NUMERIC NOT NULL
      CHECK (geo_auto_resolve_threshold > 0 AND geo_auto_resolve_threshold <= 1),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO geo.resolution_policy (policy_key, geo_auto_resolve_threshold)
VALUES ('default', 0.90)
ON CONFLICT (policy_key) DO NOTHING;

-- ── canonical geo entity identity (stable key, mutable spatial in revisions) ──
CREATE TABLE IF NOT EXISTS geo.entity (
    geo_entity_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    geo_entity_key       TEXT NOT NULL UNIQUE,
    geo_kind             TEXT NOT NULL
      CHECK (geo_kind IN ('country','admin_area','city','facility','region','point_of_interest')),
    canonical_name       TEXT NOT NULL CHECK (length(btrim(canonical_name)) > 0),
    parent_geo_entity_id BIGINT REFERENCES geo.entity(geo_entity_id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(geo_entity_key)) > 0),
    CHECK (parent_geo_entity_id IS NULL OR parent_geo_entity_id <> geo_entity_id)
);
CREATE INDEX IF NOT EXISTS ix_geo_entity_parent ON geo.entity (parent_geo_entity_id);

-- ── append-only spatial revision: geometry, precision, boundary, time ─────────
CREATE TABLE IF NOT EXISTS geo.entity_revision (
    geo_entity_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    geo_entity_id        BIGINT NOT NULL REFERENCES geo.entity(geo_entity_id),
    revision_no          INTEGER NOT NULL CHECK (revision_no > 0),
    geom                 geometry(Geometry, 4326),
    precision_class      TEXT NOT NULL
      CHECK (precision_class IN ('exact','approximate','admin_area','country','unknown')),
    boundary_policy      TEXT NOT NULL DEFAULT 'undisputed'
      CHECK (boundary_policy IN ('undisputed','disputed','de_facto')),
    disputed_note        TEXT,
    source_revision_id   BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    valid_from           TIMESTAMPTZ,
    valid_until          TIMESTAMPTZ,
    known_from           TIMESTAMPTZ NOT NULL,
    supersedes_geo_entity_revision_id BIGINT REFERENCES geo.entity_revision(geo_entity_revision_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (geo_entity_id, revision_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (known_from >= coalesce(valid_from, known_from)),
    CHECK (
      (revision_no = 1 AND supersedes_geo_entity_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_geo_entity_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_geo_entity_revision_pit
  ON geo.entity_revision (geo_entity_id, known_from, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_geo_entity_revision_geom
  ON geo.entity_revision USING gist (geom);

-- ── external standard crosswalk ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.crosswalk (
    geo_crosswalk_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crosswalk_key        TEXT NOT NULL UNIQUE,
    geo_entity_id        BIGINT NOT NULL REFERENCES geo.entity(geo_entity_id),
    standard             TEXT NOT NULL
      CHECK (standard IN ('iso3166','unm49','geonames','unlocode','iana_tz')),
    external_id          TEXT NOT NULL CHECK (length(btrim(external_id)) > 0),
    mapping_status       TEXT NOT NULL DEFAULT 'proposed'
      CHECK (mapping_status IN ('proposed','verified','deprecated')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(crosswalk_key)) > 0),
    UNIQUE (geo_entity_id, standard, external_id)
);
CREATE INDEX IF NOT EXISTS ix_geo_crosswalk_entity ON geo.crosswalk (geo_entity_id, standard);

-- ── a location mentioned in a source, awaiting resolution ─────────────────────
CREATE TABLE IF NOT EXISTS geo.location_mention (
    geo_location_mention_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mention_key          TEXT NOT NULL UNIQUE,
    surface_text         TEXT NOT NULL CHECK (length(btrim(surface_text)) > 0),
    location_role        TEXT NOT NULL
      CHECK (location_role IN ('headquarters','operation','market','jurisdiction','origin','destination','mention')),
    source_revision_id   BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    source_span_locator  JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(mention_key)) > 0),
    CHECK (source_span_locator IS NULL OR jsonb_typeof(source_span_locator) = 'object')
);

-- ── candidate geo entity for a mention, with feature evidence ─────────────────
CREATE TABLE IF NOT EXISTS geo.location_candidate (
    geo_location_candidate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    geo_location_mention_id BIGINT NOT NULL REFERENCES geo.location_mention(geo_location_mention_id),
    geo_entity_id        BIGINT NOT NULL REFERENCES geo.entity(geo_entity_id),
    feature_evidence     JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(feature_evidence) = 'object'),
    UNIQUE (geo_location_mention_id, geo_entity_id)
);
CREATE INDEX IF NOT EXISTS ix_geo_location_candidate_mention
  ON geo.location_candidate (geo_location_mention_id);

-- ── append-only resolution decision (abstention is a first-class outcome) ─────
CREATE TABLE IF NOT EXISTS geo.location_decision (
    geo_location_decision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    geo_location_mention_id BIGINT NOT NULL REFERENCES geo.location_mention(geo_location_mention_id),
    revision_no          INTEGER NOT NULL CHECK (revision_no > 0),
    decision             TEXT NOT NULL
      CHECK (decision IN ('auto_resolve','needs_review','abstain','non_link')),
    resolved_geo_entity_id BIGINT REFERENCES geo.entity(geo_entity_id),
    classifier_score     NUMERIC CHECK (classifier_score IS NULL OR (classifier_score >= 0 AND classifier_score <= 1)),
    precision_class      TEXT
      CHECK (precision_class IS NULL OR precision_class IN ('exact','approximate','admin_area','country','unknown')),
    evidence_locator     JSONB,
    valid_from           TIMESTAMPTZ,
    known_from           TIMESTAMPTZ,
    reviewer_id          TEXT,
    reviewed_at          TIMESTAMPTZ,
    decided_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    supersedes_geo_location_decision_id BIGINT REFERENCES geo.location_decision(geo_location_decision_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    UNIQUE (geo_location_mention_id, revision_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (evidence_locator IS NULL OR jsonb_typeof(evidence_locator) = 'object'),
    -- A resolved link needs a target; abstain/non_link never carry a target.
    CHECK (
      (decision = 'auto_resolve' AND resolved_geo_entity_id IS NOT NULL) OR
      (decision = 'needs_review') OR
      (decision IN ('abstain','non_link') AND resolved_geo_entity_id IS NULL)
    ),
    CHECK (
      (revision_no = 1 AND supersedes_geo_location_decision_id IS NULL) OR
      (revision_no > 1 AND supersedes_geo_location_decision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_geo_location_decision_mention
  ON geo.location_decision (geo_location_mention_id, revision_no DESC);

-- ── gold set + machine gate result ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.gold_location (
    geo_gold_location_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gold_key             TEXT NOT NULL UNIQUE,
    geo_location_mention_id BIGINT REFERENCES geo.location_mention(geo_location_mention_id),
    expected_geo_entity_id BIGINT REFERENCES geo.entity(geo_entity_id),
    expected_decision    TEXT NOT NULL
      CHECK (expected_decision IN ('auto_resolve','needs_review','abstain','non_link')),
    machine_gate_result  TEXT
      CHECK (machine_gate_result IS NULL OR machine_gate_result IN ('pass','fail','unevaluated')),
    evaluated_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(gold_key)) > 0)
);

-- ── guards ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geo.reject_geo_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

CREATE OR REPLACE FUNCTION geo.guard_entity_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prev_entity BIGINT;
  v_prev_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'geo.entity_revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.geo_entity_id, previous.revision_no
    INTO v_prev_entity, v_prev_revision
    FROM geo.entity_revision previous
    WHERE previous.geo_entity_revision_id = NEW.supersedes_geo_entity_revision_id;
    IF v_prev_entity IS DISTINCT FROM NEW.geo_entity_id
       OR v_prev_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'geo entity supersession must reference the previous revision of the same entity';
    END IF;
  END IF;
  IF NEW.boundary_policy = 'disputed' AND (NEW.disputed_note IS NULL OR length(btrim(NEW.disputed_note)) = 0) THEN
    RAISE EXCEPTION 'disputed geo boundary requires a disputed_note';
  END IF;
  RETURN NEW;
END $$;

-- Location decisions are append-only; an ambiguous candidate (score below the
-- auto-resolve threshold) may never be auto-resolved, and an auto-resolve needs
-- a resolved geo entity plus evidence, precision class, role, and known time.
CREATE OR REPLACE FUNCTION geo.guard_location_decision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_threshold NUMERIC;
  v_prev_mention BIGINT;
  v_prev_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'geo.location_decision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.decision = 'auto_resolve' THEN
    SELECT geo_auto_resolve_threshold INTO v_threshold
    FROM geo.resolution_policy WHERE policy_key = 'default';
    IF NEW.classifier_score IS NULL OR NEW.classifier_score < v_threshold THEN
      RAISE EXCEPTION 'ambiguous location may not be auto-resolved (score % < threshold %)',
        NEW.classifier_score, v_threshold;
    END IF;
    IF NEW.resolved_geo_entity_id IS NULL
       OR NEW.evidence_locator IS NULL
       OR NEW.precision_class IS NULL
       OR NEW.known_from IS NULL THEN
      RAISE EXCEPTION 'auto-resolved location requires a resolved geo entity and evidence, precision class, and known time';
    END IF;
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.geo_location_mention_id, previous.revision_no
    INTO v_prev_mention, v_prev_revision
    FROM geo.location_decision previous
    WHERE previous.geo_location_decision_id = NEW.supersedes_geo_location_decision_id;
    IF v_prev_mention IS DISTINCT FROM NEW.geo_location_mention_id
       OR v_prev_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'geo location decision supersession must reference the previous revision of the same mention';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── additive country seed from existing entity country codes ──────────────────
-- Each distinct ISO-ish country_code on core.entity becomes one canonical geo
-- country entity + a country-precision revision + an ISO3166 crosswalk. No core
-- row is modified; non-country pseudo codes stay out of the strict ISO crosswalk.
INSERT INTO geo.entity (geo_entity_key, geo_kind, canonical_name)
SELECT 'country:'||entity.country_code, 'country', entity.country_code
FROM (SELECT DISTINCT country_code FROM core.entity WHERE country_code IS NOT NULL) entity
ON CONFLICT (geo_entity_key) DO NOTHING;

INSERT INTO geo.entity_revision (
  geo_entity_id, revision_no, precision_class, boundary_policy, known_from, metadata
)
SELECT geo_entity.geo_entity_id,
       1,
       'country',
       'undisputed',
       now(),
       jsonb_build_object('seed_policy','p1-w4-country-v1','country_code',geo_entity.canonical_name)
FROM geo.entity geo_entity
WHERE geo_entity.geo_kind = 'country'
  AND geo_entity.geo_entity_key LIKE 'country:%'
  AND NOT EXISTS (
    SELECT 1 FROM geo.entity_revision existing
    WHERE existing.geo_entity_id = geo_entity.geo_entity_id AND existing.revision_no = 1
  );

INSERT INTO geo.crosswalk (crosswalk_key, geo_entity_id, standard, external_id, mapping_status)
SELECT 'iso3166:'||geo_entity.canonical_name,
       geo_entity.geo_entity_id,
       'iso3166',
       geo_entity.canonical_name,
       'proposed'
FROM geo.entity geo_entity
WHERE geo_entity.geo_kind = 'country'
  AND geo_entity.canonical_name ~ '^[A-Z]{2}$'
ON CONFLICT (crosswalk_key) DO NOTHING;

DO $$
DECLARE
  v_codes BIGINT;
  v_entities BIGINT;
  v_revisions BIGINT;
BEGIN
  SELECT count(DISTINCT country_code) INTO v_codes FROM core.entity WHERE country_code IS NOT NULL;
  SELECT count(*) INTO v_entities FROM geo.entity WHERE geo_entity_key LIKE 'country:%';
  SELECT count(*) INTO v_revisions
  FROM geo.entity_revision revision
  JOIN geo.entity geo_entity USING (geo_entity_id)
  WHERE geo_entity.geo_entity_key LIKE 'country:%' AND revision.revision_no = 1;
  IF v_entities <> v_codes OR v_revisions <> v_codes THEN
    RAISE EXCEPTION 'P1-W4 geo seed parity mismatch: codes=% entities=% revisions=%',
      v_codes, v_entities, v_revisions;
  END IF;
END $$;

-- ── install guards after the validated seed ──────────────────────────────────
DROP TRIGGER IF EXISTS geo_entity_revision_write_guard ON geo.entity_revision;
CREATE TRIGGER geo_entity_revision_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON geo.entity_revision
FOR EACH ROW EXECUTE FUNCTION geo.guard_entity_revision_write();

DROP TRIGGER IF EXISTS geo_location_decision_write_guard ON geo.location_decision;
CREATE TRIGGER geo_location_decision_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON geo.location_decision
FOR EACH ROW EXECUTE FUNCTION geo.guard_location_decision_write();

DROP TRIGGER IF EXISTS geo_location_candidate_write_guard ON geo.location_candidate;
CREATE TRIGGER geo_location_candidate_write_guard
BEFORE UPDATE OR DELETE ON geo.location_candidate
FOR EACH ROW EXECUTE FUNCTION geo.reject_geo_child_mutation();

DROP TRIGGER IF EXISTS geo_location_mention_write_guard ON geo.location_mention;
CREATE TRIGGER geo_location_mention_write_guard
BEFORE UPDATE OR DELETE ON geo.location_mention
FOR EACH ROW EXECUTE FUNCTION geo.reject_geo_child_mutation();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
GRANT USAGE ON SCHEMA geo TO si_knowledge, si_analytics, si_publisher, si_readapi;
-- The append-only location-decision guard runs SECURITY INVOKER and reads the
-- policy row for the auto-resolve threshold, so the writer role must SELECT the
-- policy table or a legitimate auto_resolve INSERT fails permission-denied.
GRANT SELECT ON geo.resolution_policy
  TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  geo.entity,
  geo.entity_revision,
  geo.crosswalk,
  geo.location_mention,
  geo.location_candidate,
  geo.location_decision,
  geo.gold_location
TO si_knowledge;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA geo TO si_knowledge, si_analytics, si_publisher;

GRANT SELECT ON
  geo.entity,
  geo.entity_revision,
  geo.crosswalk,
  geo.location_mention,
  geo.location_candidate,
  geo.location_decision,
  geo.gold_location
TO si_analytics, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA geo TO stock_insight_app_reader;
    GRANT SELECT ON
      geo.entity,
      geo.entity_revision,
      geo.crosswalk,
      geo.location_mention,
      geo.location_candidate,
      geo.location_decision,
      geo.gold_location
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
