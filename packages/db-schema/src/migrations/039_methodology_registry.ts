export const methodologyRegistryMigrationSql = `
-- P2-WC — Causal / statistical methodology registry with conformal wrapper
-- (enhancement plan P2-5/P2-8, §12). Additive migration 039. Every estimate
-- stores its method, assumptions, diagnostics, CI, and a replayable program.
-- Hard rules: a discovery method (PCMCI) is candidate-only and can never claim
-- causal; a causal estimate requires stored assumptions and diagnostics; and a
-- statistical association is labelled distinctly from a causal estimate.

-- ── template: the standard method catalogue with its claim class ──────────────
CREATE TABLE IF NOT EXISTS analytics.methodology_template (
    methodology_template_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_key         TEXT NOT NULL UNIQUE,
    method_kind          TEXT NOT NULL CHECK (method_kind IN (
      'event_study','local_projection','scm','did','dml','iv','pcmci'
    )),
    claim_class          TEXT NOT NULL CHECK (claim_class IN ('statistical_association','causal_estimate')),
    ui_label             TEXT NOT NULL CHECK (length(btrim(ui_label)) > 0),
    default_is_candidate_only BOOLEAN NOT NULL DEFAULT false,
    description          TEXT,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(template_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object'),
    -- A discovery method (pcmci) must never be registered as a causal estimate.
    CHECK (method_kind <> 'pcmci' OR claim_class = 'statistical_association')
);

-- ── estimate: a produced number with method, CI, and a replayable program ─────
CREATE TABLE IF NOT EXISTS analytics.method_estimate (
    method_estimate_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estimate_key         TEXT NOT NULL UNIQUE,
    methodology_template_id BIGINT NOT NULL REFERENCES analytics.methodology_template(methodology_template_id),
    impact_exposure_revision_id BIGINT REFERENCES analytics.impact_exposure_revision(impact_exposure_revision_id),
    subject_entity_id    BIGINT REFERENCES core.entity(entity_id),
    point_estimate       NUMERIC,
    standard_error       NUMERIC CHECK (standard_error IS NULL OR standard_error >= 0),
    ci_lower             NUMERIC,
    ci_upper             NUMERIC,
    ci_level             NUMERIC CHECK (ci_level IS NULL OR (ci_level > 0 AND ci_level < 1)),
    claim_class          TEXT NOT NULL CHECK (claim_class IN ('statistical_association','causal_estimate')),
    is_candidate_only    BOOLEAN NOT NULL DEFAULT false,
    program_ref          JSONB NOT NULL,
    input_snapshot_ref   JSONB NOT NULL,
    evidence_locator     JSONB NOT NULL,
    available_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(estimate_key)) > 0),
    CHECK (jsonb_typeof(program_ref) = 'object'),
    CHECK (jsonb_typeof(input_snapshot_ref) = 'object'),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at),
    CHECK (ci_upper IS NULL OR ci_lower IS NULL OR ci_upper >= ci_lower)
);
CREATE INDEX IF NOT EXISTS ix_method_estimate_template
  ON analytics.method_estimate (methodology_template_id, claim_class);
CREATE INDEX IF NOT EXISTS ix_method_estimate_exposure
  ON analytics.method_estimate (impact_exposure_revision_id);

-- ── assumptions and diagnostics as separate evidenced rows ────────────────────
CREATE TABLE IF NOT EXISTS analytics.method_assumption (
    method_assumption_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    method_estimate_id   BIGINT NOT NULL REFERENCES analytics.method_estimate(method_estimate_id),
    assumption_kind      TEXT NOT NULL CHECK (length(btrim(assumption_kind)) > 0),
    statement            TEXT NOT NULL CHECK (length(btrim(statement)) > 0),
    holds                BOOLEAN,
    evidence_locator     JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (evidence_locator IS NULL OR jsonb_typeof(evidence_locator) = 'object'),
    UNIQUE (method_estimate_id, assumption_kind)
);
CREATE INDEX IF NOT EXISTS ix_method_assumption_estimate
  ON analytics.method_assumption (method_estimate_id);

CREATE TABLE IF NOT EXISTS analytics.method_diagnostic (
    method_diagnostic_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    method_estimate_id   BIGINT NOT NULL REFERENCES analytics.method_estimate(method_estimate_id),
    diagnostic_kind      TEXT NOT NULL CHECK (length(btrim(diagnostic_kind)) > 0),
    statistic            NUMERIC,
    passed               BOOLEAN,
    detail               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (method_estimate_id, diagnostic_kind)
);
CREATE INDEX IF NOT EXISTS ix_method_diagnostic_estimate
  ON analytics.method_diagnostic (method_estimate_id);

-- ── conformal prediction interval wrapper (P2-8) ──────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.conformal_interval (
    conformal_interval_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    method_estimate_id   BIGINT NOT NULL REFERENCES analytics.method_estimate(method_estimate_id),
    target_coverage      NUMERIC NOT NULL CHECK (target_coverage > 0 AND target_coverage < 1),
    interval_lower       NUMERIC,
    interval_upper       NUMERIC,
    calibration_ref      JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (interval_upper IS NULL OR interval_lower IS NULL OR interval_upper >= interval_lower),
    CHECK (calibration_ref IS NULL OR jsonb_typeof(calibration_ref) = 'object'),
    UNIQUE (method_estimate_id, target_coverage)
);
CREATE INDEX IF NOT EXISTS ix_conformal_interval_estimate
  ON analytics.conformal_interval (method_estimate_id);

-- ── guards ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.reject_method_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- Append-only estimate. A discovery method (pcmci) can only be candidate and can
-- never claim causal; a causal estimate requires at least one stored assumption
-- and one diagnostic. Because assumptions/diagnostics are child rows, the causal
-- requirement is enforced at INSERT time on a deferred check via metadata flag
-- 'assumptions_diagnostics_ready' OR is validated by requiring the estimate to
-- start as candidate and be promoted only after children exist.
CREATE OR REPLACE FUNCTION analytics.guard_method_estimate_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_template_kind TEXT;
  v_template_class TEXT;
  v_assumptions INTEGER;
  v_diagnostics INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.method_estimate is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT method_kind, claim_class INTO v_template_kind, v_template_class
  FROM analytics.methodology_template WHERE methodology_template_id = NEW.methodology_template_id;
  -- Discovery method (pcmci) estimates must be candidate-only and cannot be causal.
  IF v_template_kind = 'pcmci' THEN
    IF NEW.is_candidate_only IS DISTINCT FROM true OR NEW.claim_class <> 'statistical_association' THEN
      RAISE EXCEPTION 'discovery method estimates must be candidate-only and cannot claim causal (pcmci is candidate only)';
    END IF;
  END IF;
  -- The estimate claim_class may not exceed the template claim class.
  IF NEW.claim_class = 'causal_estimate' AND v_template_class <> 'causal_estimate' THEN
    RAISE EXCEPTION 'estimate cannot claim causal when its template is % (%)', v_template_class, v_template_kind;
  END IF;
  -- On promotion to a sealed causal estimate (UPDATE clearing candidate flag),
  -- require stored assumptions and diagnostics.
  IF TG_OP = 'UPDATE' AND NEW.claim_class = 'causal_estimate' AND NEW.is_candidate_only = false THEN
    SELECT count(*) INTO v_assumptions FROM analytics.method_assumption WHERE method_estimate_id = OLD.method_estimate_id;
    SELECT count(*) INTO v_diagnostics FROM analytics.method_diagnostic WHERE method_estimate_id = OLD.method_estimate_id;
    IF v_assumptions = 0 OR v_diagnostics = 0 THEN
      RAISE EXCEPTION 'causal estimate requires stored assumptions and diagnostics (assumptions %, diagnostics %)', v_assumptions, v_diagnostics;
    END IF;
  END IF;
  -- On direct INSERT of a non-candidate causal estimate, the same rule applies but
  -- children cannot exist yet; force such estimates to enter as candidate first.
  IF TG_OP = 'INSERT' AND NEW.claim_class = 'causal_estimate' AND NEW.is_candidate_only = false THEN
    RAISE EXCEPTION 'causal estimate requires stored assumptions and diagnostics before promotion; insert as candidate first';
  END IF;
  RETURN NEW;
END $$;

-- ── methodology template seed (§12 standard catalogue) ────────────────────────
INSERT INTO analytics.methodology_template (template_key, method_kind, claim_class, ui_label, default_is_candidate_only, description)
VALUES
  ('event_study_v1', 'event_study', 'statistical_association', '사건연구 기반 반응', false, 'Abnormal return around an event window'),
  ('local_projection_v1', 'local_projection', 'statistical_association', '국소투영 반응', false, 'Jorda local projections impulse response'),
  ('scm_v1', 'scm', 'causal_estimate', '합성통제 인과 추정', false, 'Synthetic control method'),
  ('did_v1', 'did', 'causal_estimate', '이중차분 인과 추정', false, 'Difference-in-differences'),
  ('dml_v1', 'dml', 'causal_estimate', '이중기계학습 인과 추정', false, 'Double machine learning'),
  ('iv_v1', 'iv', 'causal_estimate', '도구변수 인과 추정', false, 'Instrumental variables'),
  ('pcmci_v1', 'pcmci', 'statistical_association', '시계열 기반 영향 후보', true, 'PCMCI+ causal discovery — candidate only, never a causal claim')
ON CONFLICT (template_key) DO NOTHING;

DO $$
DECLARE v_bad BIGINT;
BEGIN
  -- P2-WC methodology template seed invariant: no pcmci template is causal.
  SELECT count(*) INTO v_bad FROM analytics.methodology_template WHERE method_kind = 'pcmci' AND claim_class = 'causal_estimate';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'P2-WC methodology template seed registered % causal pcmci templates', v_bad;
  END IF;
END $$;

-- ── install guards after seed ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS method_estimate_write_guard ON analytics.method_estimate;
CREATE TRIGGER method_estimate_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.method_estimate
FOR EACH ROW EXECUTE FUNCTION analytics.guard_method_estimate_write();

DROP TRIGGER IF EXISTS method_assumption_write_guard ON analytics.method_assumption;
CREATE TRIGGER method_assumption_write_guard
BEFORE UPDATE OR DELETE ON analytics.method_assumption
FOR EACH ROW EXECUTE FUNCTION analytics.reject_method_child_mutation();

DROP TRIGGER IF EXISTS conformal_interval_write_guard ON analytics.conformal_interval;
CREATE TRIGGER conformal_interval_write_guard
BEFORE UPDATE OR DELETE ON analytics.conformal_interval
FOR EACH ROW EXECUTE FUNCTION analytics.reject_method_child_mutation();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
GRANT USAGE ON SCHEMA analytics TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  analytics.methodology_template,
  analytics.method_estimate,
  analytics.method_assumption,
  analytics.method_diagnostic,
  analytics.conformal_interval
TO si_analytics;
GRANT UPDATE (is_candidate_only, claim_class) ON analytics.method_estimate TO si_analytics;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics, si_knowledge, si_publisher;

GRANT SELECT ON
  analytics.methodology_template,
  analytics.method_estimate,
  analytics.method_assumption,
  analytics.method_diagnostic,
  analytics.conformal_interval
TO si_knowledge, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;
    GRANT SELECT ON
      analytics.methodology_template,
      analytics.method_estimate,
      analytics.method_assumption,
      analytics.method_diagnostic,
      analytics.conformal_interval
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
