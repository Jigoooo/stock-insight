export const issuerPlaybookMeasurementRuleMigrationSql = `
-- K4 Task 1: issuer-canonical playbook resolution and executable driver rules.
-- Migration 087 intentionally accepted any core entity as an assignment subject.
-- K4 evaluates securities but models company economics, so this forward migration
-- preserves closed security history and makes the issuer Company the only new
-- assignment subject. The exact temporal identity row remains citable.

ALTER TABLE governance.playbook_assignment
  ADD COLUMN IF NOT EXISTS security_issuer_identity_id BIGINT
    REFERENCES core.security_issuer_identity(security_issuer_identity_id);

CREATE INDEX IF NOT EXISTS ix_playbook_assignment_identity
  ON governance.playbook_assignment (security_issuer_identity_id)
  WHERE security_issuer_identity_id IS NOT NULL;

-- Migrate only open semiconductor Stock assignments with an exact identity.
-- Any unresolved row aborts: canonicalization never guesses or silently skips.
DO $migration$
DECLARE
  candidate RECORD;
  transition_at TIMESTAMPTZ;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM governance.playbook_assignment assignment
      JOIN governance.sector_playbook playbook
        ON playbook.sector_playbook_id = assignment.sector_playbook_id
       AND playbook.playbook_key = 'semiconductor'
      JOIN core.entity subject ON subject.entity_id = assignment.entity_id
       AND subject.entity_type = 'Stock'
     WHERE assignment.valid_to IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM core.security_issuer_identity identity
          WHERE identity.security_entity_id = assignment.entity_id
       )
  ) THEN
    RAISE EXCEPTION 'migration 088 cannot resolve open security playbook assignment';
  END IF;

  FOR candidate IN
    SELECT assignment.*, identity.security_issuer_identity_id AS exact_identity_id,
           identity.issuer_entity_id, identity.valid_from AS identity_valid_from,
           identity.known_from AS identity_known_from
      FROM governance.playbook_assignment assignment
      JOIN governance.sector_playbook playbook
        ON playbook.sector_playbook_id = assignment.sector_playbook_id
       AND playbook.playbook_key = 'semiconductor'
      JOIN core.entity subject ON subject.entity_id = assignment.entity_id
       AND subject.entity_type = 'Stock'
      JOIN core.security_issuer_identity identity
        ON identity.security_entity_id = assignment.entity_id
     WHERE assignment.valid_to IS NULL
  LOOP
    transition_at := greatest(
      statement_timestamp(),
      candidate.valid_from + interval '1 microsecond',
      candidate.identity_valid_from
    );

    IF NOT EXISTS (
      SELECT 1
        FROM governance.playbook_assignment issuer_assignment
       WHERE issuer_assignment.sector_playbook_id = candidate.sector_playbook_id
         AND issuer_assignment.entity_id = candidate.issuer_entity_id
         AND issuer_assignment.valid_to IS NULL
    ) THEN
      INSERT INTO governance.playbook_assignment (
        sector_playbook_id, entity_id, security_issuer_identity_id,
        assignment_basis, taxonomy_node_id, rationale,
        valid_from, known_at, assigned_by, metadata
      ) VALUES (
        candidate.sector_playbook_id, candidate.issuer_entity_id,
        candidate.exact_identity_id,
        candidate.assignment_basis, candidate.taxonomy_node_id,
        candidate.rationale,
        transition_at,
        greatest(statement_timestamp(), candidate.known_at, candidate.identity_known_from),
        'migration-088',
        candidate.metadata || jsonb_build_object(
          'migrated_from_playbook_assignment_id', candidate.playbook_assignment_id,
          'canonical_subject', 'issuer_company'
        )
      )
      ON CONFLICT (sector_playbook_id, entity_id, valid_from) DO NOTHING;
    END IF;

    UPDATE governance.playbook_assignment
       SET valid_to = transition_at,
           metadata = metadata || jsonb_build_object(
             'closed_by', 'migration-088',
             'canonical_successor_entity_id', candidate.issuer_entity_id,
             'security_issuer_identity_id', candidate.exact_identity_id
           )
     WHERE playbook_assignment_id = candidate.playbook_assignment_id
       AND valid_to IS NULL;
  END LOOP;
END
$migration$;

CREATE OR REPLACE FUNCTION governance.validate_playbook_assignment_issuer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
DECLARE
  subject_type TEXT;
  identity_row core.security_issuer_identity%ROWTYPE;
BEGIN
  SELECT entity_type INTO subject_type
    FROM core.entity WHERE entity_id = NEW.entity_id;
  IF subject_type IS DISTINCT FROM 'Company' THEN
    RAISE EXCEPTION 'playbook assignment subject must be an issuer Company, got %', subject_type;
  END IF;

  IF NEW.security_issuer_identity_id IS NOT NULL THEN
    SELECT * INTO identity_row
      FROM core.security_issuer_identity
     WHERE security_issuer_identity_id = NEW.security_issuer_identity_id;
    IF identity_row.issuer_entity_id IS DISTINCT FROM NEW.entity_id
       OR identity_row.valid_from > NEW.valid_from
       OR identity_row.known_from > NEW.known_at THEN
      RAISE EXCEPTION 'playbook assignment does not cite the exact temporal issuer identity';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS playbook_assignment_issuer_guard
  ON governance.playbook_assignment;
CREATE TRIGGER playbook_assignment_issuer_guard
  BEFORE INSERT OR UPDATE OF entity_id, security_issuer_identity_id, valid_from, known_at
  ON governance.playbook_assignment
  FOR EACH ROW EXECUTE FUNCTION governance.validate_playbook_assignment_issuer();

-- Executable business-driver measurement rules. Formula inputs are named by the
-- exact eight-component vocabulary migration 037 enforces on every exposure.
CREATE TABLE IF NOT EXISTS governance.business_driver_measurement_rule (
    business_driver_measurement_rule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_driver_id BIGINT NOT NULL
      REFERENCES governance.business_driver(business_driver_id),
    rule_key TEXT NOT NULL CHECK (rule_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),
    input_concept_selectors JSONB NOT NULL
      CHECK (jsonb_typeof(input_concept_selectors) = 'array'
             AND jsonb_array_length(input_concept_selectors) > 0),
    comparison_method TEXT NOT NULL CHECK (comparison_method IN (
      'period_end_year_over_year_delta', 'duration_year_over_year_delta'
    )),
    output_unit TEXT NOT NULL CHECK (length(btrim(output_unit)) > 0),
    output_currency TEXT CHECK (output_currency IS NULL OR output_currency ~ '^[A-Z]{3}$'),
    CHECK ((output_unit = 'currency') = (output_currency IS NOT NULL)),
    direction_policy JSONB NOT NULL CHECK (jsonb_typeof(direction_policy) = 'object'),
    materiality_policy JSONB NOT NULL CHECK (jsonb_typeof(materiality_policy) = 'object'),
    minimum_history_observations INTEGER NOT NULL
      CHECK (minimum_history_observations >= 2),
    allowed_pit_classes TEXT[] NOT NULL
      CHECK (
        cardinality(allowed_pit_classes) > 0
        AND allowed_pit_classes <@ ARRAY['PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE']::TEXT[]
      ),
    score_component_formula_inputs JSONB NOT NULL
      CHECK (
        jsonb_typeof(score_component_formula_inputs) = 'object'
        AND score_component_formula_inputs ?& ARRAY[
          'evidence_confidence', 'relation_strength', 'materiality', 'transmission',
          'direction', 'lag', 'market_reflection', 'model_uncertainty'
        ]
      ),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    known_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    supersedes_business_driver_measurement_rule_id BIGINT
      REFERENCES governance.business_driver_measurement_rule(business_driver_measurement_rule_id),
    authored_by TEXT NOT NULL CHECK (length(btrim(authored_by)) > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (business_driver_id, rule_key, revision_no),
    CONSTRAINT business_driver_measurement_rule_revision_chain CHECK (
      (revision_no = 1 AND supersedes_business_driver_measurement_rule_id IS NULL)
      OR (revision_no > 1 AND supersedes_business_driver_measurement_rule_id IS NOT NULL)
    ),
    CONSTRAINT business_driver_measurement_rule_interval_ordered CHECK (
      effective_to IS NULL OR effective_to > effective_from
    )
);

CREATE INDEX IF NOT EXISTS ix_business_driver_measurement_rule_current
  ON governance.business_driver_measurement_rule
    (business_driver_id, rule_key, revision_no DESC)
  WHERE effective_to IS NULL;

-- A non-initial rule revision must replace exactly the preceding revision of
-- the same driver/rule logical key. The FK/non-null shape alone cannot say that.
CREATE OR REPLACE FUNCTION governance.validate_exact_revision_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $revision_guard$
DECLARE
  prior_key TEXT;
  new_key TEXT;
  prior_revision INTEGER;
BEGIN
  IF NEW.revision_no > 1 THEN
    new_key := NEW.business_driver_id::text || ':' || NEW.rule_key;
    SELECT previous.business_driver_id::text || ':' || previous.rule_key,
           previous.revision_no
      INTO prior_key, prior_revision
      FROM governance.business_driver_measurement_rule previous
     WHERE previous.business_driver_measurement_rule_id =
           NEW.supersedes_business_driver_measurement_rule_id;
    IF prior_key IS DISTINCT FROM new_key
       OR prior_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION
        'measurement-rule supersession must cite the preceding revision of the same driver/rule';
    END IF;
  END IF;
  RETURN NEW;
END
$revision_guard$;

DROP TRIGGER IF EXISTS business_driver_measurement_rule_exact_revision_chain
  ON governance.business_driver_measurement_rule;
CREATE TRIGGER business_driver_measurement_rule_exact_revision_chain
  BEFORE INSERT ON governance.business_driver_measurement_rule
  FOR EACH ROW EXECUTE FUNCTION governance.validate_exact_revision_chain();

INSERT INTO governance.business_driver_measurement_rule (

  business_driver_id, rule_key, revision_no, input_concept_selectors,
  comparison_method, output_unit, output_currency, direction_policy, materiality_policy,
  minimum_history_observations, allowed_pit_classes,
  score_component_formula_inputs, effective_from, authored_by, metadata
)
SELECT driver.business_driver_id, seed.rule_key, 1,
       seed.input_concept_selectors, seed.comparison_method, 'currency', 'USD',
       seed.direction_policy, seed.materiality_policy, 2,
       ARRAY['PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE']::TEXT[],
       jsonb_build_object(
         'evidence_confidence', jsonb_build_object('input', 'worst_pit_class'),
         'relation_strength', jsonb_build_object('input', 'playbook_bridge'),
         'materiality', jsonb_build_object('input', 'absolute_change_over_prior_absolute'),
         'transmission', jsonb_build_object('input', 'driver_to_financial_stage'),
         'direction', jsonb_build_object('input', 'signed_comparison'),
         'lag', jsonb_build_object('input', 'playbook_driver_lag'),
         'market_reflection', jsonb_build_object('input', 'pre_cutoff_market_move'),
         'model_uncertainty', jsonb_build_object('input', 'history_and_attribution_coverage')
       ),
       TIMESTAMPTZ '2026-08-09T00:00:00Z', 'migration-088',
       jsonb_build_object('playbook_key', 'semiconductor')
  FROM governance.sector_playbook playbook
  JOIN governance.business_driver driver
    ON driver.sector_playbook_id = playbook.sector_playbook_id
  JOIN (VALUES
    (
      'inventory_position', 'inventory_yoy',
      '[{"concept_namespace":"us-gaap","concept_keys":["InventoryNet","InventoryNetOfAllowancesCustomerAdvancesAndProgressBillings"]}]'::jsonb,
      'period_end_year_over_year_delta',
      '{"positive":"negative","negative":"positive","zero":"ambiguous"}'::jsonb,
      '{"method":"absolute_change_over_prior_absolute","moderate":0.10,"high":0.25}'::jsonb
    ),
    (
      'fab_fixed_cost', 'net_ppe_yoy',
      '[{"concept_namespace":"us-gaap","concept_keys":["PropertyPlantAndEquipmentNet"]}]'::jsonb,
      'period_end_year_over_year_delta',
      '{"positive":"negative","negative":"positive","zero":"ambiguous"}'::jsonb,
      '{"method":"absolute_change_over_prior_absolute","moderate":0.10,"high":0.25}'::jsonb
    ),
    (
      'capex_cycle', 'capex_yoy',
      '[{"concept_namespace":"us-gaap","concept_keys":["PaymentsToAcquirePropertyPlantAndEquipment"]}]'::jsonb,
      'duration_year_over_year_delta',
      '{"positive":"negative","negative":"positive","zero":"ambiguous"}'::jsonb,
      '{"method":"absolute_change_over_prior_absolute","moderate":0.10,"high":0.25}'::jsonb
    )
  ) AS seed(
    driver_key, rule_key, input_concept_selectors, comparison_method,
    direction_policy, materiality_policy
  ) ON seed.driver_key = driver.driver_key
 WHERE playbook.playbook_key = 'semiconductor'
   AND playbook.revision_no = 1
ON CONFLICT (business_driver_id, rule_key, revision_no) DO NOTHING;

-- Security-facing resolution crosses the exact temporal identity into the
-- issuer assignment, then resolves the playbook revision, driver and rule.
CREATE OR REPLACE VIEW governance.security_playbook_measurement_rule_current_v2 AS
SELECT identity.security_entity_id,
       identity.issuer_entity_id,
       identity.security_issuer_identity_id,
       assignment.playbook_assignment_id,
       playbook.sector_playbook_id,
       playbook.playbook_key,
       playbook.revision_no,
       driver.business_driver_id,
       driver.driver_key,
       rule.business_driver_measurement_rule_id,
       rule.rule_key,
       rule.revision_no AS rule_revision_no,
       rule.input_concept_selectors,
       rule.comparison_method,
       rule.output_unit,
       rule.output_currency,
       rule.direction_policy,
       rule.materiality_policy,
       rule.minimum_history_observations,
       rule.allowed_pit_classes,
       rule.score_component_formula_inputs
  FROM core.security_issuer_identity identity
  JOIN governance.playbook_assignment assignment
    ON assignment.entity_id = identity.issuer_entity_id
   AND assignment.valid_to IS NULL
   AND identity.valid_from <= assignment.valid_from
   AND identity.known_from <= assignment.known_at
  JOIN governance.sector_playbook playbook
    ON playbook.sector_playbook_id = assignment.sector_playbook_id
   AND playbook.playbook_state = 'active'
   AND playbook.effective_to IS NULL
  JOIN governance.business_driver driver
    ON driver.sector_playbook_id = playbook.sector_playbook_id
  JOIN governance.business_driver_measurement_rule rule
    ON rule.business_driver_id = driver.business_driver_id
   AND rule.effective_to IS NULL;

GRANT SELECT, INSERT ON governance.business_driver_measurement_rule
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON
  governance.business_driver_measurement_rule,
  governance.security_playbook_measurement_rule_current_v2
  TO si_readapi;
GRANT SELECT ON governance.security_playbook_measurement_rule_current_v2
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
`;
