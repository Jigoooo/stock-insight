export const cryptoPlaybookMigrationSql = `
-- The fifth and last sector playbook canonical/04 §5 asks for: crypto protocols.
--
-- Its minimums — protocol versus token value capture, contract upgrade and version,
-- token supply and emission and unlock and burn, fee and revenue distribution,
-- collateral and bridge and oracle dependency, chain finality and reorg — describe a
-- PROTOCOL and its token. Not a company that touches crypto. Coinbase is an exchange
-- with a balance sheet and an income statement; Bitcoin has neither and has a monetary
-- policy instead. The two are not the same object and this playbook is about the second.
--
-- THE ASSIGNMENT GUARD HAS TO WIDEN, AND ONLY BY ONE TYPE.
--
-- Migration 088 made playbook_assignment refuse any subject that is not a Company,
-- because a playbook had been assigned to the security rather than its issuer and
-- joined to nothing. That protection is exactly right for equities and it is kept.
--
-- A token has no issuer company. core.entity holds 24 Token rows with real identifiers
-- (CRYPTO:BTC, CRYPTO:SOL) that already participate in 104 PEER_OF and 19 SAME_THEME
-- relations, and for them the asset IS the subject — there is no issuer behind Bitcoin
-- to point at. So the guard admits Company and Token, and nothing else. The temporal
-- issuer-identity check still applies whenever security_issuer_identity_id is supplied,
-- which a token assignment never does.
--
-- K4 is unaffected: its universe query joins playbook_assignment to
-- security_issuer_identity.issuer_entity_id, so a token assignment matches nothing there
-- and no security silently acquires a protocol playbook.
--
-- SIX OF THE 24 'TOKEN' ROWS ARE NOT TOKENS, and this playbook is where that becomes
-- visible rather than being inherited:
--
--   CRYPTO:ERROR   'coingecko_global'  — an error placeholder that became an entity
--   CRYPTO:GLOBAL  total market cap    — an aggregate, no supply and no contract
--   CRYPTO:ETH.D   Ethereum dominance  — a ratio between two aggregates
--   CRYPTO:FNG     Fear & Greed index  — a sentiment index
--   CRYPTO:SPY     Macro:SPY           — a US equity ETF typed as a Token
--   CRYPTO:QQQ     Macro:QQQ           — the same
--
-- They are recorded as near misses in playbook-assignment.ts with the reason each is
-- not a protocol. CRYPTO:ERROR in particular is a data defect, not a classification
-- question, and naming it here is how it stops being invisible.

CREATE OR REPLACE FUNCTION governance.validate_playbook_assignment_issuer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  subject_type TEXT;
  identity_row core.security_issuer_identity%ROWTYPE;
BEGIN
  SELECT entity_type INTO subject_type
    FROM core.entity WHERE entity_id = NEW.entity_id;
  -- Company for equities (migration 088), Token for protocols. Nothing else: a Stock
  -- subject is the defect 088 was written to stop, and it still is.
  IF subject_type IS DISTINCT FROM 'Company' AND subject_type IS DISTINCT FROM 'Token' THEN
    RAISE EXCEPTION 'playbook assignment subject must be an issuer Company or a Token, got %',
      subject_type;
  END IF;

  IF NEW.security_issuer_identity_id IS NOT NULL THEN
    IF subject_type = 'Token' THEN
      RAISE EXCEPTION 'a token playbook assignment cannot cite a security issuer identity';
    END IF;
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
END;
$$;

INSERT INTO governance.sector_playbook (
  playbook_key, revision_no, display_name, value_chain, unit_of_analysis,
  key_indicators, financial_bridge, catalysts_and_risks, valuation_methods,
  peer_dimensions, source_requirements, adapter_interfaces,
  playbook_state, effective_from, authored_by, notes
) VALUES (
  'crypto', 1, 'Crypto Protocol / Token',
  '["consensus and validation", "execution and settlement", "application layer", "bridges and interoperability", "oracles and external data", "custody and access", "exchange and liquidity"]'::jsonb,
  'a protocol and the token that claims part of its economics, on a named chain at a named contract version',
  '[
    {"key":"protocol_versus_token_value_capture","kind":"leading","why":"canonical/04 §5: protocol vs token value capture. A protocol can be heavily used while its token captures none of that use; usage is not revenue and revenue is not a claim."},
    {"key":"contract_upgrade_version","kind":"leading","why":"canonical/04 §5: contract upgrade/version. An upgradeable contract can change its own rules, so a property measured at one version is not a property of the protocol."},
    {"key":"token_supply_emission","kind":"leading","why":"canonical/04 §5: token supply/emission/unlock/burn. Supply is a policy the protocol executes, and a scheduled unlock is a known future dilution that circulating supply does not show."},
    {"key":"fee_revenue_distribution","kind":"lagging","why":"canonical/04 §5: fee/revenue distribution. Who receives a fee — holders, validators, a treasury, or nobody — decides whether protocol activity reaches the token at all."},
    {"key":"collateral_bridge_oracle_dependency","kind":"leading","why":"canonical/04 §5: collateral/bridge/oracle dependency. A protocol inherits the failure modes of everything it depends on, and those dependencies are usually off its own chain."},
    {"key":"chain_finality_reorg","kind":"leading","why":"canonical/04 §5: chain finality/reorg/canonicality. Until finality a recorded state can be un-recorded, so a balance is a claim about a chain state that may not be canonical."}
  ]'::jsonb,
  '[
    {"from":"fee_revenue_distribution","to":"revenue","how":"only the share routed to the token is a claim a holder has"},
    {"from":"token_supply_emission","to":"price","how":"emission and unlocks add sellable supply on a schedule that is knowable in advance"},
    {"from":"protocol_versus_token_value_capture","to":"revenue","how":"usage without a capture mechanism produces activity and no claim"},
    {"from":"collateral_bridge_oracle_dependency","to":"liquidity","how":"a bridge or oracle failure can strand collateral that the protocol reports as held"},
    {"from":"contract_upgrade_version","to":"regulatory","how":"an upgrade can change the rules a measurement was taken under, invalidating the comparison rather than moving it"}
  ]'::jsonb,
  '[
    {"kind":"catalyst","key":"protocol_upgrade","note":"a version change that alters fee routing or issuance"},
    {"kind":"catalyst","key":"fee_switch","note":"a governance decision to route protocol fees to the token"},
    {"kind":"risk","key":"scheduled_unlock","note":"a cliff releasing supply on a published date, routinely priced late"},
    {"kind":"risk","key":"bridge_or_oracle_failure","note":"an external dependency failing, which the protocol cannot itself prevent"},
    {"kind":"risk","key":"reorg_or_finality_failure","note":"recorded state becoming non-canonical, which invalidates measurements taken from it"},
    {"kind":"risk","key":"governance_capture","note":"a concentrated holder base able to change the rules the valuation assumed"}
  ]'::jsonb,
  '[
    {"key":"fee_to_token_holder_flow","note":"only the fee share the token actually receives; total protocol fees are not a holder claim"},
    {"key":"fully_diluted_versus_circulating","note":"both, always, with the unlock schedule; a circulating-only figure prices a supply that will not persist"},
    {"key":"cost_of_security","note":"what the chain pays validators to stay honest, which is a floor on issuance rather than a return"}
  ]'::jsonb,
  '["consensus_mechanism","value_capture_mechanism","supply_schedule_fixed_versus_inflationary","chain_layer_l1_versus_l2","dependency_surface"]'::jsonb,
  '[
    {"key":"chain_state","why":"supply, emission and fees are readable on-chain, which is the only place they are authoritative"},
    {"key":"contract_source_and_version","why":"a rule can only be cited against the deployed version it belongs to"},
    {"key":"governance_record","why":"fee routing and upgrades are decided by a recorded process, not announced by an issuer"}
  ]'::jsonb,
  '{
    "identity_extensions": ["chain", "contract_address", "contract_version", "consensus_mechanism", "token_standard"],
    "metric_concepts": ["circulating_supply", "fully_diluted_supply", "emission_rate", "protocol_fees", "fees_to_holders", "staking_ratio"],
    "world_state_event_types": ["protocol_upgrade", "fee_switch", "token_unlock", "bridge_incident", "governance_vote", "chain_reorg"],
    "business_driver_transforms": ["value_capture", "supply_schedule", "fee_flow", "dependency_risk"],
    "valuation_methods": ["fee_to_token_holder_flow", "fully_diluted_versus_circulating", "cost_of_security"],
    "peer_dimensions": ["consensus_mechanism", "value_capture_mechanism", "supply_schedule_fixed_versus_inflationary"],
    "acceptance_fixtures": ["crypto_v1_golden"],
    "source_pack": ["chain_state", "contract_source_and_version", "governance_record"]
  }'::jsonb,
  'active', TIMESTAMPTZ '2026-08-11T00:00:00Z', 'migration-113',
  'Revision 1. canonical/04 §5 Crypto. The subject is a protocol and its token, not a listed company that touches crypto; the guard widens to Token for exactly that reason. No measurement rules: supply, emission and fees are on-chain facts and world.numeric_fact holds none of them.'
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
  ('value_capture', 'mix', 'Protocol versus token value capture',
   'The mechanism, if any, by which protocol activity reaches token holders.',
   'contract source at the deployed version plus the governance record that set it',
   'multiyear',
   'Decides whether any amount of usage is relevant to the token at all.',
   'A fee switch changes this the moment it activates, with no transition.',
   'Governance can add or remove capture, so the mechanism is a decision rather than a property.',
   'Announced intentions to route fees are not the same as deployed code that does.',
   'revenue', 'increases'),

  ('supply_schedule', 'funding', 'Supply and emission schedule',
   'Circulating and fully diluted supply, the emission rate, and the unlock calendar.',
   'chain state for supply and emission; the unlock calendar from the allocation record',
   'multiyear',
   'Scheduled supply is the most predictable sell pressure in the asset class.',
   'Unlock dates are published years ahead and still repriced only as they arrive.',
   'Emission that is trivial in a rising market is the dominant flow in a falling one.',
   'Circulating supply definitions differ by data provider, and the differences are large.',
   'price', 'decreases'),

  ('fee_flow', 'revenue', 'Fee and revenue distribution',
   'Protocol fees earned, and the split between holders, validators, treasury and burn.',
   'chain state for fees; the split from the contract at its deployed version',
   'quarterly',
   'The split, not the total, is what a holder has a claim on.',
   'Fees are observable per block; a split change requires an upgrade and is discrete.',
   'Fee levels are demand-driven and collapse together across a chain in a downturn.',
   'Fee revenue is often reported gross of the validator share that never reaches holders.',
   'fcf', 'increases'),

  ('dependency_risk', 'liquidity', 'Collateral, bridge and oracle dependency',
   'External systems the protocol relies on for collateral valuation, cross-chain assets or price data.',
   'contract source for the dependency set; incident record for how each has failed',
   'multiyear',
   'A dependency failure can be total and instantaneous in a way an operating business rarely faces.',
   'Risk accumulates silently and realises at once.',
   'Dependencies that are safe under normal liquidity are the transmission path in a crisis.',
   'The dependency set is only as complete as the contract reading behind it.',
   'fcf', 'decreases')
) AS driver(driver_key, chain_stage, display_name, definition, source_requirement, horizon,
            sensitivity_note, lag_note, regime_note, uncertainty_note,
            affects_stage, affects_direction)
WHERE playbook.playbook_key = 'crypto' AND playbook.revision_no = 1
ON CONFLICT DO NOTHING;
`;
