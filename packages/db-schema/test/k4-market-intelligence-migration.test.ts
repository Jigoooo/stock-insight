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
      /pit_quality_class NOT IN \('PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'\)/,
    );
    assert.match(ledgerSource, /fact\.unit IS DISTINCT FROM evaluation\.measurement_unit/);
    assert.match(
      ledgerSource,
      /NEW\.economic_magnitude_unit IS DISTINCT FROM evaluation\.measurement_unit/,
    );
    assert.match(ledgerSource, /v_component_count <> 8/);
    assert.match(ledgerSource, /count\(DISTINCT evidence\.numeric_fact_id\)/);
  });
});
