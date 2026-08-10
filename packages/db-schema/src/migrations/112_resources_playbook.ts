export const resourcesPlaybookMigrationSql = `
-- The fourth sector playbook: extractive resources.
--
-- canonical/04 §5 Resources / Energy asks for a mine/field/project-level asset,
-- reserves and grade and recovery, production and cost curve and capex, commodity
-- hedging, legal ownership versus economic interest, and NAV/SOTP. Every one of those
-- presupposes an orebody or a field — something finite, in the ground, whose size and
-- quality are estimates that get revised.
--
-- SO THIS PLAYBOOK IS EXTRACTIVE ONLY, and the heading's other half is excluded by
-- name. Measured 2026-08-11, the universe holds three kinds of company under the
-- 'energy and resources' banner and only one of them has reserves:
--
--   EXTRACTIVE   SIC 1000 Lithium Americas · SIC 1090 Cameco · SIC 1400 Centrus
--   REFINING     KSIC 192 SK이노베이션 · KSIC 19210 S-Oil · SIC 2911 ExxonMobil
--   UTILITY      KSIC 35120 한국전력 · KSIC 35200 한국가스공사 ·
--                SIC 4911 NextEra, Constellation, Vistra, Oklo
--
-- A refiner owns no reserves: it buys crude and sells product, and its economics are
-- throughput and the crack spread. A regulated utility owns no reserves either; its
-- revenue is a tariff set by a regulator on a rate base, with fuel cost passed through.
-- Governing either with reserves, grade and NAV would produce a frame in which every
-- driver reads not_produced and none of the real ones appears at all.
--
-- Both are recorded as near misses naming what they would need instead. They are a
-- genuine gap in this repository's playbook coverage — nine companies with no frame —
-- and the gap is written down here rather than hidden by a playbook that fits neither.
--
-- WHY NO MEASUREMENT RULES. Reserves, grade and recovery are published in technical
-- reports under NI 43-101 or SEC S-K 1300, not as tagged financial facts. Production
-- and unit cost live in operating reviews. None of it is in world.numeric_fact, so
-- every driver here is unruled by construction and K4 will say so per driver. That is
-- the same honest state life science is in, for the same reason: the sector's evidence
-- is not financial-statement evidence.

INSERT INTO governance.sector_playbook (
  playbook_key, revision_no, display_name, value_chain, unit_of_analysis,
  key_indicators, financial_bridge, catalysts_and_risks, valuation_methods,
  peer_dimensions, source_requirements, adapter_interfaces,
  playbook_state, effective_from, authored_by, notes
) VALUES (
  'resources', 1, 'Extractive Resources / Mining',
  '["exploration", "resource definition", "feasibility and permitting", "construction", "production and processing", "reclamation and closure"]'::jsonb,
  'an orebody or field at a named project, with the ownership interest that entitles the issuer to its output',
  '[
    {"key":"project_level_asset","kind":"leading","why":"canonical/04 §5: mine/field/project-level asset. Company-level numbers average projects with completely different lives, grades and costs, so the project is the only unit at which a resource claim means anything."},
    {"key":"reserves_grade_recovery","kind":"leading","why":"canonical/04 §5: reserves/resources/grade/recovery. A tonnage figure without grade and recovery is not an amount of metal, and the three are revised independently."},
    {"key":"production_cost_curve_capex","kind":"lagging","why":"canonical/04 §5: production/cost curve/capex. Position on the industry cost curve decides who survives a price trough, which is the question that matters in a cyclical commodity."},
    {"key":"commodity_hedge","kind":"leading","why":"canonical/04 §5: commodity hedge. A hedged producer and an unhedged one have different exposure to the same price, so the spot move alone does not say what happened to either."},
    {"key":"ownership_versus_economic_interest","kind":"leading","why":"canonical/04 §5: legal ownership vs economic interest. A streaming agreement, royalty or joint venture can leave the issuer holding the title and a minority of the cash flow."},
    {"key":"nav_sotp","kind":"lagging","why":"canonical/04 §5: NAV/SOTP. A producer is a finite set of depleting assets; an earnings multiple on a mine with eight years left prices it as if it had forever."}
  ]'::jsonb,
  '[
    {"from":"reserves_grade_recovery","to":"revenue","how":"grade and recovery decide how much metal a tonne of ore actually yields"},
    {"from":"production_cost_curve_capex","to":"margin","how":"cost curve position sets which price level turns the operation cash-negative"},
    {"from":"commodity_hedge","to":"price","how":"a hedge fixes the realised price away from the spot the market quotes"},
    {"from":"ownership_versus_economic_interest","to":"fcf","how":"a stream or royalty diverts cash the production figure appears to earn"},
    {"from":"project_level_asset","to":"capex","how":"development capital is committed per project and is largely irreversible once started"}
  ]'::jsonb,
  '[
    {"kind":"catalyst","key":"resource_upgrade","note":"an inferred resource converting to a reserve after infill drilling"},
    {"kind":"catalyst","key":"permit_decision","note":"a permit granted or refused, which is binary and outside the operator control"},
    {"kind":"catalyst","key":"first_production","note":"a project crossing from capital consumption to cash generation"},
    {"kind":"risk","key":"grade_reconciliation","note":"mined grade coming in below the model, which reprices the whole reserve"},
    {"kind":"risk","key":"capex_overrun","note":"development cost rising against a fixed orebody, with no revenue offset"},
    {"kind":"risk","key":"resource_nationalism","note":"a royalty or ownership rule change that moves economics without touching the asset"}
  ]'::jsonb,
  '[
    {"key":"nav_discounted_mine_plan","note":"per project on its own mine plan and price deck; the deck must be stated because it is the assumption doing the work"},
    {"key":"ev_per_resource_unit","note":"only within one commodity and one development stage; a pound in the ground is not comparable across either"},
    {"key":"sotp_producing_plus_development","note":"a producing mine and a permitted project carry different risk and are not discounted alike"}
  ]'::jsonb,
  '["commodity","development_stage_explorer_to_producer","cost_curve_quartile","jurisdiction_risk","hedged_versus_unhedged"]'::jsonb,
  '[
    {"key":"technical_report","why":"reserves, grade and recovery are stated under a reporting code (NI 43-101, S-K 1300) by a qualified person, not by the issuer freely"},
    {"key":"operating_disclosure","why":"production and unit cost are reported per operation, and a company average hides the cost curve"},
    {"key":"commodity_price_series","why":"a realised price only means something against the benchmark it was realised against"}
  ]'::jsonb,
  '{
    "identity_extensions": ["project", "commodity", "jurisdiction", "ownership_interest_percent", "reporting_code"],
    "metric_concepts": ["reserve_tonnes", "head_grade", "recovery_rate", "all_in_sustaining_cost", "annual_production", "mine_life_years"],
    "world_state_event_types": ["resource_estimate_update", "permit_decision", "first_production", "mine_suspension", "royalty_or_stream_agreement"],
    "business_driver_transforms": ["reserve_base", "head_grade", "unit_cash_cost", "realised_price", "economic_interest"],
    "valuation_methods": ["nav_discounted_mine_plan", "ev_per_resource_unit", "sotp_producing_plus_development"],
    "peer_dimensions": ["commodity", "development_stage_explorer_to_producer", "cost_curve_quartile"],
    "acceptance_fixtures": ["resources_v1_golden"],
    "source_pack": ["technical_report", "operating_disclosure", "commodity_price_series"]
  }'::jsonb,
  'active', TIMESTAMPTZ '2026-08-11T00:00:00Z', 'migration-112',
  'Revision 1. canonical/04 §5 Resources / Energy narrowed to extractive producers. Refiners and regulated utilities are excluded by name: neither owns reserves, and the six utilities and three refiners in the universe are a recorded gap in playbook coverage rather than a population this frame serves.'
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
CROSS JOIN (VALUES
  ('reserve_base', 'mix', 'Reserve and resource base',
   'Tonnage by reserve and resource category at each project, with the reporting code and effective date attached.',
   'technical report under NI 43-101 or S-K 1300; an issuer restatement without the qualified person is not this',
   'multiyear',
   'The reserve is the entire finite quantity the business can ever sell.',
   'Estimates are restated on a multi-year cadence, so the number can be years old while the mine plan is current.',
   'A price assumption sits inside the reserve definition: the same rock is reserve at one price and resource at another.',
   'Categories are estimates with declared confidence, and inferred material is explicitly not economic.',
   'revenue', 'increases'),

  ('head_grade', 'mix', 'Head grade and recovery',
   'Grade of ore delivered to the plant and the proportion of contained metal actually recovered.',
   'operating disclosure per operation; a company-wide average conceals the variation that matters',
   'quarterly',
   'Grade multiplies through the whole cost structure — halving grade nearly doubles unit cost.',
   'Observed each quarter and reconciled against the block model with a lag.',
   'Operators mine high grade first when prices are high, which flatters the present and shortens the future.',
   'Reconciliation between modelled and mined grade is itself an estimate, and a persistent gap invalidates the reserve.',
   'margin', 'increases'),

  ('unit_cash_cost', 'variable_cost', 'Unit cash cost',
   'All-in sustaining cost per unit of production, per operation.',
   'operating disclosure with the cost definition stated; AISC is not uniformly defined across issuers',
   'quarterly',
   'Cost curve position decides who keeps producing through a price trough.',
   'Costs respond to input prices within quarters and to grade within one.',
   'Currency matters more than for most sectors: costs are local and revenue is in the commodity currency.',
   'Definitions differ by issuer, so a cost comparison needs both definitions before it means anything.',
   'margin', 'decreases'),

  ('realised_price', 'price', 'Realised price and hedging',
   'Price actually received per unit, and the hedge position that separates it from the benchmark.',
   'issuer disclosure of realised price and hedge book against the benchmark series',
   'quarterly',
   'The gap between realised and benchmark is the entire content of a hedging programme.',
   'Hedges are struck ahead and settle over quarters, so a spot move reaches revenue late or not at all.',
   'A hedge that protected a producer in a falling market caps it in a rising one; the same book is opposite in two regimes.',
   'Hedge disclosure is often a summary position rather than a schedule, which hides the shape.',
   'revenue', 'increases'),

  ('economic_interest', 'fcf', 'Economic interest',
   'Share of project cash flow the issuer actually keeps, after streams, royalties and joint venture terms.',
   'issuer disclosure of ownership and offtake agreements; the legal title alone does not answer this',
   'multiyear',
   'Determines how much of the production figure reaches the issuer at all.',
   'Set at financing and effectively permanent; it changes only through a transaction.',
   'Streams sold in a financing squeeze look cheap while prices are low and expensive for the whole life afterwards.',
   'Agreements are commercially confidential in parts, so the disclosed terms may be incomplete.',
   'revenue', 'increases')
) AS driver(driver_key, chain_stage, display_name, definition, source_requirement, horizon,
            sensitivity_note, lag_note, regime_note, uncertainty_note,
            affects_stage, affects_direction)
WHERE playbook.playbook_key = 'resources' AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;
`;
