export const bankMeasurementRulesMigrationSql = `
-- Measurement rules for the bank playbook.
--
-- A driver names what matters; a rule says how to measure it. Migration 108 gave the
-- bank playbook six drivers and no rules, which means K4 sees the playbook, resolves
-- the company, and then rejects every evaluation with 'no executable driver
-- measurement rule resolved at the cutoff'. The playbook opens the gate; the rules are
-- what walk through it.
--
-- ONLY WHAT THE FILINGS ACTUALLY REPORT. The concepts below were chosen by measuring
-- what the eleven governed banks file, not by picking the ideal metric:
--
--   ifrs-full  InterestExpense · RevenueFromInterest · DepositsFromCustomers   5 issuers
--   us-gaap    InterestExpense · InterestExpenseDeposits · Deposits            4 issuers
--
-- Both namespaces are listed in one selector per rule because the same driver is
-- reported under different tags on either side of the Pacific, and a rule that named
-- only one would silently cover half the population.
--
-- WHAT IS DELIBERATELY NOT RULED, AND WHY. Three of the six drivers get no rule here:
--
--   capital_headroom     CET1 is a regulator-defined ratio published in a regulatory
--                        return, not an XBRL concept in the financial statements. A
--                        rule reading some issuer-computed substitute would measure a
--                        different number under the same name.
--   securities_duration  portfolio duration is disclosed as narrative, not as a tagged
--                        fact. There is nothing to compare year over year.
--   provision_charge     the concept exists (ifrs-full Provisions, 5 issuers) but it is
--                        a BALANCE, not the period charge, and differencing a balance
--                        is not the charge — it nets releases and write-offs into one
--                        number that means neither.
--
-- Those are coverage facts, not omissions. K4 reports them as unsupported_measurement
-- per driver, which is visible; inventing a rule that reads the wrong concept would be
-- invisible and wrong.
--
-- COMPARISON METHOD. All are period_end_year_over_year_delta, matching the
-- semiconductor rules and the 350-380 day fiscal window the planner has used since the
-- 52/53-week defect.
--
-- ONE RULE PER CURRENCY, NOT ONE PER DRIVER. business_driver_measurement_rule_check
-- requires output_currency whenever output_unit is 'currency', and the planner rejects
-- a pair whose currency differs from the rule's. The governed banks split cleanly:
-- ifrs-full facts are KRW across all five Korean issuers and us-gaap facts are USD
-- across all four American ones. So each driver carries a KRW rule and a USD rule
-- rather than one rule pretending a won and a dollar share a unit, which is exactly
-- what the planner's unit check exists to refuse.

INSERT INTO governance.business_driver_measurement_rule (
  business_driver_id, rule_key, revision_no, input_concept_selectors, comparison_method,
  output_unit, output_currency, direction_policy, materiality_policy,
  minimum_history_observations, allowed_pit_classes, score_component_formula_inputs,
  effective_from, known_at, authored_by, metadata
)
SELECT driver.business_driver_id, rule.rule_key, 1,
       rule.input_concept_selectors::jsonb, 'period_end_year_over_year_delta',
       'currency', rule.output_currency,
       rule.direction_policy::jsonb,
       jsonb_build_object('method', 'absolute_change_over_prior_absolute'),
       2,
       ARRAY['PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'],
       -- All eight score components, same inputs the semiconductor rules use. The
       -- CHECK requires every one: a rule that named a subset would leave K4 scoring
       -- with a component it was never told how to fill.
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
       'migration-110',
       jsonb_build_object('note', rule.note)
FROM governance.sector_playbook playbook
JOIN governance.business_driver driver
  ON driver.sector_playbook_id = playbook.sector_playbook_id
JOIN (VALUES
  ('deposit_cost', 'deposit_interest_expense_yoy_krw', 'KRW',
   '[{"concept_namespace":"ifrs-full","concept_keys":["InterestExpense"]}]',
   -- Rising funding cost compresses the spread, so an increase is a negative signal.
   '{"positive":"negative","negative":"positive","zero":"ambiguous"}',
   'Interest expense is the closest tagged proxy for deposit cost. It includes wholesale funding, so a mix shift toward deposits reads as a fall that is really a change of funding source. The driver uncertainty_note says exactly that, and this rule does not pretend otherwise.'),
  ('deposit_cost', 'deposit_interest_expense_yoy_usd', 'USD',
   '[{"concept_namespace":"us-gaap","concept_keys":["InterestExpenseDeposits","InterestExpense"]}]',
   '{"positive":"negative","negative":"positive","zero":"ambiguous"}',
   'US filers tag deposit interest separately, so the deposit-only concept leads and plain InterestExpense is the fallback.'),

  ('loan_yield', 'interest_revenue_yoy_krw', 'KRW',
   '[{"concept_namespace":"ifrs-full","concept_keys":["RevenueFromInterest","InterestRevenueExpense"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Interest revenue rather than a yield: the denominator (average earning assets) is not consistently tagged, and a computed yield with an inconsistent denominator is worse than an honest level change.'),
  ('loan_yield', 'interest_revenue_yoy_usd', 'USD',
   '[{"concept_namespace":"us-gaap","concept_keys":["InterestAndDividendIncomeOperating","InterestIncomeExpenseNet"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Same reasoning as the KRW rule. InterestIncomeExpenseNet is a fallback and is net, which a level change still reads honestly.'),

  ('loan_book_growth', 'customer_deposits_yoy_krw', 'KRW',
   '[{"concept_namespace":"ifrs-full","concept_keys":["DepositsFromCustomers"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Deposits, not loans. Loan balances are tagged inconsistently across the governed banks while deposits are not, and the funding base is what the lending book is built on. This measures the liability side and says so rather than labelling it a loan book.'),
  ('loan_book_growth', 'customer_deposits_yoy_usd', 'USD',
   '[{"concept_namespace":"us-gaap","concept_keys":["Deposits"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Same reasoning as the KRW rule.')
) AS rule(driver_key, rule_key, output_currency, input_concept_selectors, direction_policy, note)
  ON rule.driver_key = driver.driver_key
WHERE playbook.playbook_key = 'bank' AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;
`;
