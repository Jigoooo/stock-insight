export const sectorPlaybookMigrationSql = `
-- Sector playbook, adapter contract and business drivers (canonical/04 §1–§3).
--
-- WHAT REQ-DOM-001 ACTUALLY ASKS FOR: "LLM이 매 실행마다 이 업종에서 무엇이
-- 중요한가를 새로 발명하지 않는다." A model asked to analyse a chip company will
-- produce a plausible KPI list every time and a different one each time, and
-- nothing downstream can tell that the list moved. The fix is not a better prompt
-- but a versioned definition the analysis has to cite, so a changed KPI set is a
-- new revision somebody made rather than a sampling artefact.
--
-- WHY ASSIGNMENT IS A SEPARATE TABLE FROM THE PLAYBOOK. A playbook applies to a
-- company because of what the company does; an industry code is evidence of that,
-- not proof. Measured 2026-08-08 the live taxonomy makes the point on its own:
-- Samsung Electronics sits under KSIC 264, communications and broadcasting
-- equipment, while Hanwha Systems and Intellian sit under 26x beside it. Attaching
-- a semiconductor playbook by code alone would exclude the largest memory maker in
-- the universe and include a defence electronics firm. So assignment carries its
-- own basis and can disagree with the code, in writing.
--
-- WHY DRIVERS ARE DEFINED HERE AND NOT MEASURED HERE. canonical/04 §3 gives each
-- driver a source, definition, horizon, sensitivity, lag, regime and uncertainty.
-- Those are properties of the driver as a concept — what ASP means for a memory
-- maker, over what horizon it moves margin. Putting a company's *value* for a
-- driver in the same row would conflate the definition with an observation, and
-- the observation is K4's exposure work, which is not allowed to start until this
-- exists precisely so it has something to cite.

CREATE TABLE IF NOT EXISTS governance.sector_playbook (
    sector_playbook_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    playbook_key TEXT NOT NULL
      CHECK (playbook_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),

    display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),

    -- canonical/04 §1's contents. Each is a jsonb document rather than a set of
    -- columns because their shapes differ per sector and the freeze names the
    -- headings, not the fields.
    value_chain            JSONB NOT NULL CHECK (jsonb_typeof(value_chain) = 'array'),
    unit_of_analysis       TEXT  NOT NULL CHECK (length(btrim(unit_of_analysis)) > 0),
    key_indicators         JSONB NOT NULL CHECK (jsonb_typeof(key_indicators) = 'array'),
    financial_bridge       JSONB NOT NULL CHECK (jsonb_typeof(financial_bridge) = 'array'),
    catalysts_and_risks    JSONB NOT NULL CHECK (jsonb_typeof(catalysts_and_risks) = 'array'),
    valuation_methods      JSONB NOT NULL CHECK (jsonb_typeof(valuation_methods) = 'array'),
    peer_dimensions        JSONB NOT NULL CHECK (jsonb_typeof(peer_dimensions) = 'array'),
    source_requirements    JSONB NOT NULL CHECK (jsonb_typeof(source_requirements) = 'array'),

    -- canonical/04 §2's adapter contract. All eight interfaces must be named, or
    -- the adapter is partial and the analysis will fall back to inventing the
    -- missing half without saying so.
    adapter_interfaces JSONB NOT NULL CHECK (jsonb_typeof(adapter_interfaces) = 'object'),

    -- A definition change is a new revision pointing at the one it replaces
    -- (canonical/04 §6), so a comparison spanning the change can be detected
    -- rather than silently computed.
    supersedes_sector_playbook_id BIGINT
      REFERENCES governance.sector_playbook(sector_playbook_id),
    playbook_state TEXT NOT NULL DEFAULT 'active'
      CHECK (playbook_state IN ('draft', 'active', 'superseded', 'retired')),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to   TIMESTAMPTZ,
    known_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    authored_by TEXT NOT NULL CHECK (length(btrim(authored_by)) > 0),
    notes TEXT,

    UNIQUE (playbook_key, revision_no),

    CONSTRAINT sector_playbook_revision_chain CHECK (
      (revision_no = 1 AND supersedes_sector_playbook_id IS NULL)
      OR (revision_no > 1 AND supersedes_sector_playbook_id IS NOT NULL)
    ),
    CONSTRAINT sector_playbook_interval_ordered CHECK (
      effective_to IS NULL OR effective_to > effective_from
    ),

    -- The eight interfaces of canonical/04 §2, enforced rather than described.
    -- An adapter missing one is the case REQ-DOM-001 exists to prevent: the model
    -- fills the gap and nothing records that it did.
    CONSTRAINT sector_playbook_adapter_complete CHECK (
      adapter_interfaces ?& ARRAY[
        'identity_extensions', 'metric_concepts', 'world_state_event_types',
        'business_driver_transforms', 'valuation_methods', 'peer_dimensions',
        'acceptance_fixtures', 'source_pack'
      ]
    ),

    -- A playbook with no indicators is not a playbook; it is a name.
    CONSTRAINT sector_playbook_states_indicators CHECK (
      jsonb_array_length(key_indicators) > 0 AND jsonb_array_length(financial_bridge) > 0
    )
);

COMMENT ON TABLE governance.sector_playbook IS
  'Versioned per-sector analysis definition an analysis must cite (REQ-DOM-001).';

-- ── which companies a playbook governs ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance.playbook_assignment (
    playbook_assignment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sector_playbook_id BIGINT NOT NULL
      REFERENCES governance.sector_playbook(sector_playbook_id),
    entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),

    -- How the company came to be governed by this playbook. 'taxonomy' means an
    -- industry code carried it; 'curated' means somebody decided against or
    -- beyond the code and has to say why.
    assignment_basis TEXT NOT NULL
      CHECK (assignment_basis IN ('taxonomy', 'curated')),
    taxonomy_node_id BIGINT REFERENCES core.taxonomy_node(taxonomy_node_id),
    rationale TEXT NOT NULL CHECK (length(btrim(rationale)) > 0),

    valid_from TIMESTAMPTZ NOT NULL,
    valid_to   TIMESTAMPTZ,
    known_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by TEXT NOT NULL CHECK (length(btrim(assigned_by)) > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(metadata) = 'object'),

    UNIQUE (sector_playbook_id, entity_id, valid_from),

    -- A taxonomy assignment that names no node cannot be checked against the
    -- taxonomy, which is the only thing that makes it a taxonomy assignment.
    CONSTRAINT playbook_assignment_taxonomy_names_node CHECK (
      assignment_basis <> 'taxonomy' OR taxonomy_node_id IS NOT NULL
    ),
    CONSTRAINT playbook_assignment_interval_ordered CHECK (
      valid_to IS NULL OR valid_to > valid_from
    )
);

CREATE INDEX IF NOT EXISTS ix_playbook_assignment_entity
  ON governance.playbook_assignment (entity_id, valid_from DESC);

COMMENT ON TABLE governance.playbook_assignment IS
  'Which entities a sector playbook governs, and on what basis (an industry code is evidence, not proof).';

-- ── the company economic model, as definitions ───────────────────────────────

CREATE TABLE IF NOT EXISTS governance.business_driver (
    business_driver_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sector_playbook_id BIGINT NOT NULL
      REFERENCES governance.sector_playbook(sector_playbook_id),
    driver_key TEXT NOT NULL CHECK (driver_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),

    -- Where the driver sits in canonical/04 §3's chain:
    --   Demand × Price × Mix → Revenue − Cost → Margin − Capital → FCF
    chain_stage TEXT NOT NULL CHECK (chain_stage IN (
      'demand', 'price', 'mix', 'revenue', 'variable_cost', 'fixed_cost',
      'margin', 'working_capital', 'capex', 'tax_interest', 'fcf'
    )),
    display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
    definition TEXT NOT NULL CHECK (length(btrim(definition)) > 0),

    -- canonical/04 §3: each driver carries source, definition, horizon,
    -- sensitivity, lag, regime and uncertainty. A driver missing any of them is
    -- a name for something nobody can measure or falsify.
    source_requirement TEXT NOT NULL CHECK (length(btrim(source_requirement)) > 0),
    horizon TEXT NOT NULL CHECK (horizon IN ('intraquarter', 'quarterly', 'annual', 'multiyear')),
    sensitivity_note TEXT NOT NULL CHECK (length(btrim(sensitivity_note)) > 0),
    lag_note TEXT NOT NULL CHECK (length(btrim(lag_note)) > 0),
    regime_note TEXT NOT NULL CHECK (length(btrim(regime_note)) > 0),
    uncertainty_note TEXT NOT NULL CHECK (length(btrim(uncertainty_note)) > 0),

    -- The typed bridge of canonical/04 §4: which financial line this driver moves
    -- and in which direction. Direction is stated because an exposure that cannot
    -- name a sign is the thing run-portfolio-snapshot.ts:18 refuses to invent.
    affects_stage TEXT CHECK (affects_stage IN (
      'demand', 'price', 'mix', 'revenue', 'variable_cost', 'fixed_cost',
      'margin', 'working_capital', 'capex', 'tax_interest', 'fcf'
    )),
    affects_direction TEXT CHECK (affects_direction IN ('increases', 'decreases', 'ambiguous')),

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (sector_playbook_id, driver_key),

    -- A bridge that names a target with no direction says a driver matters
    -- without saying which way, which is where K4 would have to guess.
    CONSTRAINT business_driver_bridge_complete CHECK (
      (affects_stage IS NULL AND affects_direction IS NULL)
      OR (affects_stage IS NOT NULL AND affects_direction IS NOT NULL)
    ),
    -- A driver that moves its own stage is a definition eating itself.
    CONSTRAINT business_driver_not_self_referential CHECK (
      affects_stage IS NULL OR affects_stage <> chain_stage
    )
);

COMMENT ON TABLE governance.business_driver IS
  'The driver definitions of canonical/04 §3 and the typed bridge of §4; values are observations and belong elsewhere.';

-- What an analysis can cite, resolved. A KPI selection that cannot name a row
-- here has invented its own, which is what REQ-DOM-001 forbids.
CREATE OR REPLACE VIEW governance.entity_playbook_current_v1 AS
SELECT a.entity_id,
       p.sector_playbook_id,
       p.playbook_key,
       p.revision_no,
       p.display_name,
       p.key_indicators,
       p.peer_dimensions,
       p.valuation_methods,
       a.assignment_basis,
       a.rationale
  FROM governance.playbook_assignment a
  JOIN governance.sector_playbook p ON p.sector_playbook_id = a.sector_playbook_id
 WHERE a.valid_to IS NULL
   AND p.playbook_state = 'active'
   AND p.effective_to IS NULL;

COMMENT ON VIEW governance.entity_playbook_current_v1 IS
  'The playbook revision an analysis of this entity must cite (REQ-DOM-001).';

-- GRANTS: pipeline roles write and read; the read API sees the resolved view.
-- The app roles get nothing — a playbook is an input to analysis, not a rendering
-- surface, so the boot digest does not move for this migration.
GRANT SELECT, INSERT, UPDATE ON
  governance.sector_playbook, governance.playbook_assignment, governance.business_driver
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON
  governance.sector_playbook, governance.playbook_assignment, governance.business_driver,
  governance.entity_playbook_current_v1
  TO si_readapi;
GRANT SELECT ON governance.entity_playbook_current_v1
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;

-- ── semiconductor playbook, revision 1 ───────────────────────────────────────
--
-- Contents are canonical/04 §5's Semiconductor / AI Infrastructure minimums,
-- expanded into §1's headings. Nothing here is a market view: it is a list of
-- what has to be looked at, which is the thing REQ-DOM-001 stops the model
-- reinventing. Seeded in the migration rather than by a job so that revision 1 is
-- checksummed — a citable revision that a later run can rewrite is not a
-- revision.

INSERT INTO governance.sector_playbook (
  playbook_key, revision_no, display_name, value_chain, unit_of_analysis,
  key_indicators, financial_bridge, catalysts_and_risks, valuation_methods,
  peer_dimensions, source_requirements, adapter_interfaces,
  playbook_state, effective_from, authored_by, notes
) VALUES (
  'semiconductor', 1, 'Semiconductor / AI Infrastructure',
  '["EDA and IP", "fabless design", "foundry", "OSAT assembly and test", "memory", "equipment and materials", "module and system integration", "hyperscale and enterprise demand"]'::jsonb,
  'a product generation on a process node, sold into a named customer programme',
  '[
    {"key":"product_generation_node","kind":"leading","why":"canonical/04 §5: product generation/node/interface. A part number without its node and interface cannot be compared across a transition."},
    {"key":"design_win_qualification","kind":"leading","why":"canonical/04 §5: design win / qualification. Revenue follows qualification by quarters, so a win is the earliest observable that is not a forecast."},
    {"key":"capacity_wafer_fab_hbm","kind":"leading","why":"canonical/04 §5: capacity/wafer/fab/HBM constraints. Supply is the binding constraint in an upcycle and the stranded cost in a down one."},
    {"key":"customer_product_concentration","kind":"lagging","why":"canonical/04 §5: customer/product concentration. Concentration converts a single programme decision into a company-level revenue event."},
    {"key":"backlog_commitment_quality","kind":"leading","why":"canonical/04 §5: backlog/commitment quality. Backlog that is cancellable without penalty is not the same claim as a prepaid commitment."},
    {"key":"technology_transition_substitution","kind":"leading","why":"canonical/04 §5: technology transition/competitive substitution. A node or interface transition can end a product line while its current quarter still looks healthy."}
  ]'::jsonb,
  '[
    {"from":"capacity_wafer_fab_hbm","to":"revenue","how":"available supply caps units at any price"},
    {"from":"technology_transition_substitution","to":"price","how":"a superseded generation prices down before it stops selling"},
    {"from":"customer_product_concentration","to":"revenue","how":"one programme decision moves the whole line"},
    {"from":"design_win_qualification","to":"demand","how":"qualified programmes become volume with a lag"},
    {"from":"backlog_commitment_quality","to":"working_capital","how":"non-binding backlog turns into inventory rather than into cash"}
  ]'::jsonb,
  '[
    {"kind":"catalyst","key":"node_ramp","note":"a new node reaching volume yield"},
    {"kind":"catalyst","key":"hbm_qualification","note":"qualification into an accelerator programme"},
    {"kind":"risk","key":"inventory_correction","note":"channel inventory unwinding against reported backlog"},
    {"kind":"risk","key":"export_control","note":"a rule change removing an addressable market outright"},
    {"kind":"risk","key":"capex_overhang","note":"fixed cost committed against demand that did not arrive"}
  ]'::jsonb,
  '[
    {"key":"ev_sales_cycle_adjusted","note":"cycle position must be stated; a trough multiple on trough sales is not a valuation"},
    {"key":"replacement_capacity","note":"what the installed capacity would cost to rebuild"},
    {"key":"dcf_with_cycle","note":"only with an explicit cycle assumption, since a single-path DCF hides the amplitude"}
  ]'::jsonb,
  '["node_and_interface_generation","memory_versus_logic","fabless_versus_idm_versus_foundry","end_market_mix","customer_concentration_band"]'::jsonb,
  '[
    {"key":"issuer_filings","why":"segment revenue and capacity commentary, with the segment definition attached"},
    {"key":"programme_disclosure","why":"design wins and qualifications are announced, not derivable"},
    {"key":"capacity_and_equipment","why":"capacity claims need a source outside the issuer to be worth anything"}
  ]'::jsonb,
  '{
    "identity_extensions": ["product_generation", "process_node", "interface_standard", "fab_site"],
    "metric_concepts": ["asp_per_unit", "wafer_starts", "utilisation", "bit_growth", "content_per_system"],
    "world_state_event_types": ["design_win", "qualification", "capacity_addition", "node_transition", "export_control_change"],
    "business_driver_transforms": ["demand_units", "asp", "product_mix", "wafer_cost", "fab_fixed_cost", "capex_cycle"],
    "valuation_methods": ["ev_sales_cycle_adjusted", "replacement_capacity", "dcf_with_cycle"],
    "peer_dimensions": ["node_and_interface_generation", "memory_versus_logic", "fabless_versus_idm_versus_foundry"],
    "acceptance_fixtures": ["semiconductor_v1_golden"],
    "source_pack": ["issuer_filings", "programme_disclosure", "capacity_and_equipment"]
  }'::jsonb,
  'active', TIMESTAMPTZ '2026-08-08T00:00:00Z', 'migration-087',
  'Revision 1. Contents are canonical/04 §5 expanded into §1 headings; it states what must be examined, never what to conclude.'
)
ON CONFLICT (playbook_key, revision_no) DO NOTHING;

-- ── drivers: canonical/04 §3's chain, with §4's typed bridge ─────────────────

INSERT INTO governance.business_driver (
  sector_playbook_id, driver_key, chain_stage, display_name, definition,
  source_requirement, horizon, sensitivity_note, lag_note, regime_note,
  uncertainty_note, affects_stage, affects_direction
)
SELECT p.sector_playbook_id, d.driver_key, d.chain_stage, d.display_name, d.definition,
       d.source_requirement, d.horizon, d.sensitivity_note, d.lag_note, d.regime_note,
       d.uncertainty_note, d.affects_stage, d.affects_direction
  FROM governance.sector_playbook p
 CROSS JOIN (VALUES
   ('demand_units', 'demand', 'Unit demand',
    'Units shipped into qualified programmes, counted at the generation that was sold.',
    'issuer segment disclosure, cross-checked against a customer programme announcement',
    'quarterly',
    'The largest single mover of revenue in a cycle; a 10% unit move is not a 10% revenue move because mix travels with it.',
    'Follows a design win by two to six quarters, so a win reported today prices a period that has not started.',
    'In an upcycle supply binds and units understate demand; in a correction channel inventory absorbs units and overstates it.',
    'Programme-level units are rarely disclosed; the number is usually inferred from segment revenue and ASP, and inherits both errors.',
    'revenue', 'increases'),

   ('asp', 'price', 'Average selling price',
    'Revenue divided by units for one generation, before any customer-specific credit.',
    'issuer disclosure where segmented; otherwise derived and marked as derived',
    'quarterly',
    'Moves margin faster than it moves revenue, because the marginal wafer cost is already committed.',
    'Contract pricing resets on its own schedule, so spot moves reach the reported number a quarter or two late.',
    'Memory ASP is set by a spot market; logic ASP is set by a contract. The same word means two different mechanics.',
    'Blended ASP across generations hides a mix shift and is the single easiest number to read backwards.',
    'margin', 'increases'),

   ('product_mix', 'mix', 'Generation and product mix',
    'The share of revenue by generation, interface and end market.',
    'issuer segment disclosure; a mix claim with no segment definition is not usable',
    'quarterly',
    'A mix shift can raise margin while both units and ASP fall, which is why the three are separate drivers.',
    'Shifts over the length of a node transition rather than within a quarter.',
    'During a transition the trailing mix is not a forecast of the forward mix under any regime.',
    'Segment definitions are restated more often than segment numbers, which is what canonical/04 §6 is about.',
    'margin', 'increases'),

   ('wafer_cost', 'variable_cost', 'Wafer and input cost',
    'Cost per good die, including yield loss at the current node.',
    'foundry pricing disclosure or issuer cost commentary; never a spot commodity print alone',
    'quarterly',
    'Yield is the dominant term early in a node and nearly irrelevant late in it.',
    'Yield learning is continuous, so the reported cost trails the current process state.',
    'A leading-edge ramp and a mature node behave as different cost structures entirely.',
    'Cost per good die is almost never disclosed; it is reconstructed, and the reconstruction is the estimate.',
    'margin', 'decreases'),

   ('fab_fixed_cost', 'fixed_cost', 'Fab and depreciation base',
    'Committed capacity cost that does not vary with units in the period.',
    'issuer capex and depreciation disclosure',
    'multiyear',
    'Sets the operating leverage in both directions and is the reason margin overshoots revenue in a cycle.',
    'Capex becomes depreciation over years, so today''s margin carries decisions taken well before it.',
    'An idle fab in a correction is the same cost as a full one, which is what makes the down leg violent.',
    'The split between fixed and variable is an accounting choice the issuer makes and rarely restates.',
    'margin', 'decreases'),

   ('capex_cycle', 'capex', 'Capacity investment',
    'Spending that adds or converts capacity, at the node it adds it to.',
    'issuer capex guidance plus equipment-side corroboration',
    'multiyear',
    'Determines supply two to three years out, which is the horizon most analysis silently omits.',
    'Announcement to production is measured in years, so the signal arrives long before the effect.',
    'Announced capex is cancellable in a downturn; the announcement and the spend are different facts.',
    'Capex is disclosed in aggregate while its effect is per node, so the allocation is inferred.',
    'fcf', 'decreases'),

   ('inventory_position', 'working_capital', 'Inventory and channel position',
    'Inventory held by the issuer and by the channel in front of it.',
    'issuer balance sheet plus any channel disclosure; channel inventory is usually absent',
    'quarterly',
    'A correction shows up here before it shows up in revenue.',
    'Channel inventory is disclosed late or not at all, so this leads reported revenue by a quarter or more.',
    'In a shortage inventory is a buffer; in a correction the same balance is a write-down waiting to happen.',
    'Channel inventory is the largest routinely unobserved quantity in the sector.',
    'fcf', 'decreases'),

   ('backlog_quality', 'demand', 'Backlog and commitment quality',
    'Ordered volume weighted by whether cancellation carries a penalty.',
    'issuer disclosure of backlog terms, not the headline backlog number',
    'quarterly',
    'Unweighted backlog and prepaid commitment differ by the entire cancellation option.',
    'Converts to revenue over the lead time, which itself moves with the cycle.',
    'In a shortage customers over-order across suppliers, so backlog counts the same demand more than once.',
    'Terms are disclosed far less often than the headline number, so the weighting is usually unavailable.',
    'revenue', 'increases')
 ) AS d(driver_key, chain_stage, display_name, definition, source_requirement, horizon,
        sensitivity_note, lag_note, regime_note, uncertainty_note,
        affects_stage, affects_direction)
 WHERE p.playbook_key = 'semiconductor' AND p.revision_no = 1
ON CONFLICT (sector_playbook_id, driver_key) DO NOTHING;
`;
