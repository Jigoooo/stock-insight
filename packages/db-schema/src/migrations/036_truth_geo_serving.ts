export const truthGeoServingMigrationSql = `
-- P1-W6 — Truth/geo serving and compatibility layer
-- (enhancement plan Task 8/9). Additive migration 036. Creates read-only
-- compatibility views over the canonical truth/world/geo ledgers plus a lineage
-- manifest of row counts. No canonical ledger is mutated; existing consumers
-- ignore these additive surfaces.

-- ── point-in-time truth assertions (accepted-tier only, both clocks exposed) ──
CREATE OR REPLACE VIEW serving.v_truth_assertion_pit_v1 AS
SELECT assertion.assertion_id,
       assertion.assertion_key,
       assertion.revision_no,
       assertion.subject_entity_id,
       assertion.predicate_key,
       assertion.object_entity_id,
       assertion.polarity,
       assertion.modality,
       assertion.verification_state,
       assertion.valid_time_start,
       assertion.valid_time_end,
       assertion.available_at,
       assertion.known_at
FROM knowledge.assertion assertion
WHERE assertion.verification_state IN ('accepted','verified_semantics','verified_span');

-- ── current world events (latest revision per event) ─────────────────────────
CREATE OR REPLACE VIEW serving.v_world_event_current_v1 AS
SELECT world_event.event_id,
       world_event.event_key,
       world_event.event_type,
       revision.event_revision_id,
       revision.revision_no,
       revision.lifecycle_state,
       revision.summary_text,
       revision.available_at,
       revision.known_at,
       revision.valid_from
FROM world.event world_event
JOIN LATERAL (
  SELECT r.*
  FROM world.event_revision r
  WHERE r.event_id = world_event.event_id
  ORDER BY r.revision_no DESC
  LIMIT 1
) revision ON true;

-- ── geo exposure (evidenced; ratio only ever alongside its denominator) ──────
CREATE OR REPLACE VIEW serving.v_geo_entity_exposure_v1 AS
SELECT exposure.geo_entity_exposure_revision_id,
       exposure.exposure_key,
       exposure.revision_no,
       exposure.entity_id,
       exposure.geo_entity_id,
       exposure.exposure_kind,
       exposure.numerator,
       exposure.denominator,
       exposure.ratio,
       exposure.unit,
       exposure.currency,
       exposure.period_start,
       exposure.period_end,
       exposure.derivation_priority,
       exposure.available_at,
       exposure.known_at
FROM geo.entity_exposure_revision exposure;

-- ── current point-in-time universe membership ────────────────────────────────
CREATE OR REPLACE VIEW serving.v_pit_universe_current_v1 AS
SELECT membership.pit_universe_membership_id,
       membership.universe_key,
       membership.security_master_id,
       membership.as_of,
       membership.known_at,
       membership.membership_status,
       membership.vintage_label
FROM analytics.pit_universe_membership membership;

-- ── lineage manifest: canonical row counts captured at migration time ────────
CREATE TABLE IF NOT EXISTS serving.truth_geo_serving_manifest (
    truth_geo_serving_manifest_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    manifest_run_key     TEXT NOT NULL,
    surface_name         TEXT NOT NULL CHECK (length(btrim(surface_name)) > 0),
    row_count            BIGINT NOT NULL CHECK (row_count >= 0),
    captured_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata             JSONB NOT NULL DEFAULT '{}',
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (manifest_run_key, surface_name)
);

INSERT INTO serving.truth_geo_serving_manifest (manifest_run_key, surface_name, row_count)
SELECT 'migration-036', surface.name, surface.count
FROM (
  SELECT 'knowledge.assertion' AS name, (SELECT count(*) FROM knowledge.assertion) AS count
  UNION ALL SELECT 'world.event', (SELECT count(*) FROM world.event)
  UNION ALL SELECT 'world.event_revision', (SELECT count(*) FROM world.event_revision)
  UNION ALL SELECT 'geo.entity', (SELECT count(*) FROM geo.entity)
  UNION ALL SELECT 'geo.entity_exposure_revision', (SELECT count(*) FROM geo.entity_exposure_revision)
  UNION ALL SELECT 'core.security_master', (SELECT count(*) FROM core.security_master)
  UNION ALL SELECT 'analytics.pit_universe_membership', (SELECT count(*) FROM analytics.pit_universe_membership)
  UNION ALL SELECT 'knowledge.ontology_revision', (SELECT count(*) FROM knowledge.ontology_revision)
) surface
ON CONFLICT (manifest_run_key, surface_name) DO NOTHING;

-- ── read-only grants for serving surfaces ────────────────────────────────────
GRANT USAGE ON SCHEMA serving TO si_readapi, si_analytics, si_publisher;
GRANT SELECT ON
  serving.v_truth_assertion_pit_v1,
  serving.v_world_event_current_v1,
  serving.v_geo_entity_exposure_v1,
  serving.v_pit_universe_current_v1,
  serving.truth_geo_serving_manifest
TO si_readapi, si_analytics, si_publisher;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA serving TO stock_insight_app_reader;
    GRANT SELECT ON
      serving.v_truth_assertion_pit_v1,
      serving.v_world_event_current_v1,
      serving.v_geo_entity_exposure_v1,
      serving.v_pit_universe_current_v1,
      serving.truth_geo_serving_manifest
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
