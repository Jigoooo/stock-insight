export const graphSnapshotAnalyticsMigrationSql = `
-- B7 — reproducible graph snapshot, measurement, community, impact path v2
-- (master plan §8 B7, migration 025). Purely additive: legacy
-- analytics.impact_path (7,708 rows) is preserved untouched; v2 tables use
-- exact step-level FKs instead of array columns. Communities and market
-- measurements are snapshot-scoped analytics artifacts — they never write
-- into the structural relation ledger.

-- ── snapshot header ──────────────────────────────────────────────────────────
-- A snapshot pins the exact set of relation revisions visible at (as_of,
-- known_at) for one builder version. snapshot_digest = deterministic SHA-256
-- over the ordered relation_revision_id set, so replaying the same cutoffs
-- must reproduce the same digest.
CREATE TABLE IF NOT EXISTS analytics.graph_snapshot (
    graph_snapshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    as_of            TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    builder_version  TEXT NOT NULL,
    snapshot_digest  TEXT NOT NULL CHECK (snapshot_digest ~ '^[a-f0-9]{64}$'),
    edge_count       INTEGER NOT NULL CHECK (edge_count >= 0),
    entity_count     INTEGER NOT NULL CHECK (entity_count >= 0),
    status           TEXT NOT NULL DEFAULT 'building'
      CHECK (status IN ('building','sealed','superseded','failed')),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sealed_at        TIMESTAMPTZ,
    UNIQUE (as_of, known_at, builder_version)
);

-- ── snapshot edges: exact relation revision membership ───────────────────────
CREATE TABLE IF NOT EXISTS analytics.graph_snapshot_edge (
    graph_snapshot_edge_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_snapshot_id BIGINT NOT NULL REFERENCES analytics.graph_snapshot(graph_snapshot_id),
    relation_revision_id BIGINT NOT NULL REFERENCES knowledge.relation_revision(relation_revision_id),
    relation_identity_id BIGINT NOT NULL REFERENCES knowledge.relation_identity(relation_identity_id),
    subject_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    object_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    predicate         TEXT NOT NULL,
    relation_kind     TEXT NOT NULL,
    confidence        REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    UNIQUE (graph_snapshot_id, relation_revision_id),
    CONSTRAINT ux_graph_snapshot_edge_identity UNIQUE (graph_snapshot_id, relation_identity_id)
);
CREATE INDEX IF NOT EXISTS ix_graph_snapshot_edge_subject
  ON analytics.graph_snapshot_edge (graph_snapshot_id, subject_entity_id);
CREATE INDEX IF NOT EXISTS ix_graph_snapshot_edge_object
  ON analytics.graph_snapshot_edge (graph_snapshot_id, object_entity_id);

-- ── per-snapshot entity degree (B6 cross-hub carry-over) ─────────────────────
-- B6 builders cap per-hub expansion but cannot see cross-hub accumulation.
-- The snapshot layer measures the TOTAL degree of every entity across all
-- predicates so downstream consumers can flag or dampen cross-hub superhubs.
CREATE TABLE IF NOT EXISTS analytics.graph_snapshot_degree (
    graph_snapshot_degree_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_snapshot_id BIGINT NOT NULL REFERENCES analytics.graph_snapshot(graph_snapshot_id),
    entity_id         BIGINT NOT NULL REFERENCES core.entity(entity_id),
    total_degree      INTEGER NOT NULL CHECK (total_degree >= 0),
    degree_by_predicate JSONB NOT NULL DEFAULT '{}',
    superhub_flag     BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (graph_snapshot_id, entity_id)
);

-- ── impact path v2: step-level exact FKs (replaces legacy array columns) ─────
CREATE TABLE IF NOT EXISTS analytics.impact_path_v2 (
    impact_path_v2_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_snapshot_id BIGINT NOT NULL REFERENCES analytics.graph_snapshot(graph_snapshot_id),
    trigger_event_id  BIGINT REFERENCES knowledge.event(event_id),
    source_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    target_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    hop_count         INTEGER NOT NULL CHECK (hop_count >= 1),
    path_score        REAL NOT NULL CHECK (path_score >= 0 AND path_score <= 1),
    direction         TEXT NOT NULL CHECK (direction IN ('benefit','harm','mixed','unknown')),
    horizon           TEXT NOT NULL DEFAULT '1q',
    inference_kind    TEXT NOT NULL,
    rule_version      TEXT NOT NULL,
    explanation       JSONB NOT NULL DEFAULT '{}',
    inference_run_id  TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'building'
      CHECK (status IN ('building','sealed','failed')),
    sealed_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'sealed' OR sealed_at IS NOT NULL),
    UNIQUE (graph_snapshot_id, trigger_event_id, target_entity_id, inference_run_id)
);
CREATE INDEX IF NOT EXISTS ix_impact_path_v2_target
  ON analytics.impact_path_v2 (target_entity_id, path_score DESC);

CREATE TABLE IF NOT EXISTS analytics.impact_path_step (
    impact_path_step_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    impact_path_v2_id BIGINT NOT NULL REFERENCES analytics.impact_path_v2(impact_path_v2_id),
    step_no           INTEGER NOT NULL CHECK (step_no >= 1),
    graph_snapshot_edge_id BIGINT NOT NULL REFERENCES analytics.graph_snapshot_edge(graph_snapshot_edge_id),
    from_entity_id    BIGINT NOT NULL REFERENCES core.entity(entity_id),
    to_entity_id      BIGINT NOT NULL REFERENCES core.entity(entity_id),
    edge_contribution REAL NOT NULL CHECK (edge_contribution >= 0 AND edge_contribution <= 1),
    UNIQUE (impact_path_v2_id, step_no)
);

-- ── snapshot-scoped market measurements (validation, NEVER structural) ───────
-- Diebold–Yilmaz FEVD / correlation / lead-lag / event study results weight
-- or validate structural relations; they must not create canonical edges.
CREATE TABLE IF NOT EXISTS analytics.relation_measurement (
    relation_measurement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_snapshot_id BIGINT NOT NULL REFERENCES analytics.graph_snapshot(graph_snapshot_id),
    subject_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    object_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    measurement_kind  TEXT NOT NULL
      CHECK (measurement_kind IN ('correlation','partial_correlation','lead_lag','fevd','event_study')),
    window_start      TIMESTAMPTZ NOT NULL,
    window_end        TIMESTAMPTZ NOT NULL CHECK (window_end > window_start),
    value             DOUBLE PRECISION NOT NULL,
    model_config      JSONB NOT NULL,
    input_watermark   JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (graph_snapshot_id, subject_entity_id, object_entity_id, measurement_kind, window_start, window_end)
);

-- ── snapshot-scoped community assignments (labels, distinct from themes) ─────
CREATE TABLE IF NOT EXISTS analytics.graph_community (
    graph_community_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_snapshot_id BIGINT NOT NULL REFERENCES analytics.graph_snapshot(graph_snapshot_id),
    algorithm         TEXT NOT NULL,
    parameters        JSONB NOT NULL,
    community_key     TEXT NOT NULL,
    member_count      INTEGER NOT NULL CHECK (member_count >= 1),
    modularity        DOUBLE PRECISION,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (graph_snapshot_id, algorithm, community_key)
);

CREATE TABLE IF NOT EXISTS analytics.graph_community_member (
    graph_community_member_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_community_id BIGINT NOT NULL REFERENCES analytics.graph_community(graph_community_id),
    entity_id          BIGINT NOT NULL REFERENCES core.entity(entity_id),
    membership_strength REAL CHECK (membership_strength IS NULL OR (membership_strength >= 0 AND membership_strength <= 1)),
    UNIQUE (graph_community_id, entity_id)
);

CREATE OR REPLACE FUNCTION analytics.compute_graph_snapshot_digest(p_graph_snapshot_id BIGINT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(coalesce(string_agg(
    edge.relation_revision_id::text || ':' ||
    edge.relation_identity_id::text || ':' ||
    edge.subject_entity_id::text || ':' ||
    encode(convert_to(edge.predicate, 'UTF8'), 'hex') || ':' ||
    edge.object_entity_id::text || ':' ||
    encode(convert_to(edge.relation_kind, 'UTF8'), 'hex') || ':' ||
    encode(pg_catalog.float4send(edge.confidence), 'hex'),
    E'\n' ORDER BY edge.relation_revision_id
  ), ''), 'UTF8')), 'hex')
  FROM analytics.graph_snapshot_edge edge
  WHERE edge.graph_snapshot_id = p_graph_snapshot_id
$$;

CREATE OR REPLACE FUNCTION analytics.guard_graph_snapshot_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_edge_count BIGINT;
  v_entity_count BIGINT;
  v_actual_digest TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'building' OR NEW.sealed_at IS NOT NULL THEN
      RAISE EXCEPTION 'graph snapshot must start in building state';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.graph_snapshot is append-only' USING ERRCODE='55000';
  END IF;
  IF ROW(
    NEW.graph_snapshot_id, NEW.as_of, NEW.known_at, NEW.builder_version,
    NEW.snapshot_digest, NEW.edge_count, NEW.entity_count, NEW.metadata, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.graph_snapshot_id, OLD.as_of, OLD.known_at, OLD.builder_version,
    OLD.snapshot_digest, OLD.edge_count, OLD.entity_count, OLD.metadata, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'graph snapshot immutable fields cannot change' USING ERRCODE='55000';
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'sealed' THEN
    IF NEW.sealed_at IS NULL THEN
      RAISE EXCEPTION 'sealed graph snapshot requires sealed_at';
    END IF;
    SELECT count(*) INTO v_edge_count
    FROM analytics.graph_snapshot_edge edge
    WHERE edge.graph_snapshot_id = OLD.graph_snapshot_id;
    SELECT count(*) INTO v_entity_count
    FROM (
      SELECT edge.subject_entity_id AS entity_id
      FROM analytics.graph_snapshot_edge edge
      WHERE edge.graph_snapshot_id = OLD.graph_snapshot_id
      UNION
      SELECT edge.object_entity_id
      FROM analytics.graph_snapshot_edge edge
      WHERE edge.graph_snapshot_id = OLD.graph_snapshot_id
    ) entities;
    IF v_edge_count <> NEW.edge_count OR v_entity_count <> NEW.entity_count THEN
      RAISE EXCEPTION 'graph snapshot count mismatch';
    END IF;
    v_actual_digest := analytics.compute_graph_snapshot_digest(OLD.graph_snapshot_id);
    IF v_actual_digest IS DISTINCT FROM NEW.snapshot_digest THEN
      RAISE EXCEPTION 'graph snapshot digest mismatch';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'failed' AND NEW.sealed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'sealed'
     AND NEW.status = 'superseded'
     AND NEW.sealed_at IS NOT DISTINCT FROM OLD.sealed_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid graph snapshot status transition % -> %', OLD.status, NEW.status;
END $$;

DROP TRIGGER IF EXISTS graph_snapshot_write_guard ON analytics.graph_snapshot;
CREATE TRIGGER graph_snapshot_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.graph_snapshot
FOR EACH ROW EXECUTE FUNCTION analytics.guard_graph_snapshot_write();

CREATE OR REPLACE FUNCTION analytics.guard_graph_artifact_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_anchor_snapshot_id BIGINT;
  v_required_status TEXT;
  v_actual_status TEXT;
  v_snapshot_as_of TIMESTAMPTZ;
  v_snapshot_known_at TIMESTAMPTZ;
  v_relation_matches BOOLEAN;
  v_parent_status TEXT;
  v_endpoint_matches BOOLEAN;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME USING ERRCODE='55000';
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'graph_snapshot_edge' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'building';
    WHEN 'graph_snapshot_degree' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'building';
    WHEN 'relation_measurement' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'sealed';
    WHEN 'graph_community' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'sealed';
    WHEN 'impact_path_step' THEN
      SELECT path.graph_snapshot_id,
             edge.graph_snapshot_id,
             path.status,
             edge.subject_entity_id = NEW.from_entity_id
               AND edge.object_entity_id = NEW.to_entity_id
      INTO v_snapshot_id, v_anchor_snapshot_id, v_parent_status, v_endpoint_matches
      FROM analytics.impact_path_v2 path
      JOIN analytics.graph_snapshot_edge edge
        ON edge.graph_snapshot_edge_id = NEW.graph_snapshot_edge_id
      WHERE path.impact_path_v2_id = NEW.impact_path_v2_id
      FOR SHARE OF path;
      IF v_snapshot_id IS NULL OR v_anchor_snapshot_id IS DISTINCT FROM v_snapshot_id THEN
        RAISE EXCEPTION 'impact path step edge must belong to the same graph snapshot';
      END IF;
      IF v_parent_status IS DISTINCT FROM 'building' THEN
        RAISE EXCEPTION 'impact path steps may only be added while building';
      END IF;
      IF NOT v_endpoint_matches THEN
        RAISE EXCEPTION 'impact path step endpoints must match the referenced edge';
      END IF;
      v_required_status := 'sealed';
    WHEN 'graph_community_member' THEN
      SELECT community.graph_snapshot_id INTO v_snapshot_id
      FROM analytics.graph_community community
      WHERE community.graph_community_id = NEW.graph_community_id;
      v_required_status := 'sealed';
    ELSE
      RAISE EXCEPTION 'unsupported graph artifact table %', TG_TABLE_NAME;
  END CASE;
  SELECT snapshot.status, snapshot.as_of, snapshot.known_at
  INTO v_actual_status, v_snapshot_as_of, v_snapshot_known_at
  FROM analytics.graph_snapshot snapshot
  WHERE snapshot.graph_snapshot_id = v_snapshot_id
  FOR SHARE;
  IF v_actual_status IS DISTINCT FROM v_required_status THEN
    RAISE EXCEPTION '% insert requires graph snapshot status %', TG_TABLE_NAME, v_required_status;
  END IF;
  IF TG_TABLE_NAME = 'graph_snapshot_edge' THEN
    SELECT EXISTS (
      SELECT 1
      FROM knowledge.relation_revision revision
      JOIN knowledge.relation_identity identity_row
        ON identity_row.relation_identity_id = revision.relation_identity_id
      WHERE revision.relation_revision_id = NEW.relation_revision_id
        AND revision.relation_identity_id = NEW.relation_identity_id
        AND revision.revision_status = 'accepted'
        AND revision.valid_from <= v_snapshot_as_of
        AND (revision.valid_to IS NULL OR revision.valid_to > v_snapshot_as_of)
        AND revision.known_from <= v_snapshot_known_at
        AND NOT EXISTS (
          SELECT 1
          FROM knowledge.relation_revision newer
          WHERE newer.relation_identity_id = revision.relation_identity_id
            AND newer.revision_no > revision.revision_no
            AND newer.revision_status = 'accepted'
            AND newer.valid_from <= v_snapshot_as_of
            AND (newer.valid_to IS NULL OR newer.valid_to > v_snapshot_as_of)
            AND newer.known_from <= v_snapshot_known_at
        )
        AND identity_row.subject_entity_id = NEW.subject_entity_id
        AND identity_row.object_entity_id = NEW.object_entity_id
        AND identity_row.predicate = NEW.predicate
        AND revision.relation_kind = NEW.relation_kind
        AND revision.confidence = NEW.confidence
    ) INTO v_relation_matches;
    IF NOT v_relation_matches THEN
      RAISE EXCEPTION 'graph snapshot edge must match one accepted PIT relation revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION analytics.guard_impact_path_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_snapshot_status TEXT;
  v_step_count BIGINT;
  v_first_step INTEGER;
  v_last_step INTEGER;
  v_first_entity BIGINT;
  v_last_entity BIGINT;
  v_broken_links BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT snapshot.status INTO v_snapshot_status
    FROM analytics.graph_snapshot snapshot
    WHERE snapshot.graph_snapshot_id = NEW.graph_snapshot_id
    FOR SHARE;
    IF v_snapshot_status IS DISTINCT FROM 'sealed'
       OR NEW.status <> 'building'
       OR NEW.sealed_at IS NOT NULL THEN
      RAISE EXCEPTION 'impact path must start building on a sealed graph snapshot';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.impact_path_v2 is append-only' USING ERRCODE='55000';
  END IF;
  IF ROW(
    NEW.impact_path_v2_id, NEW.graph_snapshot_id, NEW.trigger_event_id,
    NEW.source_entity_id, NEW.target_entity_id, NEW.hop_count, NEW.path_score,
    NEW.direction, NEW.horizon, NEW.inference_kind, NEW.rule_version,
    NEW.explanation, NEW.inference_run_id, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.impact_path_v2_id, OLD.graph_snapshot_id, OLD.trigger_event_id,
    OLD.source_entity_id, OLD.target_entity_id, OLD.hop_count, OLD.path_score,
    OLD.direction, OLD.horizon, OLD.inference_kind, OLD.rule_version,
    OLD.explanation, OLD.inference_run_id, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'impact path immutable fields cannot change' USING ERRCODE='55000';
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'sealed' THEN
    IF NEW.sealed_at IS NULL THEN
      RAISE EXCEPTION 'sealed impact path requires sealed_at';
    END IF;
    SELECT count(*), min(step.step_no), max(step.step_no),
           max(step.from_entity_id) FILTER (WHERE step.step_no = 1),
           max(step.to_entity_id) FILTER (WHERE step.step_no = NEW.hop_count)
    INTO v_step_count, v_first_step, v_last_step, v_first_entity, v_last_entity
    FROM analytics.impact_path_step step
    WHERE step.impact_path_v2_id = OLD.impact_path_v2_id;
    SELECT count(*) INTO v_broken_links
    FROM (
      SELECT step.from_entity_id,
             lag(step.to_entity_id) OVER (ORDER BY step.step_no) AS previous_to
      FROM analytics.impact_path_step step
      WHERE step.impact_path_v2_id = OLD.impact_path_v2_id
    ) ordered_steps
    WHERE previous_to IS NOT NULL AND previous_to <> from_entity_id;
    IF v_step_count <> NEW.hop_count
       OR v_first_step <> 1
       OR v_last_step <> NEW.hop_count
       OR v_first_entity IS DISTINCT FROM NEW.source_entity_id
       OR v_last_entity IS DISTINCT FROM NEW.target_entity_id
       OR v_broken_links <> 0 THEN
      RAISE EXCEPTION 'impact path steps do not match the sealed path contract';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'failed' AND NEW.sealed_at IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid impact path status transition % -> %', OLD.status, NEW.status;
END $$;

DROP TRIGGER IF EXISTS graph_snapshot_edge_write_guard ON analytics.graph_snapshot_edge;
CREATE TRIGGER graph_snapshot_edge_write_guard BEFORE INSERT OR UPDATE OR DELETE ON analytics.graph_snapshot_edge
FOR EACH ROW EXECUTE FUNCTION analytics.guard_graph_artifact_write();
DROP TRIGGER IF EXISTS graph_snapshot_degree_write_guard ON analytics.graph_snapshot_degree;
CREATE TRIGGER graph_snapshot_degree_write_guard BEFORE INSERT OR UPDATE OR DELETE ON analytics.graph_snapshot_degree
FOR EACH ROW EXECUTE FUNCTION analytics.guard_graph_artifact_write();
DROP TRIGGER IF EXISTS impact_path_v2_write_guard ON analytics.impact_path_v2;
CREATE TRIGGER impact_path_v2_write_guard BEFORE INSERT OR UPDATE OR DELETE ON analytics.impact_path_v2
FOR EACH ROW EXECUTE FUNCTION analytics.guard_impact_path_write();
DROP TRIGGER IF EXISTS impact_path_step_write_guard ON analytics.impact_path_step;
CREATE TRIGGER impact_path_step_write_guard BEFORE INSERT OR UPDATE OR DELETE ON analytics.impact_path_step
FOR EACH ROW EXECUTE FUNCTION analytics.guard_graph_artifact_write();
DROP TRIGGER IF EXISTS relation_measurement_write_guard ON analytics.relation_measurement;
CREATE TRIGGER relation_measurement_write_guard BEFORE INSERT OR UPDATE OR DELETE ON analytics.relation_measurement
FOR EACH ROW EXECUTE FUNCTION analytics.guard_graph_artifact_write();
DROP TRIGGER IF EXISTS graph_community_write_guard ON analytics.graph_community;
CREATE TRIGGER graph_community_write_guard BEFORE INSERT OR UPDATE OR DELETE ON analytics.graph_community
FOR EACH ROW EXECUTE FUNCTION analytics.guard_graph_artifact_write();
DROP TRIGGER IF EXISTS graph_community_member_write_guard ON analytics.graph_community_member;
CREATE TRIGGER graph_community_member_write_guard BEFORE INSERT OR UPDATE OR DELETE ON analytics.graph_community_member
FOR EACH ROW EXECUTE FUNCTION analytics.guard_graph_artifact_write();

-- Capability-role grants for objects created after migration 013. Grants on
-- "ALL TABLES" in an older migration do not automatically cover future
-- objects unless matching default privileges exist for the migration owner.
GRANT USAGE ON SCHEMA analytics TO si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  analytics.graph_snapshot,
  analytics.graph_snapshot_edge,
  analytics.graph_snapshot_degree,
  analytics.impact_path_v2,
  analytics.impact_path_step,
  analytics.relation_measurement,
  analytics.graph_community,
  analytics.graph_community_member
TO si_analytics;
GRANT UPDATE (status, sealed_at) ON analytics.graph_snapshot TO si_analytics;
GRANT UPDATE (status, sealed_at) ON analytics.impact_path_v2 TO si_analytics;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics;
GRANT SELECT ON
  analytics.graph_snapshot,
  analytics.graph_snapshot_edge,
  analytics.graph_snapshot_degree,
  analytics.impact_path_v2,
  analytics.impact_path_step,
  analytics.relation_measurement,
  analytics.graph_community,
  analytics.graph_community_member
TO si_publisher, si_readapi;
`;
