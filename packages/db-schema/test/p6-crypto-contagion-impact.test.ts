import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cryptoContagionImpactMigrationSql } from '../src/migrations/049_crypto_contagion_impact.ts';

const sql = cryptoContagionImpactMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P6-4 crypto contagion impact migration', () => {
  it('registers shock, channel, exposure, score, contagion, and liquidation ledgers', () => {
    assert.match(indexSource, /id: '049_crypto_contagion_impact'/);
    for (const table of [
      'risk_shock',
      'transmission_channel',
      'risk_exposure_revision',
      'risk_score_component',
      'contagion_edge_revision',
      'liquidation_observation',
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS crypto_analytics\\.${table}`));
    }
    assert.match(
      sql,
      /shock_type IN \([\s\S]*'bridge_failure'[\s\S]*'oracle_failure'[\s\S]*'stablecoin_depeg'[\s\S]*'liquidation_cascade'/,
    );
    assert.match(
      sql,
      /channel_class IN \([\s\S]*'reserve_backing'[\s\S]*'custody_chain'[\s\S]*'collateral_chain'/,
    );
  });

  it('separates economic magnitude from epistemic confidence and requires decomposition', () => {
    assert.match(sql, /economic_magnitude\s+NUMERIC/);
    assert.match(sql, /epistemic_confidence\s+NUMERIC/);
    assert.match(
      sql,
      /economic_magnitude IS NULL AND economic_magnitude_unit IS NULL[\s\S]*economic_magnitude IS NOT NULL[\s\S]*economic_magnitude_unit IS NOT NULL/,
    );
    assert.equal(
      (sql.match(/economic_magnitude IS NULL AND economic_magnitude_unit IS NULL/g) ?? []).length,
      2,
    );
    assert.equal((sql.match(/economic_magnitude >= 0/g) ?? []).length, 2);
    assert.match(sql, /component_kind IN \([\s\S]*'evidence_confidence'[\s\S]*'model_uncertainty'/);
    assert.match(sql, /requires the full eight-component/);
    assert.match(sql, /supersedes_risk_exposure_revision_id/);
    assert.match(sql, /retracted crypto risk exposure cannot be superseded/);
    assert.match(
      sql,
      /WHERE risk_exposure_revision_id = NEW\.supersedes_risk_exposure_revision_id\s+FOR UPDATE/,
    );
    assert.match(
      sql,
      /NEW\.exposure_state = 'retracted'[\s\S]*supersedes_risk_exposure_revision_id = OLD\.risk_exposure_revision_id[\s\S]*crypto risk exposure with a successor cannot be retracted/,
    );
    assert.match(sql, /supersedes_contagion_edge_revision_id/);
  });

  it('is PIT, append-only, provenance-bound, and execution-disconnected', () => {
    assert.match(sql, /source_revision_id\s+BIGINT NOT NULL REFERENCES ingestion\.source_revision/);
    assert.match(sql, /known_at\s+TIMESTAMPTZ NOT NULL/);
    assert.match(
      sql,
      /risk_exposure_revision[\s\S]*valid_from\s+TIMESTAMPTZ[\s\S]*valid_until\s+TIMESTAMPTZ/,
    );
    assert.match(
      sql,
      /NEW\.sign[\s\S]*NEW\.evidence_locator[\s\S]*NEW\.source_revision_id[\s\S]*NEW\.valid_from[\s\S]*NEW\.metadata[\s\S]*NEW\.created_at/,
    );
    for (const table of [
      'risk_shock',
      'transmission_channel',
      'risk_exposure_revision',
      'risk_score_component',
      'contagion_edge_revision',
      'liquidation_observation',
    ]) {
      assert.match(sql, new RegExp(`${table}_append_only`));
    }
    assert.doesNotMatch(sql, /order|broker|leverage/i);
  });
});
