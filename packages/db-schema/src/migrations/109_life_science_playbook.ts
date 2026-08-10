export const lifeSciencePlaybookMigrationSql = `
-- The third sector playbook: drug developers.
--
-- canonical/04 §5 Life Science / Bio asks for trial/study/phase/cohort, endpoint and
-- statistical plan, result and adverse event, regulatory milestone, cash runway and
-- dilution, and probability-of-success/rNPV treated as estimate rather than fact.
-- Every one of those is a CLINICAL DEVELOPMENT concept: what this sector is, as an
-- object of analysis, is a set of molecules moving through trials toward an approval
-- that may never come.
--
-- WHY THE STAGE VOCABULARY GROWS AGAIN. Migration 107 added funding,
-- net_interest_income, regulatory_capital and liquidity for banks. This sector needs
-- two more:
--
--   pipeline    a molecule's position in development. Not 'demand': nobody is
--               demanding a phase 2 asset, and its value moves on readouts rather
--               than on orders.
--   regulatory  an approval decision made by a third party on evidence it defines.
--               Distinct from the bank's regulatory_capital, which is a continuous
--               constraint rather than a binary event.
--
-- Same justification as 107: nothing in apps/api or packages branches on a stage name,
-- so widening admits new rows and invalidates none.
--
-- WHAT THE LIVE TAXONOMY HOLDS, MEASURED 2026-08-11 — 18 securities:
--
--   SIC 2834  Pharmaceutical Preparations   JNJ, LLY, NVO, Tvardi, Gelteq
--   SIC 2836  Biological Products           CURIS, Creative Medical
--   KSIC 211  기초 의약 물질 및 생물학적 제제  삼성바이오로직스, 휴젤, 펩트론
--   KSIC 21100                              셀트리온
--   KSIC 212  의약품 제조업                  녹십자, 종근당, 한미(21212), HK이노엔,
--                                           유바이오로직스, 에스티팜, 환인제약
--
-- Unlike KSIC 64992 지주회사, none of these codes is a legal form: they all say "makes
-- pharmaceutical or biological products". So every one is a taxonomy assignment and
-- there are no curations.
--
-- WHAT IS NOT CURATED OUT, AND WHY. KSIC 211 holds 삼성바이오로직스 next to 펩트론, and
-- a contract manufacturer's economics are not a clinical developer's — capacity
-- utilisation and contract backlog rather than readouts and runway. It would be easy
-- to exclude it the way 삼성전기 was excluded from semiconductor. It is not, for two
-- reasons. The database carries no evidence of what any of these companies does:
-- company_profiles.summary_text is a template ('기업 개황 (대표 X, 업종코드 Y)') with no
-- business description, so an exclusion here would rest on assertion alone. And the
-- failure modes are not symmetric — a wrongly INCLUDED company shows its trial drivers
-- as not_produced, which is visible and true, while a wrongly EXCLUDED one shows
-- nothing at all. The distinction is recorded where it belongs instead: as a peer
-- dimension, so a CDMO and a clinical-stage developer are never ranked against each
-- other even though both are governed.

ALTER TABLE governance.business_driver
  DROP CONSTRAINT IF EXISTS business_driver_chain_stage_check;
ALTER TABLE governance.business_driver
  ADD CONSTRAINT business_driver_chain_stage_check
  CHECK (chain_stage IN (
    'demand', 'price', 'mix', 'revenue', 'variable_cost', 'fixed_cost', 'margin',
    'working_capital', 'capex', 'tax_interest', 'fcf',
    'funding', 'net_interest_income', 'regulatory_capital', 'liquidity',
    'pipeline', 'regulatory'
  ));

ALTER TABLE governance.business_driver
  DROP CONSTRAINT IF EXISTS business_driver_affects_stage_check;
ALTER TABLE governance.business_driver
  ADD CONSTRAINT business_driver_affects_stage_check
  CHECK (affects_stage IN (
    'demand', 'price', 'mix', 'revenue', 'variable_cost', 'fixed_cost', 'margin',
    'working_capital', 'capex', 'tax_interest', 'fcf',
    'funding', 'net_interest_income', 'regulatory_capital', 'liquidity',
    'pipeline', 'regulatory'
  ));

INSERT INTO governance.sector_playbook (
  playbook_key, revision_no, display_name, value_chain, unit_of_analysis,
  key_indicators, financial_bridge, catalysts_and_risks, valuation_methods,
  peer_dimensions, source_requirements, adapter_interfaces,
  playbook_state, effective_from, authored_by, notes
) VALUES (
  'life_science', 1, 'Life Science / Drug Development',
  '["target discovery", "preclinical", "clinical development", "regulatory review", "manufacturing and supply", "commercial launch", "lifecycle and loss of exclusivity"]'::jsonb,
  'a molecule in a named indication at a named development phase, with the trial that will decide it',
  '[
    {"key":"trial_phase_cohort","kind":"leading","why":"canonical/04 §5: trial/study/phase/cohort. A phase 2 result in one indication says nothing about the same molecule in another, so the asset is the molecule-indication pair and never the molecule alone."},
    {"key":"endpoint_statistical_plan","kind":"leading","why":"canonical/04 §5: endpoint/design/statistical plan. A trial that hits a secondary endpoint after missing its primary has failed; without the pre-specified plan, a result cannot be read at all."},
    {"key":"result_adverse_event","kind":"leading","why":"canonical/04 §5: result/adverse event. Efficacy and safety are separate verdicts, and a safety signal can end a programme that met every efficacy endpoint."},
    {"key":"regulatory_milestone","kind":"leading","why":"canonical/04 §5: regulatory milestone. Approval is a decision by a third party on evidence it defines, not an outcome the company controls."},
    {"key":"cash_runway_dilution","kind":"leading","why":"canonical/04 §5: cash runway/dilution. A developer without revenue is funded to a date; the trial that matters is the one that reads out before the cash ends."},
    {"key":"probability_of_success_rnpv","kind":"leading","why":"canonical/04 §5: probability-of-success and rNPV as estimate, not fact. Both are model outputs whose inputs are historical base rates; presenting either as a measurement is the failure this bullet exists to prevent."}
  ]'::jsonb,
  '[
    {"from":"trial_phase_cohort","to":"revenue","how":"only an approved molecule sells, and phase position is the distance to that"},
    {"from":"endpoint_statistical_plan","to":"regulatory","how":"a regulator judges the pre-specified endpoint, not the most favourable one"},
    {"from":"result_adverse_event","to":"regulatory","how":"a safety signal removes an approval that efficacy alone would have earned"},
    {"from":"regulatory_milestone","to":"revenue","how":"approval converts a pipeline asset into a product with a price"},
    {"from":"cash_runway","to":"pipeline","how":"programmes are cut by funding before they are cut by data"}
  ]'::jsonb,
  '[
    {"kind":"catalyst","key":"pivotal_readout","note":"a phase 3 primary endpoint reading out"},
    {"kind":"catalyst","key":"regulatory_decision","note":"an approval or complete response letter on a filed application"},
    {"kind":"catalyst","key":"partnership_or_licence","note":"an upfront payment that also reprices the asset by revealing what a buyer pays"},
    {"kind":"risk","key":"clinical_hold","note":"a regulator stopping enrolment on a safety signal"},
    {"kind":"risk","key":"financing_gap","note":"runway ending before the readout that would have funded the next raise"},
    {"kind":"risk","key":"loss_of_exclusivity","note":"a marketed product losing protection, which is scheduled and still routinely underpriced"}
  ]'::jsonb,
  '[
    {"key":"rnpv_by_asset","note":"probability-weighted per molecule-indication; the probability is a base rate, not a measurement, and must be shown as one"},
    {"key":"sum_of_parts_pipeline_plus_marketed","note":"a marketed portfolio and a pipeline are different risk objects and are not summed at one discount rate"},
    {"key":"cash_and_runway_floor","note":"for a pre-revenue developer, net cash is the part of the value that is not an estimate"}
  ]'::jsonb,
  '["development_stage_preclinical_to_marketed","modality_small_molecule_biologic_cell_gene","therapeutic_area","developer_versus_contract_manufacturer","revenue_bearing_versus_pre_revenue"]'::jsonb,
  '[
    {"key":"trial_registry","why":"phase, enrolment and endpoint are registered before the result exists, which is what makes a later claim checkable"},
    {"key":"regulatory_disclosure","why":"approvals, complete response letters and clinical holds are regulator actions, not issuer statements"},
    {"key":"issuer_filings","why":"cash, burn and the dilution history live in the filings; a runway quoted without the burn behind it is not an observation"}
  ]'::jsonb,
  '{
    "identity_extensions": ["molecule", "indication", "development_phase", "modality", "regulatory_jurisdiction"],
    "metric_concepts": ["cash_runway_months", "quarterly_burn", "enrolment_rate", "shares_outstanding_change", "rnd_expense"],
    "world_state_event_types": ["trial_initiation", "trial_readout", "regulatory_submission", "regulatory_decision", "clinical_hold", "licence_agreement"],
    "business_driver_transforms": ["pipeline_stage", "endpoint_quality", "safety_signal", "regulatory_milestone", "cash_runway"],
    "valuation_methods": ["rnpv_by_asset", "sum_of_parts_pipeline_plus_marketed", "cash_and_runway_floor"],
    "peer_dimensions": ["development_stage_preclinical_to_marketed", "modality_small_molecule_biologic_cell_gene", "developer_versus_contract_manufacturer"],
    "acceptance_fixtures": ["life_science_v1_golden"],
    "source_pack": ["trial_registry", "regulatory_disclosure", "issuer_filings"]
  }'::jsonb,
  'active', TIMESTAMPTZ '2026-08-11T00:00:00Z', 'migration-109',
  'Revision 1. canonical/04 §5 Life Science / Bio. No curated assignments: unlike KSIC 64992, every code in scope names a business rather than a legal form. The CDMO-versus-developer split is a peer dimension, not an exclusion, because the database carries no evidence of what any of these companies does.'
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
  ('pipeline_stage', 'pipeline', 'Pipeline stage',
   'Development phase of each molecule-indication pair, with the trial that would advance it named.',
   'trial registry entry; an issuer pipeline chart without registry identifiers is a claim, not a record',
   'multiyear',
   'Phase position is the largest single determinant of an asset''s expected value.',
   'A phase advance is announced at initiation and resolved at readout, which are years apart.',
   'Base rates differ by therapeutic area and modality; a phase 2 in oncology is not a phase 2 in dermatology.',
   'An issuer chart may count a programme as active long after enrolment has stopped.',
   'revenue', 'increases'),

  ('endpoint_quality', 'pipeline', 'Endpoint and statistical plan',
   'The pre-specified primary endpoint, its powering, and whether the analysis reported matches the plan registered.',
   'trial registry plan compared against the reported analysis; the comparison is the point',
   'multiyear',
   'Determines whether a reported result is admissible at all.',
   'Registered before the trial; only checkable against a result years later.',
   'Regulators accept different endpoints in different areas, and accelerated pathways change what counts.',
   'A post-hoc subgroup presented as a result is the most common way a failed trial is reported as a success.',
   'regulatory', 'increases'),

  ('safety_signal', 'pipeline', 'Adverse event signal',
   'Serious adverse events and their attribution, held separately from the efficacy result.',
   'trial registry safety reporting and regulator action; an issuer summary is not sufficient',
   'multiyear',
   'A safety signal can end a programme whose efficacy endpoints were all met.',
   'Signals accumulate through the trial and can surface after approval.',
   'Tolerance depends on the indication: an oncology therapy carries risk a chronic dermatology drug cannot.',
   'Attribution is contested by construction — the question is whether the drug caused it.',
   'regulatory', 'decreases'),

  ('regulatory_milestone', 'regulatory', 'Regulatory milestone',
   'Submission, review designation, and decision, per jurisdiction.',
   'regulator publication; the decision belongs to the regulator and is published by it',
   'annual',
   'Approval is the discrete event that converts a pipeline asset into a product.',
   'Review clocks are defined in advance, so the date is knowable even when the outcome is not.',
   'Jurisdictions decide independently and on different evidence; one approval does not imply another.',
   'A complete response letter is not a rejection, and the difference is not always disclosed.',
   'revenue', 'increases'),

  ('cash_runway', 'funding', 'Cash runway',
   'Months of operation at the current burn, and the dilution history that funded it.',
   'issuer filings for cash, burn and share count; a runway quoted without the burn behind it is unverifiable',
   'quarterly',
   'For a pre-revenue developer this is the binding constraint on everything else.',
   'Burn is observed quarterly and the cliff arrives on a date computable from it.',
   'A financing window that is open in one market regime is shut in another, which changes the runway without the burn changing.',
   'Runway assumes a burn that management can cut, and the cut itself ends programmes.',
   'pipeline', 'increases')
) AS driver(driver_key, chain_stage, display_name, definition, source_requirement, horizon,
            sensitivity_note, lag_note, regime_note, uncertainty_note,
            affects_stage, affects_direction)
WHERE playbook.playbook_key = 'life_science' AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;
`;
