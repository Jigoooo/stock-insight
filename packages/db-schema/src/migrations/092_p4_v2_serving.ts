export const p4V2ServingMigrationSql = `
-- K4 Task 4: unit-aware p4.v2 shadow serving boundary.
-- Raw evaluations remain pipeline-only. Coverage may expose rejected reason
-- codes, while economic details are admitted solely through the accepted,
-- sealed, fully decomposed and PIT A/B/C views installed by migration 089.

CREATE OR REPLACE VIEW analytics.k4_portfolio_impact_coverage_v2 AS
SELECT evaluation.impact_evaluation_revision_id,
       evaluation.evaluation_key,
       evaluation.revision_no,
       evaluation.supersedes_impact_evaluation_revision_id,
       evaluation.security_entity_id,
       evaluation.information_set_id,
       information_set.valid_cutoff,
       information_set.source_available_cutoff,
       information_set.system_known_cutoff,
       information_set.market_observation_cutoff,
       information_set.semantic_snapshot_id,
       information_set.created_at AS information_set_created_at,
       evaluation.evaluation_disposition,
       evaluation.reason_detail,
       evaluation.created_at AS evaluation_created_at
  FROM analytics.impact_evaluation_revision evaluation
  JOIN governance.analysis_information_set information_set
    ON information_set.information_set_id = evaluation.information_set_id
 WHERE evaluation.evaluation_disposition <> 'accepted'
    OR EXISTS (
      SELECT 1
        FROM analytics.accepted_impact_evaluation_v1 accepted
       WHERE accepted.impact_evaluation_revision_id =
             evaluation.impact_evaluation_revision_id
    );

CREATE OR REPLACE VIEW analytics.k4_portfolio_impact_exposure_v2 AS
SELECT evaluation.impact_evaluation_revision_id,
       evaluation.evaluation_key,
       evaluation.security_entity_id,
       evaluation.issuer_entity_id,
       evaluation.security_issuer_identity_id,
       evaluation.sector_playbook_id,
       evaluation.business_driver_id,
       evaluation.business_driver_measurement_rule_id,
       evaluation.information_set_id,
       evaluation.derivation_id,
       evaluation.created_at AS evaluation_created_at,
       information_set.valid_cutoff,
       information_set.source_available_cutoff,
       information_set.system_known_cutoff,
       information_set.market_observation_cutoff,
       information_set.semantic_snapshot_id,
       information_set.created_at AS information_set_created_at,
       exposure.impact_exposure_revision_id,
       exposure.impact_shock_id,
       shock.known_at AS shock_known_at,
       shock.event_revision_id,
       event_revision.known_at AS event_known_at,
       event.event_key,
       exposure.sign,
       exposure.horizon,
       channel.channel_class,
       exposure.economic_magnitude,
       exposure.economic_magnitude_unit,
       exposure.materiality,
       exposure.uncertainty,
       exposure.epistemic_confidence,
       exposure.available_at,
       exposure.known_at,
       exposure.sealed_at
  FROM analytics.accepted_impact_evaluation_v1 evaluation
  JOIN analytics.impact_exposure_revision exposure
    ON exposure.impact_exposure_revision_id =
       evaluation.impact_exposure_revision_id
   AND exposure.exposure_state = 'sealed'
  JOIN analytics.impact_channel channel
    ON channel.impact_channel_id = exposure.impact_channel_id
  JOIN analytics.impact_shock shock
    ON shock.impact_shock_id = exposure.impact_shock_id
  JOIN world.event_revision event_revision
    ON event_revision.event_revision_id = shock.event_revision_id
  JOIN world.event event
    ON event.event_id = event_revision.event_id
  JOIN governance.analysis_information_set information_set
    ON information_set.information_set_id = evaluation.information_set_id
 WHERE exposure.economic_magnitude IS NOT NULL
   AND exposure.economic_magnitude_unit IS NOT NULL
   AND exposure.horizon IS NOT NULL
   AND exposure.materiality IS NOT NULL
   AND exposure.uncertainty IS NOT NULL
   AND exposure.epistemic_confidence IS NOT NULL
   AND (
     SELECT count(DISTINCT component.component_kind) = 8
       FROM analytics.impact_score_component component
      WHERE component.impact_exposure_revision_id =
            exposure.impact_exposure_revision_id
   )
   AND EXISTS (
     SELECT 1
       FROM analytics.accepted_impact_evaluation_evidence_v1 evidence
      WHERE evidence.impact_evaluation_revision_id =
            evaluation.impact_evaluation_revision_id
        AND evidence.input_role = 'current'
   )
   AND EXISTS (
     SELECT 1
       FROM analytics.accepted_impact_evaluation_evidence_v1 evidence
      WHERE evidence.impact_evaluation_revision_id =
            evaluation.impact_evaluation_revision_id
        AND evidence.input_role = 'comparison'
   );

CREATE OR REPLACE VIEW analytics.k4_portfolio_impact_score_component_v2 AS
SELECT component.impact_score_component_id,
       component.impact_exposure_revision_id,
       component.component_kind,
       component.component_value,
       component.rationale
  FROM analytics.impact_score_component component
  JOIN analytics.k4_portfolio_impact_exposure_v2 exposure
    ON exposure.impact_exposure_revision_id =
       component.impact_exposure_revision_id;

CREATE OR REPLACE VIEW analytics.k4_portfolio_impact_evidence_v2 AS
SELECT evidence.impact_evaluation_evidence_id,
       evidence.impact_evaluation_revision_id,
       exposure.impact_exposure_revision_id,
       evidence.numeric_fact_id,
       evidence.source_revision_id,
       evidence.source_pit_quality_id,
       quality.pit_quality_class,
       evidence.input_role
  FROM analytics.accepted_impact_evaluation_evidence_v1 evidence
  JOIN analytics.k4_portfolio_impact_exposure_v2 exposure
    ON exposure.impact_evaluation_revision_id =
       evidence.impact_evaluation_revision_id
  JOIN governance.source_pit_quality quality
    ON quality.source_pit_quality_id = evidence.source_pit_quality_id
 WHERE quality.pit_quality_class IN (
   'PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'
 );

CREATE OR REPLACE VIEW analytics.k4_portfolio_impact_path_step_v2 AS
SELECT citation.impact_path_step_exposure_citation_id,
       citation.impact_path_step_id,
       citation.impact_exposure_revision_id,
       citation.citation_role
  FROM analytics.impact_path_step_exposure_citation citation
  JOIN analytics.k4_portfolio_impact_exposure_v2 exposure
    ON exposure.impact_exposure_revision_id =
       citation.impact_exposure_revision_id;

REVOKE ALL ON
  analytics.k4_portfolio_impact_coverage_v2,
  analytics.k4_portfolio_impact_exposure_v2,
  analytics.k4_portfolio_impact_score_component_v2,
  analytics.k4_portfolio_impact_evidence_v2,
  analytics.k4_portfolio_impact_path_step_v2
  FROM PUBLIC;
GRANT SELECT ON
  analytics.k4_portfolio_impact_coverage_v2,
  analytics.k4_portfolio_impact_exposure_v2,
  analytics.k4_portfolio_impact_score_component_v2,
  analytics.k4_portfolio_impact_evidence_v2,
  analytics.k4_portfolio_impact_path_step_v2
  TO si_readapi, si_knowledge, si_analytics, si_publisher;

-- Migration 013 left a schema-wide default SELECT grant for the runtime reader.
-- Close that historical broad grant here: the application sees only the five
-- fail-closed K4 projections above, never the mutable/raw ledgers underneath.
DO $app_reader_boundary$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader'
  ) THEN
    REVOKE SELECT ON
      analytics.impact_evaluation_revision,
      analytics.impact_evaluation_evidence,
      analytics.impact_exposure_revision,
      analytics.impact_score_component,
      analytics.impact_shock,
      analytics.impact_channel,
      analytics.impact_path_step,
      analytics.expectation_revision,
      analytics.surprise_revision,
      analytics.valuation_estimate_revision,
      analytics.impact_path_step_exposure_citation,
      analytics.impact_outcome_revision,
      analytics.accepted_impact_evaluation_v1,
      analytics.accepted_impact_evaluation_evidence_v1
      FROM stock_insight_app_reader;
    GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;
    GRANT SELECT ON
      analytics.k4_portfolio_impact_coverage_v2,
      analytics.k4_portfolio_impact_exposure_v2,
      analytics.k4_portfolio_impact_score_component_v2,
      analytics.k4_portfolio_impact_evidence_v2,
      analytics.k4_portfolio_impact_path_step_v2
      TO stock_insight_app_reader;
  END IF;
END
$app_reader_boundary$;
`;
