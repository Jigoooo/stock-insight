export const shadowExperimentLedgerMigrationSql = `
-- P5 — terminal shadow experiment artifacts only. These tables are an analytics
-- sandbox: no accepted-fact FK, no personalization action FK, and no order path.

CREATE TABLE IF NOT EXISTS analytics.shadow_experiment_run (
    shadow_experiment_run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_key                  UUID NOT NULL UNIQUE,
    experiment_kind          TEXT NOT NULL CHECK (experiment_kind IN (
      'eventrag','pathsim','nbfnet','hgt','tgn','pcmci','sequential_conformal',
      'contextual_bandit','decision_focused','offline_rl','remote_sensing'
    )),
    execution_mode           TEXT NOT NULL CHECK (execution_mode IN ('offline','shadow')),
    terminal_status          TEXT NOT NULL CHECK (terminal_status IN ('completed','abstained','failed')),
    graph_snapshot_id        BIGINT REFERENCES analytics.graph_snapshot(graph_snapshot_id),
    data_cutoff              TIMESTAMPTZ NOT NULL,
    known_at                 TIMESTAMPTZ NOT NULL,
    model_version            TEXT NOT NULL CHECK (length(btrim(model_version)) > 0),
    baseline_version         TEXT CHECK (baseline_version IS NULL OR length(btrim(baseline_version)) > 0),
    input_digest             TEXT NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
    model_artifact_digest    TEXT CHECK (model_artifact_digest IS NULL OR model_artifact_digest ~ '^[a-f0-9]{64}$'),
    configuration            JSONB NOT NULL DEFAULT '{}',
    candidate_only           BOOLEAN NOT NULL DEFAULT true CHECK (candidate_only = true),
    accepted_fact_allowed    BOOLEAN NOT NULL DEFAULT false CHECK (accepted_fact_allowed = false),
    order_executable         BOOLEAN NOT NULL DEFAULT false CHECK (order_executable = false),
    completed_at             TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (known_at >= data_cutoff),
    CHECK (completed_at >= known_at),
    CHECK (jsonb_typeof(configuration) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_shadow_experiment_run_kind_cutoff
  ON analytics.shadow_experiment_run (experiment_kind, data_cutoff DESC);

CREATE TABLE IF NOT EXISTS analytics.candidate_score (
    candidate_score_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shadow_experiment_run_id BIGINT NOT NULL REFERENCES analytics.shadow_experiment_run(shadow_experiment_run_id),
    candidate_kind           TEXT NOT NULL CHECK (candidate_kind IN ('event','entity','relation','content','facility','policy')),
    candidate_key            TEXT NOT NULL CHECK (length(btrim(candidate_key)) > 0),
    method_kind              TEXT NOT NULL CHECK (method_kind IN (
      'eventrag','pathsim','nbfnet','hgt','tgn','pcmci','sequential_conformal',
      'contextual_bandit','decision_focused','offline_rl','remote_sensing'
    )),
    event_revision_id        BIGINT REFERENCES world.event_revision(event_revision_id),
    target_entity_id         BIGINT REFERENCES core.entity(entity_id),
    score                    NUMERIC NOT NULL CHECK (score >= 0 AND score <= 1),
    rank                     INTEGER NOT NULL CHECK (rank >= 1),
    lineage                  JSONB NOT NULL,
    explanation              JSONB NOT NULL DEFAULT '{}',
    known_at                 TIMESTAMPTZ NOT NULL,
    candidate_only           BOOLEAN NOT NULL DEFAULT true CHECK (candidate_only = true),
    accepted_fact_allowed    BOOLEAN NOT NULL DEFAULT false CHECK (accepted_fact_allowed = false),
    order_executable         BOOLEAN NOT NULL DEFAULT false CHECK (order_executable = false),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(lineage) = 'object'),
    CHECK (jsonb_typeof(explanation) = 'object'),
    UNIQUE (shadow_experiment_run_id, candidate_kind, candidate_key)
);
CREATE INDEX IF NOT EXISTS ix_candidate_score_run_rank
  ON analytics.candidate_score (shadow_experiment_run_id, rank);

CREATE TABLE IF NOT EXISTS analytics.shadow_metric (
    shadow_metric_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shadow_experiment_run_id BIGINT NOT NULL REFERENCES analytics.shadow_experiment_run(shadow_experiment_run_id),
    metric_key               TEXT NOT NULL CHECK (length(btrim(metric_key)) > 0),
    metric_value             NUMERIC,
    numerator_count          BIGINT CHECK (numerator_count IS NULL OR numerator_count >= 0),
    denominator_count        BIGINT CHECK (denominator_count IS NULL OR denominator_count >= 0),
    confidence_lower         NUMERIC,
    confidence_upper         NUMERIC,
    gate_passed              BOOLEAN,
    detail                   JSONB NOT NULL DEFAULT '{}',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (denominator_count IS NULL OR numerator_count IS NULL OR numerator_count <= denominator_count),
    CHECK (confidence_upper IS NULL OR confidence_lower IS NULL OR confidence_upper >= confidence_lower),
    CHECK (jsonb_typeof(detail) = 'object'),
    UNIQUE (shadow_experiment_run_id, metric_key)
);

CREATE OR REPLACE FUNCTION analytics.reject_shadow_artifact_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

DROP TRIGGER IF EXISTS shadow_experiment_run_append_only ON analytics.shadow_experiment_run;
CREATE TRIGGER shadow_experiment_run_append_only
BEFORE UPDATE OR DELETE ON analytics.shadow_experiment_run
FOR EACH ROW EXECUTE FUNCTION analytics.reject_shadow_artifact_mutation();

DROP TRIGGER IF EXISTS candidate_score_append_only ON analytics.candidate_score;
CREATE TRIGGER candidate_score_append_only
BEFORE UPDATE OR DELETE ON analytics.candidate_score
FOR EACH ROW EXECUTE FUNCTION analytics.reject_shadow_artifact_mutation();

DROP TRIGGER IF EXISTS shadow_metric_append_only ON analytics.shadow_metric;
CREATE TRIGGER shadow_metric_append_only
BEFORE UPDATE OR DELETE ON analytics.shadow_metric
FOR EACH ROW EXECUTE FUNCTION analytics.reject_shadow_artifact_mutation();

GRANT SELECT, INSERT ON
  analytics.shadow_experiment_run,
  analytics.candidate_score,
  analytics.shadow_metric
TO si_analytics;
GRANT SELECT ON
  analytics.shadow_experiment_run,
  analytics.candidate_score,
  analytics.shadow_metric
TO si_knowledge, si_publisher, si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics;
`;
