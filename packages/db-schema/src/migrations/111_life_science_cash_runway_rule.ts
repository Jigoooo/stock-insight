export const lifeScienceCashRunwayRuleMigrationSql = `
-- The one life science driver the financial statements can actually measure.
--
-- Migration 109 gave this playbook five drivers and no rules, and four of them cannot
-- have one: phase, endpoint design, safety signal and regulatory milestone live in trial
-- registries and regulator publications, not in tagged financial facts. Those stay
-- unruled and K4 reports them per driver, which is the honest state.
--
-- Cash is different. Measured across the sixteen governed companies:
--
--   ifrs-full  CashAndCashEquivalents               8 issuers   KRW
--   us-gaap    CashAndCashEquivalentsAtCarryingValue 5 issuers  USD
--
-- WHAT THIS MEASURES, AND WHAT IT DOES NOT. The driver is 'cash runway' — months of
-- operation at the current burn. This rule measures the CASH BALANCE year over year,
-- not the runway. Runway needs burn in the denominator, and burn tagged consistently
-- across sixteen companies in two accounting standards is not something this database
-- has. A falling balance is evidence about runway; it is not runway, and the rule key
-- says balance rather than runway so nobody reads it as the ratio.
--
-- Per currency, for the same reason as the bank rules: ifrs-full facts here are KRW and
-- us-gaap facts are USD, and business_driver_measurement_rule_check requires the
-- currency whenever the unit is currency.

INSERT INTO governance.business_driver_measurement_rule (
  business_driver_id, rule_key, revision_no, input_concept_selectors, comparison_method,
  output_unit, output_currency, direction_policy, materiality_policy,
  minimum_history_observations, allowed_pit_classes, score_component_formula_inputs,
  effective_from, known_at, authored_by, metadata
)
SELECT driver.business_driver_id, rule.rule_key, 1,
       rule.input_concept_selectors::jsonb, 'period_end_year_over_year_delta',
       'currency', rule.output_currency,
       -- More cash is more runway, so a rise is a positive signal for the pipeline.
       '{"positive":"positive","negative":"negative","zero":"ambiguous"}'::jsonb,
       jsonb_build_object('method', 'absolute_change_over_prior_absolute'),
       2,
       ARRAY['PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'],
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
       TIMESTAMPTZ '2026-08-11T00:00:00Z', TIMESTAMPTZ '2026-08-11T00:00:00Z',
       'migration-111',
       jsonb_build_object('note', rule.note)
FROM governance.sector_playbook playbook
JOIN governance.business_driver driver
  ON driver.sector_playbook_id = playbook.sector_playbook_id
JOIN (VALUES
  ('cash_runway', 'cash_balance_yoy_krw', 'KRW',
   '[{"concept_namespace":"ifrs-full","concept_keys":["CashAndCashEquivalents"]}]',
   'Cash balance, not runway. Runway needs a burn denominator and burn is not consistently tagged across these issuers, so the rule measures what is reported and is named for it.'),
  ('cash_runway', 'cash_balance_yoy_usd', 'USD',
   '[{"concept_namespace":"us-gaap","concept_keys":["CashAndCashEquivalentsAtCarryingValue"]}]',
   'Same reasoning as the KRW rule.')
) AS rule(driver_key, rule_key, output_currency, input_concept_selectors, note)
  ON rule.driver_key = driver.driver_key
WHERE playbook.playbook_key = 'life_science' AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;
`;
