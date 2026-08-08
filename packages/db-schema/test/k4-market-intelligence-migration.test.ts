import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (relativePath: string) => {
  const url = new URL(relativePath, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

const indexSource = source('../src/index.ts');
const issuerRuleSource = source('../src/migrations/088_issuer_playbook_measurement_rule.ts');
const ledgerSource = source('../src/migrations/089_k4_market_intelligence_ledger.ts');
const migrations = [
  ['088_issuer_playbook_measurement_rule', issuerRuleSource],
  ['089_k4_market_intelligence_ledger', ledgerSource],
] as const;

describe('K4 Task 1 migrations — forward-only registration', () => {
  it('registers 088 and 089 after 087 in dependency order', () => {
    const ids = [
      '087_sector_playbook',
      '088_issuer_playbook_measurement_rule',
      '089_k4_market_intelligence_ledger',
    ];
    const positions = ids.map((id) => indexSource.indexOf(`id: '${id}'`));
    assert.ok(
      positions.every((position) => position >= 0),
      `missing migration: ${positions}`,
    );
    assert.ok(positions[0]! < positions[1]! && positions[1]! < positions[2]!);
  });

  for (const [id, sql] of migrations) {
    it(`${id} is additive DDL`, () => {
      assert.notEqual(sql, '', `${id} source is missing`);
      assert.doesNotMatch(sql, /\b(?:DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE|DELETE\s+FROM)\b/i);
      assert.equal(sql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi), null);
    });
  }
});

describe('088 issuer playbook and executable measurement rules', () => {
  it('moves open semiconductor security assignments to exact issuer identities', () => {
    assert.match(
      issuerRuleSource,
      /ADD COLUMN IF NOT EXISTS security_issuer_identity_id BIGINT[\s\S]*REFERENCES core\.security_issuer_identity/,
    );
    assert.match(issuerRuleSource, /playbook_key = 'semiconductor'/);
    assert.match(issuerRuleSource, /identity\.security_entity_id = assignment\.entity_id/);
    assert.match(issuerRuleSource, /identity\.issuer_entity_id/);
    assert.match(issuerRuleSource, /UPDATE governance\.playbook_assignment[\s\S]*valid_to/);
    assert.match(issuerRuleSource, /subject_type IS DISTINCT FROM 'Company'/);
  });

  it('fails closed when an open security assignment has no exact issuer identity', () => {
    assert.match(
      issuerRuleSource,
      /IF EXISTS \([\s\S]*playbook_key = 'semiconductor'[\s\S]*entity_type = 'Stock'[\s\S]*NOT EXISTS \([\s\S]*core\.security_issuer_identity[\s\S]*RAISE EXCEPTION 'migration 088 cannot resolve open security playbook assignment'/,
    );
  });

  it('enforces exact rule revision supersession', () => {
    assert.match(
      issuerRuleSource,
      /CREATE OR REPLACE FUNCTION governance\.validate_exact_revision_chain/,
    );
    assert.match(
      issuerRuleSource,
      /business_driver_measurement_rule_exact_revision_chain[\s\S]*BEFORE INSERT ON governance\.business_driver_measurement_rule/,
    );
    assert.match(issuerRuleSource, /prior_revision IS DISTINCT FROM NEW\.revision_no - 1/);
    assert.match(issuerRuleSource, /prior_key IS DISTINCT FROM new_key/);
  });

  it('resolves a security through the exact temporal identity to issuer rules', () => {
    assert.match(
      issuerRuleSource,
      /CREATE OR REPLACE VIEW governance\.security_playbook_measurement_rule_current_v2/,
    );
    for (const column of [
      'security_entity_id',
      'issuer_entity_id',
      'security_issuer_identity_id',
      'sector_playbook_id',
      'revision_no',
      'business_driver_id',
      'driver_key',
      'business_driver_measurement_rule_id',
      'rule_key',
      'rule_revision_no',
    ]) {
      assert.match(issuerRuleSource, new RegExp(`\\b${column}\\b`), `${column} is not resolved`);
    }
    assert.match(issuerRuleSource, /identity\.valid_from <= assignment\.valid_from/);
    assert.match(issuerRuleSource, /identity\.known_from <= assignment\.known_at/);
  });

  it('stores every executable measurement-rule input and admits only PIT A/B/C', () => {
    for (const column of [
      'input_concept_selectors',
      'comparison_method',
      'output_unit',
      'direction_policy',
      'materiality_policy',
      'minimum_history_observations',
      'allowed_pit_classes',
      'score_component_formula_inputs',
    ]) {
      assert.match(issuerRuleSource, new RegExp(`\\b${column}\\b`), `${column} is missing`);
    }
    assert.match(
      issuerRuleSource,
      /allowed_pit_classes <@ ARRAY\['PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'\]/,
    );
    for (const component of [
      'evidence_confidence',
      'relation_strength',
      'materiality',
      'transmission',
      'direction',
      'lag',
      'market_reflection',
      'model_uncertainty',
    ]) {
      assert.match(issuerRuleSource, new RegExp(`'${component}'`), `${component} is not required`);
    }
  });

  it('seeds inventory, fixed-cost/PPE, and capex rule revisions', () => {
    for (const rule of ['inventory_yoy', 'net_ppe_yoy', 'capex_yoy']) {
      assert.match(issuerRuleSource, new RegExp(`'${rule}'`), `${rule} is not seeded`);
    }
    for (const driver of ['inventory_position', 'fab_fixed_cost', 'capex_cycle']) {
      assert.match(issuerRuleSource, new RegExp(`'${driver}'`), `${driver} is not bound`);
    }
  });
});

describe('089 append-only K4 market-intelligence ledgers', () => {
  it('creates every K4 revision and citation ledger', () => {
    for (const table of [
      'expectation_revision',
      'surprise_revision',
      'valuation_estimate_revision',
      'impact_evaluation_revision',
      'impact_evaluation_evidence',
      'impact_path_step_exposure_citation',
      'impact_outcome_revision',
    ]) {
      assert.match(ledgerSource, new RegExp(`CREATE TABLE IF NOT EXISTS analytics\\.${table}\\b`));
      assert.match(
        ledgerSource,
        new RegExp(`BEFORE UPDATE OR DELETE ON analytics\\.${table}\\b`),
        `${table} is mutable`,
      );
    }
  });

  it('keeps valuations range-only and outcomes on +1/+5/+20 sessions', () => {
    assert.match(ledgerSource, /lower_estimate\s+NUMERIC NOT NULL/);
    assert.match(ledgerSource, /upper_estimate\s+NUMERIC NOT NULL/);
    assert.match(ledgerSource, /upper_estimate >= lower_estimate/);
    assert.doesNotMatch(ledgerSource, /^\s*point_estimate\s+NUMERIC\b/m);
    assert.match(ledgerSource, /horizon_sessions IN \(1, 5, 20\)/);
  });

  it('records only the six explicit evaluation dispositions', () => {
    for (const disposition of [
      'accepted',
      'missing_identity',
      'no_pit_evidence',
      'unsupported_measurement',
      'ambiguous_driver_attribution',
      'no_recent_observation',
    ]) {
      assert.match(ledgerSource, new RegExp(`'${disposition}'`));
    }
    assert.match(
      ledgerSource,
      /evaluation_disposition = 'accepted'[\s\S]*impact_exposure_revision_id IS NOT NULL[\s\S]*evaluation_disposition <> 'accepted'[\s\S]*impact_exposure_revision_id IS NULL/,
    );
    assert.match(ledgerSource, /reason_detail IS NOT NULL/);
    assert.match(ledgerSource, /DEFERRABLE INITIALLY DEFERRED/);
  });

  it('fails exposure sealing closed on missing citations, mixed units, or PIT D/E', () => {
    assert.match(
      ledgerSource,
      /CREATE OR REPLACE FUNCTION analytics\.guard_k4_impact_exposure_write/,
    );
    for (const citation of [
      'sector_playbook_id',
      'business_driver_id',
      'business_driver_measurement_rule_id',
      'information_set_id',
      'derivation_id',
      'security_issuer_identity_id',
    ]) {
      assert.match(
        ledgerSource,
        new RegExp(`evaluation\\.${citation}`),
        `${citation} is unchecked`,
      );
    }
    assert.match(
      ledgerSource,
      /pit_quality_class NOT IN \(\s*'PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'/,
    );
    assert.match(ledgerSource, /fact\.unit IS DISTINCT FROM evaluation\.measurement_unit/);
    assert.match(ledgerSource, /p_exposure_unit IS DISTINCT FROM evaluation\.measurement_unit/);
    assert.match(ledgerSource, /v_component_count <> 8/);
    assert.match(ledgerSource, /count\(DISTINCT evidence\.numeric_fact_id\)/);
  });

  it('requires an exact issuer playbook assignment at AIS cutoffs', () => {
    assert.match(ledgerSource, /JOIN governance\.playbook_assignment assignment/);
    assert.match(ledgerSource, /assignment\.entity_id = evaluation\.issuer_entity_id/);
    assert.match(ledgerSource, /assignment\.sector_playbook_id = evaluation\.sector_playbook_id/);
    assert.match(
      ledgerSource,
      /assignment\.security_issuer_identity_id IS NULL[\s\S]*assignment\.security_issuer_identity_id =\s*evaluation\.security_issuer_identity_id/,
    );
    assert.match(ledgerSource, /assignment\.valid_from <= information_set\.valid_cutoff/);
    assert.match(
      ledgerSource,
      /assignment\.valid_to IS NULL[\s\S]*assignment\.valid_to > information_set\.valid_cutoff/,
    );
    assert.match(ledgerSource, /assignment\.known_at <= information_set\.system_known_cutoff/);
  });

  it('binds qualifying evidence to issuer, selectors, periods, and derivation inputs', () => {
    assert.match(ledgerSource, /fact\.entity_id IS DISTINCT FROM evaluation\.issuer_entity_id/);
    assert.match(ledgerSource, /jsonb_array_elements\(rule\.input_concept_selectors\)/);
    assert.match(ledgerSource, /selector ->> 'concept_namespace' = fact\.concept_namespace/);
    assert.match(ledgerSource, /selector -> 'concept_keys' \? fact\.concept_key/);
    assert.match(
      ledgerSource,
      /knowledge\.derivation_step[\s\S]*knowledge\.derivation_input[\s\S]*input\.numeric_fact_id = fact\.numeric_fact_id/,
    );
    assert.match(ledgerSource, /comparison_method = 'period_end_year_over_year_delta'/);
    assert.match(ledgerSource, /comparison_method = 'duration_year_over_year_delta'/);
    assert.match(ledgerSource, /comparison_fact\.period_start \+ interval '1 year'/);
    assert.match(ledgerSource, /comparison_fact\.period_end \+ interval '1 year'/);
    assert.match(ledgerSource, /input_role = 'current'/);
    assert.match(ledgerSource, /input_role = 'comparison'/);
  });

  it('rejects evidence appended after an accepted exposure is sealed', () => {
    assert.match(
      ledgerSource,
      /guard_impact_evaluation_evidence[\s\S]*impact_exposure_revision[\s\S]*exposure_state = 'sealed'[\s\S]*cannot append evidence/,
    );
  });

  it('enforces playbook, rule, and PIT-quality knowledge at AIS cutoffs', () => {
    for (const temporalCheck of [
      /playbook\.effective_from <= information_set\.valid_cutoff/,
      /playbook\.effective_to IS NULL[\s\S]*playbook\.effective_to > information_set\.valid_cutoff/,
      /playbook\.known_at <= information_set\.system_known_cutoff/,
      /measurement_rule\.effective_from <= information_set\.valid_cutoff/,
      /measurement_rule\.effective_to IS NULL[\s\S]*measurement_rule\.effective_to > information_set\.valid_cutoff/,
      /measurement_rule\.known_at <= information_set\.system_known_cutoff/,
      /quality\.known_at > information_set\.system_known_cutoff/,
    ]) {
      assert.match(ledgerSource, temporalCheck);
    }
  });

  it('keeps diagnostic ledgers pipeline-only and serves filtered accepted evidence', () => {
    assert.match(
      ledgerSource,
      /CREATE OR REPLACE VIEW analytics\.accepted_impact_evaluation_v1[\s\S]*evaluation_disposition = 'accepted'[\s\S]*exposure_state = 'sealed'/,
    );
    assert.match(
      ledgerSource,
      /CREATE OR REPLACE VIEW analytics\.accepted_impact_evaluation_evidence_v1[\s\S]*PIT_A_NATIVE_VINTAGE[\s\S]*PIT_B_VERSIONED_ARTIFACT[\s\S]*PIT_C_OUR_ARCHIVE/,
    );
    assert.match(
      ledgerSource,
      /REVOKE SELECT ON[\s\S]*analytics\.impact_evaluation_revision,[\s\S]*analytics\.impact_evaluation_evidence[\s\S]*FROM si_readapi/,
    );
    assert.match(
      ledgerSource,
      /GRANT SELECT ON[\s\S]*analytics\.accepted_impact_evaluation_v1,[\s\S]*analytics\.accepted_impact_evaluation_evidence_v1[\s\S]*TO si_readapi/,
    );
  });

  it('enforces exact revision chains on every K4 versioned ledger', () => {
    for (const trigger of [
      'expectation_revision_exact_revision_chain',
      'surprise_revision_exact_revision_chain',
      'valuation_estimate_revision_exact_revision_chain',
      'impact_evaluation_revision_exact_revision_chain',
      'impact_outcome_revision_exact_revision_chain',
    ]) {
      assert.match(ledgerSource, new RegExp(`${trigger}[\\s\\S]*BEFORE INSERT`));
    }
  });
});
