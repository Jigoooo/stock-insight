export const bankPlaybookMigrationSql = `
-- The second sector playbook: deposit-taking lenders.
--
-- canonical/04 §5 heads this section "Banks / Financials" and lists asset/liability
-- repricing, deposit beta/mix, NIM definition, credit quality/provisions, liquidity
-- and regulatory capital, and duration/funding/contagion. Every one of those is a
-- BANK concept. A securities broker has no NIM; an insurer has no deposit beta. So
-- this playbook is named 'bank' rather than 'financials', and the adjacent financial
-- businesses are recorded as deliberate exclusions instead of being swept in by the
-- heading.
--
-- WHAT THE LIVE TAXONOMY LOOKS LIKE, MEASURED 2026-08-11:
--
--   SIC 6021  National Commercial Banks   BAC, C, JPM, WFC          unambiguous
--   KSIC 64121 국내은행                    기업은행, 카카오뱅크        unambiguous
--   KSIC 64992 지주회사                    15 companies              NOT an industry
--
-- 64992 is a LEGAL FORM, not a sector. It holds 신한·KB·하나·BNK·JB·아이엠금융지주
-- alongside LG, LS, SK, SK스퀘어, 에코프로, HD한국조선해양, OCI홀딩스 and
-- LS에코에너지. Assigning by code would put bank KPIs on a shipbuilder and a battery
-- materials maker — the same failure the semiconductor playbook avoided when KSIC 26
-- would have taken in a defence contractor and a satellite antenna maker.
--
-- The bank holding companies therefore arrive as curated assignments with a reason,
-- and the non-financial holdings are recorded as near misses. That is the existing
-- pattern in playbook-assignment.ts, and this playbook does not invent a new one.
--
-- WHAT THIS DOES NOT COVER, AND WHY EACH IS SEPARATE:
--   증권 (KSIC 66121, SIC 6211)  fee and trading income, no deposit franchise
--   보험 (KSIC 651xx, SIC 6324)  underwriting and float, no deposit beta
--   crypto (SIC 6199)            Coinbase and friends; no balance sheet of this kind
--   ETFs  (SIC 6221)             SPDR Gold, US Copper — not operating companies
--   REITs (SIC 6798)             property yield, not a lending spread
--
-- ON THE STAGE VOCABULARY. Migration 107 widened chain_stage/affects_stage with
-- funding, net_interest_income, regulatory_capital and liquidity, because a lending
-- spread is not a product P&L's revenue and a regulator's capital floor is not capex.
-- business_driver_not_self_referential still applies and is respected here rather than
-- relaxed: securities portfolio duration sits in net_interest_income, because the
-- portfolio is part of the interest-earning book, and lands on liquidity, because that
-- is where its duration is actually felt. A driver whose affects_stage equals its
-- chain_stage asserts nothing.
--
-- Like migration 087, this states what must be EXAMINED and never what to conclude.

INSERT INTO governance.sector_playbook (
  playbook_key, revision_no, display_name, value_chain, unit_of_analysis,
  key_indicators, financial_bridge, catalysts_and_risks, valuation_methods,
  peer_dimensions, source_requirements, adapter_interfaces,
  playbook_state, effective_from, authored_by, notes
) VALUES (
  'bank', 1, 'Banks / Deposit-Taking Lenders',
  '["deposit gathering", "wholesale funding", "loan origination", "credit underwriting", "securities portfolio", "fee and transaction services", "capital and liquidity management"]'::jsonb,
  'a lending spread earned on a funded balance sheet, under a regulatory capital constraint',
  '[
    {"key":"asset_liability_repricing","kind":"leading","why":"canonical/04 §5: asset/liability repricing and maturity. Two banks with identical NIM today diverge entirely on which side reprices first when rates move."},
    {"key":"deposit_beta_mix","kind":"leading","why":"canonical/04 §5: deposit beta/mix. The share of a rate move that must be passed to depositors is the single largest determinant of whether a hike helps or hurts."},
    {"key":"nim_definition","kind":"lagging","why":"canonical/04 §5: NIM definition. NIM is not comparable across banks until the denominator is stated — earning assets, average or period-end, and whether it is tax-equivalent."},
    {"key":"credit_quality_provisions","kind":"leading","why":"canonical/04 §5: credit quality/provisions. Provisions are a forward estimate under an accounting model, so a provision move is a claim about the future, not a record of the past."},
    {"key":"liquidity_regulatory_capital","kind":"leading","why":"canonical/04 §5: liquidity/regulatory capital. Capital is the binding constraint on growth and the first thing a regulator removes discretion over."},
    {"key":"duration_funding_contagion","kind":"leading","why":"canonical/04 §5: duration/funding/contagion. Unrealised securities losses are not an income statement event until funding forces a sale, which is a liquidity fact, not a credit one."}
  ]'::jsonb,
  '[
    {"from":"deposit_beta_mix","to":"net_interest_income","how":"a high beta hands most of a rate rise back to depositors"},
    {"from":"asset_liability_repricing","to":"net_interest_income","how":"the side that reprices first sets the sign of a rate move"},
    {"from":"credit_quality_provisions","to":"margin","how":"a provision is taken before the loss is realised, and released before recovery is complete"},
    {"from":"liquidity_regulatory_capital","to":"revenue","how":"a capital floor caps balance sheet growth regardless of demand"},
    {"from":"duration_funding_contagion","to":"liquidity","how":"an unrealised loss becomes realised only when funding forces the sale"}
  ]'::jsonb,
  '[
    {"kind":"catalyst","key":"policy_rate_turn","note":"the direction change, not the level, is what repricing asymmetry acts on"},
    {"kind":"catalyst","key":"capital_return_approval","note":"a regulator permitting buyback or dividend releases trapped capital"},
    {"kind":"risk","key":"deposit_flight","note":"funding leaving faster than assets can be sold at carrying value"},
    {"kind":"risk","key":"credit_cycle_turn","note":"provisions built on a benign loss assumption that stops holding"},
    {"kind":"risk","key":"regulatory_capital_change","note":"a rule change that reprices the whole balance sheet without any market moving"}
  ]'::jsonb,
  '[
    {"key":"price_to_tangible_book","note":"tangible book only; goodwill from past acquisitions is not loss-absorbing capital"},
    {"key":"return_on_tangible_equity_vs_cost_of_equity","note":"a bank earning below its cost of equity is worth less than book, and the gap is the valuation"},
    {"key":"dividend_discount_with_capital_constraint","note":"only with the capital floor stated, since distributable earnings are not reported earnings"}
  ]'::jsonb,
  '["deposit_franchise_strength","asset_mix_loan_versus_securities","funding_mix_retail_versus_wholesale","regulatory_regime","credit_book_seasoning"]'::jsonb,
  '[
    {"key":"issuer_filings","why":"NIM, its denominator definition, and the provision model live in the filings and nowhere else"},
    {"key":"regulatory_disclosure","why":"capital and liquidity ratios are regulator-defined; an issuer-computed substitute is a different number"},
    {"key":"policy_rate_series","why":"deposit beta is only measurable against the policy path that produced it"}
  ]'::jsonb,
  '{
    "identity_extensions": ["regulatory_regime", "charter_type", "deposit_insurance_scheme"],
    "metric_concepts": ["net_interest_margin", "deposit_beta", "cost_of_risk", "cet1_ratio", "loan_to_deposit", "coverage_ratio"],
    "world_state_event_types": ["policy_rate_change", "capital_requirement_change", "stress_test_result", "deposit_run", "credit_downgrade"],
    "business_driver_transforms": ["deposit_cost", "loan_yield", "loan_book_growth", "provision_charge", "capital_headroom", "securities_duration"],
    "valuation_methods": ["price_to_tangible_book", "return_on_tangible_equity_vs_cost_of_equity", "dividend_discount_with_capital_constraint"],
    "peer_dimensions": ["deposit_franchise_strength", "asset_mix_loan_versus_securities", "funding_mix_retail_versus_wholesale"],
    "acceptance_fixtures": ["bank_v1_golden"],
    "source_pack": ["issuer_filings", "regulatory_disclosure", "policy_rate_series"]
  }'::jsonb,
  'active', TIMESTAMPTZ '2026-08-11T00:00:00Z', 'migration-107',
  'Revision 1. canonical/04 §5 Banks/Financials narrowed to deposit-taking lenders; brokers, insurers, crypto platforms, ETFs and REITs are excluded by name because none of them has a deposit franchise or a lending spread.'
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
  ('deposit_cost', 'funding', 'Deposit cost',
   'Interest paid on deposits over average deposit balances, separated from wholesale funding cost.',
   'issuer disclosure of interest expense split by funding type; a blended cost of funds is not this',
   'quarterly',
   'The largest single lever on net interest income for a retail-funded bank.',
   'Repricing lags a policy move by one to three quarters and asymmetrically: deposits reprice up more slowly than they reprice down.',
   'Beta itself is regime-dependent — the same bank passes through far more of a hike when a competitor is advertising a higher rate.',
   'Blended disclosure hides mix shifts between demand and time deposits, which move beta without any rate changing.',
   'net_interest_income', 'decreases'),

  ('loan_yield', 'price', 'Loan yield',
   'Interest earned on loans over average loan balances, before provisions.',
   'issuer disclosure of interest income and average balances; a period-end balance produces a different number',
   'quarterly',
   'Together with deposit cost this is the spread; neither is informative alone.',
   'Fixed-rate books reprice only as they mature, so a yield move can trail a policy move by years.',
   'A floating-rate book in a rising regime and a fixed-rate book in the same regime are opposite exposures.',
   'Yield mixes rate and credit mix: a higher yield may be a riskier book rather than a better price.',
   'net_interest_income', 'increases'),

  ('loan_book_growth', 'demand', 'Loan book growth',
   'Change in gross loans, distinguished from balance change caused by FX or disposals.',
   'issuer balance sheet with the FX and disposal effects disclosed separately',
   'quarterly',
   'Volume is the second lever after spread, and the only one management directly controls.',
   'Origination shows in balances immediately and in credit outcomes years later.',
   'Growth at the top of a credit cycle and growth at the bottom are different assets with the same label.',
   'Reported growth includes acquired books, which carry underwriting the acquirer never performed.',
   'net_interest_income', 'increases'),

  ('provision_charge', 'variable_cost', 'Provision charge',
   'Expected credit loss charged to income, and the assumption set that produced it.',
   'issuer disclosure of the provision model, staging and macro scenario weights',
   'quarterly',
   'Provisions swing earnings more than revenue does in a turning credit cycle.',
   'The charge leads realised losses by quarters to years, and releases lead recovery by the same.',
   'The same loss experience produces different charges under different macro scenario weights.',
   'It is an estimate under a model, not an observation. A provision move without its assumption change is uninterpretable.',
   'margin', 'decreases'),

  ('capital_headroom', 'regulatory_capital', 'Regulatory capital headroom',
   'CET1 above the binding regulatory minimum including buffers, in basis points.',
   'regulator-defined ratio from the issuer regulatory disclosure; an issuer-computed variant is a different measure',
   'quarterly',
   'Headroom is what converts earnings into either growth or distribution.',
   'Requirement changes are announced well before they bind, so the constraint moves before the ratio does.',
   'A ratio that is comfortable under one regime is the minimum under another; the buffer stack is jurisdictional.',
   'Risk-weighted assets are model-derived, so two banks with the same ratio may hold different real risk.',
   'revenue', 'increases'),

  ('securities_duration', 'net_interest_income', 'Securities portfolio duration',
   'Interest-rate sensitivity of the securities book, with held-to-maturity and available-for-sale separated.',
   'issuer disclosure of portfolio duration and unrealised position by accounting classification',
   'quarterly',
   'Determines how far an unrealised loss can travel before funding forces it into income.',
   'The mark moves with rates immediately; the income statement sees it only on sale.',
   'Held-to-maturity accounting hides the mark until a liquidity event makes it a sale, which is precisely when it matters.',
   'Duration disclosure is often a single number for a portfolio with very different convexity by tranche.',
   'liquidity', 'decreases')
) AS driver(driver_key, chain_stage, display_name, definition, source_requirement, horizon,
            sensitivity_note, lag_note, regime_note, uncertainty_note,
            affects_stage, affects_direction)
WHERE playbook.playbook_key = 'bank' AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;
`;
