export const k4MarketIntelligenceLedgerMigrationSql = `
-- K4 Task 1: append-only market-intelligence ledgers and fail-closed exposure
-- sealing. Accepted evaluations are assembled with their exposure in one
-- transaction: a deferred constraint confirms the referenced exposure is sealed
-- at commit, while the exposure guard requires that accepted basis before seal.

CREATE TABLE IF NOT EXISTS analytics.expectation_revision (
    expectation_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expectation_key TEXT NOT NULL CHECK (length(btrim(expectation_key)) > 0),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    target_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    metric_definition_id BIGINT REFERENCES governance.metric_definition(metric_definition_id),
    expectation_kind TEXT NOT NULL CHECK (expectation_kind IN (
      'analyst_consensus', 'company_guidance', 'market_implied',
      'prior_model', 'policy', 'scheduled_catalyst'
    )),
    as_of_at TIMESTAMPTZ NOT NULL,
    horizon TEXT NOT NULL CHECK (length(btrim(horizon)) > 0),
    target_period_start DATE,
    target_period_end DATE,
    expected_value NUMERIC,
    expected_unit TEXT CHECK (expected_unit IS NULL OR length(btrim(expected_unit)) > 0),
    distribution JSONB NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(distribution) = 'object'),
    dispersion NUMERIC CHECK (dispersion IS NULL OR dispersion >= 0),
    source_revision_id BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    information_set_id TEXT NOT NULL
      REFERENCES governance.analysis_information_set(information_set_id),
    derivation_id BIGINT NOT NULL REFERENCES knowledge.derivation(derivation_id),
    available_at TIMESTAMPTZ NOT NULL,
    known_at TIMESTAMPTZ NOT NULL,
    supersedes_expectation_revision_id BIGINT
      REFERENCES analytics.expectation_revision(expectation_revision_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (expectation_key, revision_no),
    CHECK (target_period_end IS NULL OR target_period_start IS NULL
           OR target_period_end >= target_period_start),
    CHECK (known_at >= available_at),
    CHECK (
      (revision_no = 1 AND supersedes_expectation_revision_id IS NULL)
      OR (revision_no > 1 AND supersedes_expectation_revision_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS analytics.surprise_revision (
    surprise_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    surprise_key TEXT NOT NULL CHECK (length(btrim(surprise_key)) > 0),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    expectation_revision_id BIGINT NOT NULL
      REFERENCES analytics.expectation_revision(expectation_revision_id),
    actual_numeric_fact_id BIGINT NOT NULL REFERENCES world.numeric_fact(numeric_fact_id),
    raw_surprise NUMERIC NOT NULL,
    standardized_surprise NUMERIC,
    historical_percentile NUMERIC
      CHECK (historical_percentile IS NULL OR historical_percentile BETWEEN 0 AND 1),
    expectation_dispersion NUMERIC
      CHECK (expectation_dispersion IS NULL OR expectation_dispersion >= 0),
    direction TEXT NOT NULL CHECK (direction IN ('positive','negative','neutral')),
    materiality NUMERIC NOT NULL CHECK (materiality BETWEEN 0 AND 1),
    unit TEXT NOT NULL CHECK (length(btrim(unit)) > 0),
    information_set_id TEXT NOT NULL
      REFERENCES governance.analysis_information_set(information_set_id),
    derivation_id BIGINT NOT NULL REFERENCES knowledge.derivation(derivation_id),
    supersedes_surprise_revision_id BIGINT
      REFERENCES analytics.surprise_revision(surprise_revision_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (surprise_key, revision_no),
    CHECK (
      (revision_no = 1 AND supersedes_surprise_revision_id IS NULL)
      OR (revision_no > 1 AND supersedes_surprise_revision_id IS NOT NULL)
    )
);

-- Reverse and method-based valuations are estimates, never facts. K4 stores a
-- range only; there is deliberately no point_estimate column.
CREATE TABLE IF NOT EXISTS analytics.valuation_estimate_revision (
    valuation_estimate_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    valuation_estimate_key TEXT NOT NULL CHECK (length(btrim(valuation_estimate_key)) > 0),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    method_key TEXT NOT NULL CHECK (length(btrim(method_key)) > 0),
    lower_estimate NUMERIC NOT NULL,
    upper_estimate NUMERIC NOT NULL,
    estimate_unit TEXT NOT NULL CHECK (length(btrim(estimate_unit)) > 0),
    as_of_at TIMESTAMPTZ NOT NULL,
    horizon TEXT NOT NULL CHECK (length(btrim(horizon)) > 0),
    information_set_id TEXT NOT NULL
      REFERENCES governance.analysis_information_set(information_set_id),
    derivation_id BIGINT NOT NULL REFERENCES knowledge.derivation(derivation_id),
    supersedes_valuation_estimate_revision_id BIGINT
      REFERENCES analytics.valuation_estimate_revision(valuation_estimate_revision_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (valuation_estimate_key, revision_no),
    CHECK (upper_estimate >= lower_estimate),
    CHECK (
      (revision_no = 1 AND supersedes_valuation_estimate_revision_id IS NULL)
      OR (revision_no > 1 AND supersedes_valuation_estimate_revision_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS analytics.impact_evaluation_revision (
    impact_evaluation_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    evaluation_key TEXT NOT NULL CHECK (length(btrim(evaluation_key)) > 0),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    issuer_entity_id BIGINT REFERENCES core.entity(entity_id),
    security_issuer_identity_id BIGINT
      REFERENCES core.security_issuer_identity(security_issuer_identity_id),
    sector_playbook_id BIGINT REFERENCES governance.sector_playbook(sector_playbook_id),
    business_driver_id BIGINT REFERENCES governance.business_driver(business_driver_id),
    business_driver_measurement_rule_id BIGINT
      REFERENCES governance.business_driver_measurement_rule(business_driver_measurement_rule_id),
    information_set_id TEXT NOT NULL
      REFERENCES governance.analysis_information_set(information_set_id),
    derivation_id BIGINT REFERENCES knowledge.derivation(derivation_id),
    evaluation_disposition TEXT NOT NULL CHECK (evaluation_disposition IN (
      'accepted', 'missing_identity', 'no_pit_evidence', 'unsupported_measurement',
      'ambiguous_driver_attribution', 'no_recent_observation'
    )),
    reason_detail TEXT,
    measurement_value NUMERIC,
    measurement_unit TEXT CHECK (measurement_unit IS NULL OR length(btrim(measurement_unit)) > 0),
    measurement_currency TEXT
      CHECK (measurement_currency IS NULL OR measurement_currency ~ '^[A-Z]{3}$'),
    direction TEXT CHECK (direction IS NULL OR direction IN ('positive','negative','ambiguous')),
    materiality NUMERIC CHECK (materiality IS NULL OR materiality BETWEEN 0 AND 1),
    impact_exposure_revision_id BIGINT
      REFERENCES analytics.impact_exposure_revision(impact_exposure_revision_id),
    supersedes_impact_evaluation_revision_id BIGINT
      REFERENCES analytics.impact_evaluation_revision(impact_evaluation_revision_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evaluation_key, revision_no),
    CONSTRAINT impact_evaluation_acceptance_shape CHECK (
      (
        evaluation_disposition = 'accepted'
        AND impact_exposure_revision_id IS NOT NULL
        AND issuer_entity_id IS NOT NULL
        AND security_issuer_identity_id IS NOT NULL
        AND sector_playbook_id IS NOT NULL
        AND business_driver_id IS NOT NULL
        AND business_driver_measurement_rule_id IS NOT NULL
        AND derivation_id IS NOT NULL
        AND measurement_value IS NOT NULL
        AND measurement_unit IS NOT NULL
        AND direction IS NOT NULL
        AND materiality IS NOT NULL
      ) OR (
        evaluation_disposition <> 'accepted'
        AND impact_exposure_revision_id IS NULL
        AND reason_detail IS NOT NULL
        AND length(btrim(reason_detail)) > 0
      )
    ),
    CHECK ((measurement_unit = 'currency') = (measurement_currency IS NOT NULL)),
    CHECK (
      (revision_no = 1 AND supersedes_impact_evaluation_revision_id IS NULL)
      OR (revision_no > 1 AND supersedes_impact_evaluation_revision_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accepted_evaluation_exposure
  ON analytics.impact_evaluation_revision (impact_exposure_revision_id)
  WHERE impact_exposure_revision_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS analytics.impact_evaluation_evidence (
    impact_evaluation_evidence_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    impact_evaluation_revision_id BIGINT NOT NULL
      REFERENCES analytics.impact_evaluation_revision(impact_evaluation_revision_id),
    numeric_fact_id BIGINT NOT NULL REFERENCES world.numeric_fact(numeric_fact_id),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    source_pit_quality_id BIGINT NOT NULL
      REFERENCES governance.source_pit_quality(source_pit_quality_id),
    input_role TEXT NOT NULL CHECK (input_role IN ('current','comparison','corroboration')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (impact_evaluation_revision_id, numeric_fact_id, input_role)
);

CREATE TABLE IF NOT EXISTS analytics.impact_path_step_exposure_citation (
    impact_path_step_exposure_citation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    impact_path_step_id BIGINT NOT NULL
      REFERENCES analytics.impact_path_step(impact_path_step_id),
    impact_exposure_revision_id BIGINT NOT NULL
      REFERENCES analytics.impact_exposure_revision(impact_exposure_revision_id),
    citation_role TEXT NOT NULL DEFAULT 'economic_basis'
      CHECK (citation_role IN ('economic_basis','corroboration')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (impact_path_step_id, impact_exposure_revision_id, citation_role)
);

CREATE TABLE IF NOT EXISTS analytics.impact_outcome_revision (
    impact_outcome_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    outcome_key TEXT NOT NULL CHECK (length(btrim(outcome_key)) > 0),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    impact_exposure_revision_id BIGINT NOT NULL
      REFERENCES analytics.impact_exposure_revision(impact_exposure_revision_id),
    horizon_sessions INTEGER NOT NULL CHECK (horizon_sessions IN (1, 5, 20)),
    outcome_state TEXT NOT NULL CHECK (outcome_state IN ('pending','evaluated')),
    anchor_session_date DATE NOT NULL,
    outcome_session_date DATE,
    security_return NUMERIC,
    benchmark_return NUMERIC,
    abnormal_return NUMERIC,
    market_data_known_at TIMESTAMPTZ,
    supersedes_impact_outcome_revision_id BIGINT
      REFERENCES analytics.impact_outcome_revision(impact_outcome_revision_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (outcome_key, revision_no),
    CONSTRAINT impact_outcome_state_shape CHECK (
      (
        outcome_state = 'pending'
        AND outcome_session_date IS NULL
        AND security_return IS NULL
        AND benchmark_return IS NULL
        AND abnormal_return IS NULL
        AND market_data_known_at IS NULL
      ) OR (
        outcome_state = 'evaluated'
        AND outcome_session_date IS NOT NULL
        AND security_return IS NOT NULL
        AND benchmark_return IS NOT NULL
        AND abnormal_return IS NOT NULL
        AND market_data_known_at IS NOT NULL
      )
    ),
    CHECK (
      (revision_no = 1 AND supersedes_impact_outcome_revision_id IS NULL)
      OR (revision_no > 1 AND supersedes_impact_outcome_revision_id IS NOT NULL)
    )
);

CREATE OR REPLACE FUNCTION analytics.reject_k4_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $append_only$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$append_only$;

DROP TRIGGER IF EXISTS expectation_revision_append_only ON analytics.expectation_revision;
CREATE TRIGGER expectation_revision_append_only
  BEFORE UPDATE OR DELETE ON analytics.expectation_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();
DROP TRIGGER IF EXISTS surprise_revision_append_only ON analytics.surprise_revision;
CREATE TRIGGER surprise_revision_append_only
  BEFORE UPDATE OR DELETE ON analytics.surprise_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();
DROP TRIGGER IF EXISTS valuation_estimate_revision_append_only ON analytics.valuation_estimate_revision;
CREATE TRIGGER valuation_estimate_revision_append_only
  BEFORE UPDATE OR DELETE ON analytics.valuation_estimate_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();
DROP TRIGGER IF EXISTS impact_evaluation_revision_append_only ON analytics.impact_evaluation_revision;
CREATE TRIGGER impact_evaluation_revision_append_only
  BEFORE UPDATE OR DELETE ON analytics.impact_evaluation_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();
DROP TRIGGER IF EXISTS impact_evaluation_evidence_append_only ON analytics.impact_evaluation_evidence;
CREATE TRIGGER impact_evaluation_evidence_append_only
  BEFORE UPDATE OR DELETE ON analytics.impact_evaluation_evidence
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();
DROP TRIGGER IF EXISTS impact_path_step_exposure_citation_append_only
  ON analytics.impact_path_step_exposure_citation;
CREATE TRIGGER impact_path_step_exposure_citation_append_only
  BEFORE UPDATE OR DELETE ON analytics.impact_path_step_exposure_citation
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();
DROP TRIGGER IF EXISTS impact_outcome_revision_append_only ON analytics.impact_outcome_revision;
CREATE TRIGGER impact_outcome_revision_append_only
  BEFORE UPDATE OR DELETE ON analytics.impact_outcome_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();

-- Every versioned K4 ledger uses the same exact logical-key/revision invariant.
-- Table-specific trigger arguments keep the validator generic without dynamic
-- application code or duplicated PL/pgSQL branches.
CREATE OR REPLACE FUNCTION analytics.validate_k4_exact_revision_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $revision_guard$
DECLARE
  row_data JSONB := to_jsonb(NEW);
  new_key TEXT;
  prior_key TEXT;
  prior_revision INTEGER;
  supersedes_id BIGINT;
BEGIN
  IF NEW.revision_no > 1 THEN
    new_key := row_data ->> TG_ARGV[0];
    supersedes_id := (row_data ->> TG_ARGV[1])::BIGINT;
    EXECUTE format(
      'SELECT %I::text, revision_no FROM %I.%I WHERE %I = $1',
      TG_ARGV[0], TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[2]
    ) INTO prior_key, prior_revision USING supersedes_id;
    IF prior_key IS DISTINCT FROM new_key
       OR prior_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION '% supersession must cite the preceding revision of the same key',
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END
$revision_guard$;

DROP TRIGGER IF EXISTS expectation_revision_exact_revision_chain
  ON analytics.expectation_revision;
CREATE TRIGGER expectation_revision_exact_revision_chain
  BEFORE INSERT ON analytics.expectation_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.validate_k4_exact_revision_chain(
    'expectation_key', 'supersedes_expectation_revision_id', 'expectation_revision_id'
  );
DROP TRIGGER IF EXISTS surprise_revision_exact_revision_chain
  ON analytics.surprise_revision;
CREATE TRIGGER surprise_revision_exact_revision_chain
  BEFORE INSERT ON analytics.surprise_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.validate_k4_exact_revision_chain(
    'surprise_key', 'supersedes_surprise_revision_id', 'surprise_revision_id'
  );
DROP TRIGGER IF EXISTS valuation_estimate_revision_exact_revision_chain
  ON analytics.valuation_estimate_revision;
CREATE TRIGGER valuation_estimate_revision_exact_revision_chain
  BEFORE INSERT ON analytics.valuation_estimate_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.validate_k4_exact_revision_chain(
    'valuation_estimate_key', 'supersedes_valuation_estimate_revision_id',
    'valuation_estimate_revision_id'
  );
DROP TRIGGER IF EXISTS impact_evaluation_revision_exact_revision_chain
  ON analytics.impact_evaluation_revision;
CREATE TRIGGER impact_evaluation_revision_exact_revision_chain
  BEFORE INSERT ON analytics.impact_evaluation_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.validate_k4_exact_revision_chain(
    'evaluation_key', 'supersedes_impact_evaluation_revision_id',
    'impact_evaluation_revision_id'
  );
DROP TRIGGER IF EXISTS impact_outcome_revision_exact_revision_chain
  ON analytics.impact_outcome_revision;
CREATE TRIGGER impact_outcome_revision_exact_revision_chain
  BEFORE INSERT ON analytics.impact_outcome_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.validate_k4_exact_revision_chain(
    'outcome_key', 'supersedes_impact_outcome_revision_id', 'impact_outcome_revision_id'
  );

-- Accepted evidence may use only the current exact PIT A/B/C grade for the
-- source revision behind the cited numeric fact. D/E remains available on a
-- rejected evaluation as a diagnostic receipt, but can never support acceptance.
CREATE OR REPLACE FUNCTION analytics.guard_impact_evaluation_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $evidence_guard$
DECLARE
  disposition TEXT;
  exposure_state TEXT;
  fact_source_revision_id BIGINT;
  quality_source_id BIGINT;
  revision_source_id BIGINT;
  quality_class TEXT;
BEGIN
  SELECT evaluation.evaluation_disposition, exposure.exposure_state
    INTO disposition, exposure_state
    FROM analytics.impact_evaluation_revision evaluation
    LEFT JOIN analytics.impact_exposure_revision exposure
      ON exposure.impact_exposure_revision_id = evaluation.impact_exposure_revision_id
   WHERE evaluation.impact_evaluation_revision_id = NEW.impact_evaluation_revision_id;

  IF disposition = 'accepted' AND exposure_state = 'sealed' THEN
    RAISE EXCEPTION 'cannot append evidence after the accepted exposure is sealed';
  END IF;

  SELECT source_revision_id INTO fact_source_revision_id
    FROM world.numeric_fact WHERE numeric_fact_id = NEW.numeric_fact_id;
  SELECT quality.source_id, quality.pit_quality_class
    INTO quality_source_id, quality_class
    FROM governance.source_pit_quality quality
   WHERE quality.source_pit_quality_id = NEW.source_pit_quality_id;
  SELECT identity.source_id INTO revision_source_id
    FROM ingestion.source_revision revision
    JOIN ingestion.source_record_identity identity
      ON identity.source_record_identity_id = revision.source_record_identity_id
   WHERE revision.source_revision_id = NEW.source_revision_id;

  IF fact_source_revision_id IS DISTINCT FROM NEW.source_revision_id
     OR quality_source_id IS DISTINCT FROM revision_source_id THEN
    RAISE EXCEPTION 'evaluation evidence citations do not resolve to one exact source revision';
  END IF;
  IF disposition = 'accepted' AND quality_class NOT IN (
    'PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'
  ) THEN
    RAISE EXCEPTION 'accepted evaluation evidence rejects PIT D/E class %', quality_class;
  END IF;
  RETURN NEW;
END
$evidence_guard$;

DROP TRIGGER IF EXISTS impact_evaluation_evidence_guard
  ON analytics.impact_evaluation_evidence;
CREATE TRIGGER impact_evaluation_evidence_guard
  BEFORE INSERT ON analytics.impact_evaluation_evidence
  FOR EACH ROW EXECUTE FUNCTION analytics.guard_impact_evaluation_evidence();

CREATE OR REPLACE FUNCTION analytics.guard_path_step_exposure_citation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $citation_guard$
DECLARE
  exposure_state TEXT;
  exposure_entity_id BIGINT;
  step_entity_id BIGINT;
BEGIN
  SELECT state.exposure_state, state.entity_id
    INTO exposure_state, exposure_entity_id
    FROM analytics.impact_exposure_revision state
   WHERE state.impact_exposure_revision_id = NEW.impact_exposure_revision_id;
  SELECT step.to_entity_id INTO step_entity_id
    FROM analytics.impact_path_step step
   WHERE step.impact_path_step_id = NEW.impact_path_step_id;
  IF exposure_state IS DISTINCT FROM 'sealed'
     OR exposure_entity_id IS DISTINCT FROM step_entity_id THEN
    RAISE EXCEPTION 'path-step citation requires a sealed exposure for the step target';
  END IF;
  RETURN NEW;
END
$citation_guard$;

DROP TRIGGER IF EXISTS impact_path_step_exposure_citation_guard
  ON analytics.impact_path_step_exposure_citation;
CREATE TRIGGER impact_path_step_exposure_citation_guard
  BEFORE INSERT ON analytics.impact_path_step_exposure_citation
  FOR EACH ROW EXECUTE FUNCTION analytics.guard_path_step_exposure_citation();

-- An accepted evaluation can be inserted while its exposure is building, then
-- the exposure is sealed in the same transaction. This deferred constraint is
-- the commit-time half of that atomic protocol.
CREATE OR REPLACE FUNCTION analytics.validate_accepted_evaluation_sealed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $accepted_guard$
DECLARE
  current_state TEXT;
BEGIN
  IF NEW.evaluation_disposition = 'accepted' THEN
    SELECT exposure_state INTO current_state
      FROM analytics.impact_exposure_revision
     WHERE impact_exposure_revision_id = NEW.impact_exposure_revision_id;
    IF current_state IS DISTINCT FROM 'sealed' THEN
      RAISE EXCEPTION 'accepted evaluation must reference a sealed exposure';
    END IF;
  END IF;
  RETURN NULL;
END
$accepted_guard$;

DROP TRIGGER IF EXISTS impact_evaluation_acceptance_guard
  ON analytics.impact_evaluation_revision;
CREATE CONSTRAINT TRIGGER impact_evaluation_acceptance_guard
  AFTER INSERT ON analytics.impact_evaluation_revision
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION analytics.validate_accepted_evaluation_sealed();
-- The single K4 economic-evidence validation boundary. Exposure lifecycle code
-- delegates here; this function owns canonical governance resolution, executable
-- measurement semantics, derivation lineage, and PIT evidence admission.
CREATE OR REPLACE FUNCTION analytics.validate_k4_evaluation_basis(
  p_evaluation_id BIGINT,
  p_exposure_id BIGINT,
  p_exposure_unit TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $basis_guard$
DECLARE
  evaluation analytics.impact_evaluation_revision%ROWTYPE;
  information_set governance.analysis_information_set%ROWTYPE;
  rule governance.business_driver_measurement_rule%ROWTYPE;
  current_fact world.numeric_fact%ROWTYPE;
  comparison_fact world.numeric_fact%ROWTYPE;
  v_evidence_count INTEGER;
  v_current_count INTEGER;
  v_comparison_count INTEGER;
BEGIN
  SELECT candidate.* INTO evaluation
    FROM analytics.impact_evaluation_revision candidate
    JOIN analytics.impact_exposure_revision exposure
      ON exposure.impact_exposure_revision_id = p_exposure_id
     AND exposure.entity_id = candidate.security_entity_id
   WHERE candidate.impact_evaluation_revision_id = p_evaluation_id
     AND candidate.impact_exposure_revision_id = p_exposure_id
     AND candidate.evaluation_disposition = 'accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accepted evaluation does not resolve to the exposure security';
  END IF;

  SELECT * INTO information_set
    FROM governance.analysis_information_set
   WHERE information_set_id = evaluation.information_set_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accepted evaluation has no analysis information set';
  END IF;
  SELECT * INTO rule
    FROM governance.business_driver_measurement_rule
   WHERE business_driver_measurement_rule_id =
         evaluation.business_driver_measurement_rule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accepted evaluation has no executable measurement rule';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM governance.sector_playbook playbook
      JOIN governance.playbook_assignment assignment
        ON assignment.sector_playbook_id = evaluation.sector_playbook_id
       AND assignment.entity_id = evaluation.issuer_entity_id
       AND assignment.valid_from <= information_set.valid_cutoff
       AND (assignment.valid_to IS NULL
            OR assignment.valid_to > information_set.valid_cutoff)
       AND assignment.known_at <= information_set.system_known_cutoff
       AND (assignment.security_issuer_identity_id IS NULL
            OR assignment.security_issuer_identity_id =
               evaluation.security_issuer_identity_id)
      JOIN governance.business_driver driver
        ON driver.sector_playbook_id = playbook.sector_playbook_id
       AND driver.business_driver_id = evaluation.business_driver_id
      JOIN governance.business_driver_measurement_rule measurement_rule
        ON measurement_rule.business_driver_id = driver.business_driver_id
       AND measurement_rule.business_driver_measurement_rule_id =
           evaluation.business_driver_measurement_rule_id
      JOIN core.security_issuer_identity identity
        ON identity.security_issuer_identity_id = evaluation.security_issuer_identity_id
       AND identity.security_entity_id = evaluation.security_entity_id
       AND identity.issuer_entity_id = evaluation.issuer_entity_id
      JOIN knowledge.derivation derivation
        ON derivation.derivation_id = evaluation.derivation_id
       AND derivation.status = 'sealed'
     WHERE playbook.sector_playbook_id = evaluation.sector_playbook_id
       AND playbook.playbook_state = 'active'
       AND playbook.effective_from <= information_set.valid_cutoff
       AND (playbook.effective_to IS NULL
            OR playbook.effective_to > information_set.valid_cutoff)
       AND playbook.known_at <= information_set.system_known_cutoff
       AND measurement_rule.effective_from <= information_set.valid_cutoff
       AND (measurement_rule.effective_to IS NULL
            OR measurement_rule.effective_to > information_set.valid_cutoff)
       AND measurement_rule.known_at <= information_set.system_known_cutoff
       AND identity.valid_from <= information_set.valid_cutoff
       AND identity.known_from <= information_set.system_known_cutoff
  ) THEN
    RAISE EXCEPTION 'accepted evaluation does not resolve through canonical governance at AIS cutoffs';
  END IF;

  SELECT count(DISTINCT evidence.numeric_fact_id),
         count(*) FILTER (WHERE evidence.input_role = 'current'),
         count(*) FILTER (WHERE evidence.input_role = 'comparison')
    INTO v_evidence_count, v_current_count, v_comparison_count
    FROM analytics.impact_evaluation_evidence evidence
   WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id;
  IF v_evidence_count < rule.minimum_history_observations
     OR v_current_count <> 1
     OR v_comparison_count <> 1 THEN
    RAISE EXCEPTION 'accepted evaluation requires minimum history and one current/comparison pair';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM analytics.impact_evaluation_evidence evidence
      JOIN world.numeric_fact fact ON fact.numeric_fact_id = evidence.numeric_fact_id
      JOIN governance.source_pit_quality quality
        ON quality.source_pit_quality_id = evidence.source_pit_quality_id
      JOIN ingestion.source_revision revision
        ON revision.source_revision_id = evidence.source_revision_id
      JOIN ingestion.source_record_identity source_identity
        ON source_identity.source_record_identity_id = revision.source_record_identity_id
     WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id
       AND (
         fact.entity_id IS DISTINCT FROM evaluation.issuer_entity_id
         OR NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(rule.input_concept_selectors) selector
            WHERE selector ->> 'concept_namespace' = fact.concept_namespace
              AND selector -> 'concept_keys' ? fact.concept_key
         )
         OR NOT EXISTS (
           SELECT 1
             FROM knowledge.derivation_step step
             JOIN knowledge.derivation_input input
               ON input.derivation_step_id = step.derivation_step_id
              AND input.input_kind = 'numeric_fact'
              AND input.numeric_fact_id = fact.numeric_fact_id
            WHERE step.derivation_id = evaluation.derivation_id
         )
         OR fact.source_revision_id IS DISTINCT FROM evidence.source_revision_id
         OR quality.source_id IS DISTINCT FROM source_identity.source_id
         OR quality.pit_quality_class NOT IN (
           'PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'
         )
         OR NOT (quality.pit_quality_class = ANY(rule.allowed_pit_classes))
         OR quality.known_at > information_set.system_known_cutoff
         OR fact.unit IS DISTINCT FROM evaluation.measurement_unit
         OR fact.currency IS DISTINCT FROM evaluation.measurement_currency
         OR fact.available_at > information_set.source_available_cutoff
         OR fact.known_at > information_set.system_known_cutoff
       )
  ) THEN
    RAISE EXCEPTION 'accepted evidence fails issuer, selector, derivation, PIT, unit, or AIS policy';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM knowledge.derivation_step step
      JOIN knowledge.derivation_input input
        ON input.derivation_step_id = step.derivation_step_id
       AND input.input_kind = 'numeric_fact'
     WHERE step.derivation_id = evaluation.derivation_id
       AND NOT EXISTS (
         SELECT 1
           FROM analytics.impact_evaluation_evidence evidence
          WHERE evidence.impact_evaluation_revision_id =
                evaluation.impact_evaluation_revision_id
            AND evidence.numeric_fact_id = input.numeric_fact_id
       )
  ) THEN
    RAISE EXCEPTION 'accepted evidence must exactly cover derivation numeric-fact inputs';
  END IF;

  SELECT fact.* INTO current_fact
    FROM analytics.impact_evaluation_evidence evidence
    JOIN world.numeric_fact fact ON fact.numeric_fact_id = evidence.numeric_fact_id
   WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id
     AND evidence.input_role = 'current';
  SELECT fact.* INTO comparison_fact
    FROM analytics.impact_evaluation_evidence evidence
    JOIN world.numeric_fact fact ON fact.numeric_fact_id = evidence.numeric_fact_id
   WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id
     AND evidence.input_role = 'comparison';

  IF current_fact.concept_namespace IS DISTINCT FROM comparison_fact.concept_namespace
     OR current_fact.concept_key IS DISTINCT FROM comparison_fact.concept_key THEN
    RAISE EXCEPTION 'current and comparison evidence must measure the same concept';
  END IF;
  IF rule.comparison_method = 'period_end_year_over_year_delta' THEN
    IF current_fact.instant_at IS NULL
       OR comparison_fact.instant_at IS NULL
       OR current_fact.instant_at IS DISTINCT FROM comparison_fact.instant_at + interval '1 year' THEN
      RAISE EXCEPTION 'period-end YoY requires exactly one-year-separated instant facts';
    END IF;
  ELSIF rule.comparison_method = 'duration_year_over_year_delta' THEN
    IF current_fact.period_start IS NULL OR current_fact.period_end IS NULL
       OR comparison_fact.period_start IS NULL OR comparison_fact.period_end IS NULL
       OR current_fact.period_start IS DISTINCT FROM comparison_fact.period_start + interval '1 year'
       OR current_fact.period_end IS DISTINCT FROM comparison_fact.period_end + interval '1 year' THEN
      RAISE EXCEPTION 'duration YoY requires one-year-separated matching periods';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported executable comparison method %', rule.comparison_method;
  END IF;

  IF evaluation.measurement_value IS DISTINCT FROM current_fact.value - comparison_fact.value THEN
    RAISE EXCEPTION 'evaluation measurement does not equal the executable comparison result';
  END IF;
  IF rule.output_unit IS DISTINCT FROM evaluation.measurement_unit
     OR rule.output_currency IS DISTINCT FROM evaluation.measurement_currency
     OR p_exposure_unit IS DISTINCT FROM
        coalesce(evaluation.measurement_currency, evaluation.measurement_unit) THEN
    RAISE EXCEPTION 'exposure, evaluation, and rule unit/currency must match';
  END IF;
END
$basis_guard$;


-- Forward replacement for migration 037's trigger function. It retains every
-- original append-only/state rule and adds the exact K4 citation gate.
CREATE OR REPLACE FUNCTION analytics.guard_k4_impact_exposure_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $exposure_guard$
DECLARE
  v_prev_key TEXT;
  v_prev_revision INTEGER;
  v_component_count INTEGER;
  v_evaluation_count INTEGER;
  v_evaluation_id BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.impact_exposure_revision is append-only' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
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
    IF NEW.metadata ? 'collapsed_confidence'
       OR NEW.metadata ? 'confidence_weighted_magnitude' THEN
      RAISE EXCEPTION 'epistemic confidence must not be multiplied into economic magnitude';
    END IF;
    RETURN NEW;
  END IF;

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
    SELECT count(*), min(impact_evaluation_revision_id)
      INTO v_evaluation_count, v_evaluation_id
      FROM analytics.impact_evaluation_revision
     WHERE impact_exposure_revision_id = OLD.impact_exposure_revision_id
       AND evaluation_disposition = 'accepted';
    IF v_evaluation_count <> 1 THEN
      RAISE EXCEPTION 'exposure requires exactly one accepted evaluation basis before sealing';
    END IF;

    PERFORM analytics.validate_k4_evaluation_basis(
      v_evaluation_id,
      OLD.impact_exposure_revision_id,
      NEW.economic_magnitude_unit
    );

    SELECT count(DISTINCT component_kind) INTO v_component_count
      FROM analytics.impact_score_component
     WHERE impact_exposure_revision_id = OLD.impact_exposure_revision_id;
    IF v_component_count <> 8 THEN
      RAISE EXCEPTION 'exposure requires the full eight-component score decomposition before sealing (found %)',
        v_component_count;
    END IF;
    IF NEW.sealed_at IS NULL THEN
      RAISE EXCEPTION 'sealed exposure requires sealed_at';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.exposure_state = 'building' AND NEW.exposure_state = 'retracted' THEN
    RETURN NEW;
  END IF;
  IF OLD.exposure_state = 'sealed'
     AND NEW.exposure_state IN ('superseded','retracted')
     AND NEW.sealed_at IS NOT DISTINCT FROM OLD.sealed_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid impact exposure state transition % -> %',
    OLD.exposure_state, NEW.exposure_state;
END
$exposure_guard$;

DROP TRIGGER IF EXISTS impact_exposure_write_guard ON analytics.impact_exposure_revision;
CREATE TRIGGER impact_exposure_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON analytics.impact_exposure_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.guard_k4_impact_exposure_write();

-- Serving exposes only accepted evaluations whose exposure passed the complete
-- validation boundary, and only their admitted A/B/C evidence. Rejected and D/E
-- diagnostic receipts remain available solely to pipeline roles.
CREATE OR REPLACE VIEW analytics.accepted_impact_evaluation_v1 AS
SELECT evaluation.*
  FROM analytics.impact_evaluation_revision evaluation
  JOIN analytics.impact_exposure_revision exposure
    ON exposure.impact_exposure_revision_id = evaluation.impact_exposure_revision_id
 WHERE evaluation.evaluation_disposition = 'accepted'
   AND exposure.exposure_state = 'sealed';

CREATE OR REPLACE VIEW analytics.accepted_impact_evaluation_evidence_v1 AS
SELECT evidence.*
  FROM analytics.impact_evaluation_evidence evidence
  JOIN analytics.accepted_impact_evaluation_v1 evaluation
    ON evaluation.impact_evaluation_revision_id = evidence.impact_evaluation_revision_id
  JOIN governance.source_pit_quality quality
    ON quality.source_pit_quality_id = evidence.source_pit_quality_id
 WHERE quality.pit_quality_class IN (
   'PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'
 );

REVOKE SELECT ON
  analytics.impact_evaluation_revision,
  analytics.impact_evaluation_evidence
  FROM si_readapi;

GRANT SELECT, INSERT ON
  analytics.expectation_revision,
  analytics.surprise_revision,
  analytics.valuation_estimate_revision,
  analytics.impact_evaluation_revision,
  analytics.impact_evaluation_evidence,
  analytics.impact_path_step_exposure_citation,
  analytics.impact_outcome_revision
  TO si_analytics;
GRANT SELECT ON
  analytics.expectation_revision,
  analytics.surprise_revision,
  analytics.valuation_estimate_revision,
  analytics.impact_path_step_exposure_citation,
  analytics.impact_outcome_revision
  TO si_knowledge, si_publisher, si_readapi;
GRANT SELECT ON
  analytics.impact_evaluation_revision,
  analytics.impact_evaluation_evidence
  TO si_knowledge, si_publisher;
GRANT SELECT ON
  analytics.accepted_impact_evaluation_v1,
  analytics.accepted_impact_evaluation_evidence_v1
  TO si_readapi;
GRANT SELECT ON
  analytics.accepted_impact_evaluation_v1,
  analytics.accepted_impact_evaluation_evidence_v1
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics
  TO si_analytics, si_knowledge, si_publisher;
`;
