export const refiningAndUtilityPlaybooksMigrationSql = `
-- Two playbooks canonical/04 §5 does not ask for, written because nine companies in the
-- universe have no frame at all.
--
-- THESE ARE EXTENSIONS, NOT CANONICAL MINIMUMS, and the distinction is recorded rather
-- than blurred. §5 names five sectors and all five now exist (087, 108, 109, 112, 113).
-- Migration 112 narrowed Resources / Energy to extractive producers because reserves,
-- grade and NAV presuppose an orebody, and that left three refiners and six regulated
-- utilities governed by nothing:
--
--   REFINING   KSIC 192 SK이노베이션 · KSIC 19210 S-Oil · SIC 2911 ExxonMobil
--   UTILITY    KSIC 35120 한국전력 · KSIC 35200 한국가스공사 ·
--              SIC 4911 NextEra, Constellation, Vistra, Oklo
--
-- A recorded gap is better than a wrong frame, which is why 112 recorded it. A filled
-- gap is better still, provided nobody later reads these as canonical requirements —
-- hence this header and the notes field on each row.
--
-- WHY THEY ARE TWO PLAYBOOKS AND NOT ONE 'ENERGY'. A refiner is a price-taker on both
-- sides: it buys crude at a benchmark and sells product at another, and the difference
-- is the whole business. A regulated utility is a price-taker on neither: a regulator
-- sets what it may earn on its asset base, and fuel is passed through with a timing lag.
-- One frame covering both would have to drop everything specific to either.
--
-- MEASUREMENT RULES REACH WHAT IS TAGGED, WHICH IS THE INPUT SIDE. Measured across the
-- nine companies:
--
--   refining   ifrs-full Revenue · CostOfSales · Inventories   2 issuers KRW
--              us-gaap   Revenues                              1 issuer  USD
--   utility    us-gaap   PropertyPlantAndEquipmentNet          4 issuers USD
--              us-gaap   Revenues                              3 issuers USD
--
-- The crack spread itself is not tagged anywhere, and neither is an allowed return on
-- equity. Revenue and cost of sales move with the spread and are ruled; the spread is
-- left as an unruled driver that says what it needs. Net PP&E is the closest tagged
-- proxy for a rate base and the driver says exactly that rather than calling it one.

INSERT INTO governance.sector_playbook (
  playbook_key, revision_no, display_name, value_chain, unit_of_analysis,
  key_indicators, financial_bridge, catalysts_and_risks, valuation_methods,
  peer_dimensions, source_requirements, adapter_interfaces,
  playbook_state, effective_from, authored_by, notes
) VALUES
(
  'refining', 1, 'Refining / Processing',
  '["crude sourcing and logistics", "distillation", "conversion and upgrading", "blending", "product distribution", "petrochemical integration"]'::jsonb,
  'a refinery configuration processing a crude slate into a product slate, at the spread between the two',
  '[
    {"key":"crack_spread","kind":"leading","why":"Buying and selling are both at benchmarks the refiner does not set, so the difference is the entire margin and the level of either says little."},
    {"key":"throughput_utilisation","kind":"lagging","why":"Fixed costs are large and largely unavoidable, so utilisation converts the same spread into very different profit."},
    {"key":"crude_slate_complexity","kind":"leading","why":"A complex refinery can run cheap heavy crude that a simple one cannot, and that capability IS the durable advantage."},
    {"key":"inventory_holding_effect","kind":"lagging","why":"A refiner holds weeks of inventory, so a price move produces a holding gain or loss that is reported as operating profit and is not operating at all."},
    {"key":"turnaround_schedule","kind":"leading","why":"Planned maintenance removes capacity on a known date; unplanned outage removes it on an unknown one, and the two are read alike if the schedule is not disclosed."}
  ]'::jsonb,
  '[
    {"from":"crack_spread","to":"margin","how":"the product-minus-crude difference is the margin before anything else"},
    {"from":"throughput_utilisation","to":"fixed_cost","how":"fixed cost per barrel falls with volume and nothing else moves it"},
    {"from":"crude_slate_complexity","to":"variable_cost","how":"conversion capacity lets cheaper crude become the same product"},
    {"from":"inventory_holding_effect","to":"working_capital","how":"a price move revalues weeks of held stock before any of it is sold"},
    {"from":"turnaround_schedule","to":"revenue","how":"capacity offline is volume that does not exist, planned or not"}
  ]'::jsonb,
  '[
    {"kind":"catalyst","key":"spread_widening","note":"a product shortage widening the crack without any company action"},
    {"kind":"catalyst","key":"turnaround_completion","note":"capacity returning on schedule after planned maintenance"},
    {"kind":"risk","key":"unplanned_outage","note":"capacity lost with no notice and usually at the worst spread"},
    {"kind":"risk","key":"inventory_writedown","note":"a price fall turning held stock into a reported loss"},
    {"kind":"risk","key":"demand_substitution","note":"structural product demand moving away, which no spread recovers"}
  ]'::jsonb,
  '[
    {"key":"mid_cycle_ebitda","note":"the cycle position must be stated; a peak-spread multiple on peak spreads prices a peak as permanent"},
    {"key":"replacement_cost_per_barrel","note":"what the configuration would cost to rebuild, which floors a trough valuation"},
    {"key":"ev_per_complexity_barrel","note":"only within one complexity band, because a simple and a complex refinery are different assets"}
  ]'::jsonb,
  '["refinery_complexity","crude_slate_flexibility","product_mix","regional_spread_exposure","petrochemical_integration"]'::jsonb,
  '[
    {"key":"issuer_filings","why":"throughput, utilisation and the turnaround calendar are operating disclosures, not derivable"},
    {"key":"benchmark_price_series","why":"a crack spread only exists against the two benchmarks it is struck between"}
  ]'::jsonb,
  '{
    "identity_extensions": ["refinery_site", "complexity_index", "crude_slate", "product_slate"],
    "metric_concepts": ["crack_spread", "throughput_barrels", "utilisation_rate", "inventory_days"],
    "world_state_event_types": ["turnaround_start", "unplanned_outage", "capacity_addition", "product_specification_change"],
    "business_driver_transforms": ["refining_revenue", "crude_cost", "inventory_position"],
    "valuation_methods": ["mid_cycle_ebitda", "replacement_cost_per_barrel", "ev_per_complexity_barrel"],
    "peer_dimensions": ["refinery_complexity", "crude_slate_flexibility", "product_mix"],
    "acceptance_fixtures": ["refining_v1_golden"],
    "source_pack": ["issuer_filings", "benchmark_price_series"]
  }'::jsonb,
  'active', TIMESTAMPTZ '2026-08-11T00:00:00Z', 'migration-114',
  'Revision 1. NOT a canonical/04 §5 sector — §5 names five and all five exist. This exists because migration 112 narrowed Resources / Energy to extractive producers and left three refiners with no frame. It states what must be examined, never what to conclude.'
),
(
  'utility', 1, 'Regulated Utility',
  '["generation or procurement", "transmission", "distribution", "retail supply", "regulated asset base", "rate case and tariff"]'::jsonb,
  'a regulated asset base earning an allowed return under a tariff set by a regulator',
  '[
    {"key":"rate_base","kind":"leading","why":"Earnings are an allowed return on invested asset base, so growth comes from investing rather than from selling more."},
    {"key":"allowed_return","kind":"leading","why":"The regulator sets what may be earned; a change in allowed ROE reprices the whole company without any operational change."},
    {"key":"fuel_cost_passthrough","kind":"leading","why":"Fuel is recovered from customers with a lag, so a fuel spike is a working capital event first and a margin event only if recovery is denied."},
    {"key":"load_and_tariff","kind":"lagging","why":"Volume and price are both administered, and a volume fall under a fixed-charge tariff does not reduce revenue the way it would elsewhere."},
    {"key":"capex_program_and_recovery","kind":"leading","why":"Committed capital that a regulator later disallows is a loss with no operational cause, which is the sector''s distinctive risk."}
  ]'::jsonb,
  '[
    {"from":"rate_base","to":"revenue","how":"allowed revenue is a return applied to the invested base"},
    {"from":"allowed_return","to":"margin","how":"the permitted rate is the margin, set outside the company"},
    {"from":"fuel_cost_passthrough","to":"working_capital","how":"the recovery lag funds customers in the interim"},
    {"from":"capex_program_and_recovery","to":"capex","how":"investment is the growth mechanism and the disallowance risk at once"},
    {"from":"load_and_tariff","to":"revenue","how":"administered volume and price meet in the tariff rather than in a market"}
  ]'::jsonb,
  '[
    {"kind":"catalyst","key":"rate_case_decision","note":"a tariff review setting allowed return and recoverable base"},
    {"kind":"catalyst","key":"capex_approval","note":"an investment programme accepted into the rate base"},
    {"kind":"risk","key":"disallowance","note":"spent capital ruled unrecoverable, which no operating performance offsets"},
    {"kind":"risk","key":"fuel_recovery_denial","note":"a pass-through refused or deferred, turning a timing item into a loss"},
    {"kind":"risk","key":"political_tariff_freeze","note":"a price freeze imposed for reasons unrelated to the cost of service"}
  ]'::jsonb,
  '[
    {"key":"premium_to_rate_base","note":"what the market pays above the invested base, which is a judgement about future allowed returns"},
    {"key":"dividend_discount_regulated","note":"appropriate here precisely because the cash flow is administered and stable"},
    {"key":"earned_versus_allowed_roe","note":"the gap between what is permitted and what is achieved is the operating story"}
  ]'::jsonb,
  '["regulatory_jurisdiction","generation_mix","vertically_integrated_versus_wires_only","allowed_roe_band","fuel_exposure"]'::jsonb,
  '[
    {"key":"regulatory_filing","why":"allowed return, rate base and recovery mechanics are decided in a public rate case, not stated by the issuer"},
    {"key":"issuer_filings","why":"invested base and the capital programme are in the financial statements"},
    {"key":"fuel_price_series","why":"a pass-through lag only means something against the fuel path that caused it"}
  ]'::jsonb,
  '{
    "identity_extensions": ["regulatory_jurisdiction", "service_territory", "generation_mix", "tariff_class"],
    "metric_concepts": ["rate_base", "allowed_roe", "earned_roe", "fuel_recovery_balance", "load_growth"],
    "world_state_event_types": ["rate_case_filing", "rate_case_decision", "capex_approval", "disallowance", "tariff_change"],
    "business_driver_transforms": ["invested_asset_base", "utility_revenue"],
    "valuation_methods": ["premium_to_rate_base", "dividend_discount_regulated", "earned_versus_allowed_roe"],
    "peer_dimensions": ["regulatory_jurisdiction", "generation_mix", "vertically_integrated_versus_wires_only"],
    "acceptance_fixtures": ["utility_v1_golden"],
    "source_pack": ["regulatory_filing", "issuer_filings", "fuel_price_series"]
  }'::jsonb,
  'active', TIMESTAMPTZ '2026-08-11T00:00:00Z', 'migration-114',
  'Revision 1. NOT a canonical/04 §5 sector, for the same reason as refining: §5 narrowed to extractive producers and six regulated utilities were left with no frame. It states what must be examined, never what to conclude.'
)
ON CONFLICT (playbook_key, revision_no) DO NOTHING;

INSERT INTO governance.business_driver (
  sector_playbook_id, driver_key, chain_stage, display_name, definition,
  source_requirement, horizon, sensitivity_note, lag_note, regime_note,
  uncertainty_note, affects_stage, affects_direction
)
SELECT playbook.sector_playbook_id, driver.driver_key, driver.chain_stage,
       driver.display_name, driver.definition, driver.source_requirement, driver.horizon,
       driver.sensitivity_note, driver.lag_note, driver.regime_note,
       driver.uncertainty_note, driver.affects_stage, driver.affects_direction
FROM governance.sector_playbook playbook
JOIN (VALUES
  ('refining', 'refining_revenue', 'revenue', 'Refining revenue',
   'Revenue from refined product sales, which moves with both product price and volume.',
   'issuer income statement; the product-versus-chemical split matters and is not always given',
   'quarterly',
   'Moves with the product side of the spread, which is the half a refiner sells into.',
   'Recognised on sale, so it trails the spread by inventory turn.',
   'A revenue rise in a rising-crude regime can accompany a falling margin, so the level alone misleads.',
   'Integrated groups report chemicals alongside refining and the split is not always separable.',
   'margin', 'increases'),
  ('refining', 'crude_cost', 'variable_cost', 'Crude and feedstock cost',
   'Cost of crude and feedstock consumed, the buy side of the spread.',
   'issuer cost of sales; a realised crude cost is rarely disclosed separately',
   'quarterly',
   'The other half of the spread, and the larger number of the two.',
   'Purchased weeks before it is processed, so cost trails the benchmark it was bought at.',
   'In a falling-crude regime a refiner processes expensive crude into cheap product, and the reported cost lags the relief.',
   'Cost of sales includes more than crude, so it is a proxy and is named as one.',
   'margin', 'decreases'),
  ('refining', 'inventory_position', 'working_capital', 'Inventory position',
   'Crude and product inventory held, which revalues with price before any of it is sold.',
   'issuer balance sheet; volume-versus-price effects are not separately disclosed',
   'quarterly',
   'A refiner holds weeks of stock, so a price move lands in reported profit through the inventory rather than through the spread.',
   'The revaluation is recognised at the next reporting date regardless of when the price moved.',
   'Holding gains flatter a rising market and holding losses deepen a falling one, in both cases without any operating change.',
   'The reported balance mixes volume and price, and the two have opposite meanings.',
   'fcf', 'decreases'),
  ('refining', 'crack_spread', 'price', 'Crack spread',
   'Difference between the product slate benchmark and the crude benchmark, per barrel.',
   'benchmark price series for both sides; a spread quoted without its two benchmarks is unverifiable',
   'quarterly',
   'This is the margin. Everything else adjusts how much of it the refiner keeps.',
   'Observable daily, realised over the inventory turn.',
   'Regional spreads diverge, so a refiner is exposed to the spread where it sells, not to the global one.',
   'Not tagged in any financial statement; it is an external series and this driver has no measurement rule for that reason.',
   'margin', 'increases'),

  ('utility', 'invested_asset_base', 'capex', 'Invested asset base',
   'Net utility plant, the closest tagged proxy for the regulated rate base.',
   'issuer balance sheet net PP&E; the true rate base is set in a rate case and differs from book',
   'multiyear',
   'Earnings are an allowed return applied to this, so the base is the growth mechanism.',
   'Investment enters the base only when a regulator accepts it, which lags the spending.',
   'A rising-rate regime raises the allowed return but also the cost of the capital funding the base.',
   'Net PP&E is NOT the rate base: regulatory adjustments, disallowances and deferred taxes all separate them. It is a proxy and is named as one.',
   'revenue', 'increases'),
  ('utility', 'utility_revenue', 'revenue', 'Regulated revenue',
   'Revenue under the tariff, combining administered volume and administered price.',
   'issuer income statement; the fuel pass-through component is not always separated',
   'quarterly',
   'Both volume and price are administered, so this moves with the tariff more than with demand.',
   'Tariff changes take effect on a decided date, so revenue steps rather than drifts.',
   'Under a fixed-charge tariff a volume fall barely moves revenue; under a volumetric one it moves fully.',
   'Fuel recovered from customers passes through revenue without being margin, so a fuel spike inflates it.',
   'margin', 'increases')
) AS driver(playbook_key, driver_key, chain_stage, display_name, definition, source_requirement,
            horizon, sensitivity_note, lag_note, regime_note, uncertainty_note,
            affects_stage, affects_direction)
  ON driver.playbook_key = playbook.playbook_key
WHERE playbook.playbook_key IN ('refining', 'utility') AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;

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
       'migration-114',
       jsonb_build_object('note', rule.note)
FROM governance.sector_playbook playbook
JOIN governance.business_driver driver
  ON driver.sector_playbook_id = playbook.sector_playbook_id
JOIN (VALUES
  ('refining', 'refining_revenue', 'refining_revenue_yoy_krw', 'KRW',
   '[{"concept_namespace":"ifrs-full","concept_keys":["Revenue"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Revenue moves with the product side of the spread; it is not the spread and the driver says so.'),
  ('refining', 'refining_revenue', 'refining_revenue_yoy_usd', 'USD',
   '[{"concept_namespace":"us-gaap","concept_keys":["Revenues"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Same reasoning as the KRW rule.'),
  ('refining', 'crude_cost', 'crude_cost_yoy_krw', 'KRW',
   '[{"concept_namespace":"ifrs-full","concept_keys":["CostOfSales"]}]',
   '{"positive":"negative","negative":"positive","zero":"ambiguous"}',
   'Cost of sales includes more than crude. It is the buy-side proxy and rising cost compresses the spread.'),
  ('refining', 'inventory_position', 'refining_inventory_yoy_krw', 'KRW',
   '[{"concept_namespace":"ifrs-full","concept_keys":["Inventories"]}]',
   '{"positive":"ambiguous","negative":"ambiguous","zero":"ambiguous"}',
   'Deliberately ambiguous in both directions: the balance mixes volume and price, and a rise can be stockbuild or revaluation, which mean opposite things.'),

  ('utility', 'invested_asset_base', 'net_utility_plant_yoy_usd', 'USD',
   '[{"concept_namespace":"us-gaap","concept_keys":["PropertyPlantAndEquipmentNet"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Net PP&E is a proxy for the rate base, not the rate base: regulatory adjustments and disallowances separate them.'),
  ('utility', 'utility_revenue', 'utility_revenue_yoy_usd', 'USD',
   '[{"concept_namespace":"us-gaap","concept_keys":["Revenues","RevenueFromContractWithCustomerExcludingAssessedTax"]}]',
   '{"positive":"positive","negative":"negative","zero":"ambiguous"}',
   'Includes fuel recovered from customers, which passes through revenue without being margin.')
) AS rule(playbook_key, driver_key, rule_key, output_currency, input_concept_selectors,
          direction_policy, note)
  ON rule.playbook_key = playbook.playbook_key AND rule.driver_key = driver.driver_key
WHERE playbook.playbook_key IN ('refining', 'utility') AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;
`;
