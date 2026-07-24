import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cryptoServingViewsMigrationSql } from '../src/migrations/051_crypto_serving_views.ts';

const sql = cryptoServingViewsMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P6-6 crypto serving views migration', () => {
  it('registers sanitized entity, event, company-link, and risk views', () => {
    assert.match(indexSource, /id: '051_crypto_serving_views'/);
    assert.match(sql, /CREATE SCHEMA IF NOT EXISTS crypto_serving/);
    for (const view of [
      'entity_revision',
      'event_revision',
      'core_relation_revision',
      'risk_exposure_revision',
    ]) {
      assert.match(sql, new RegExp(`CREATE OR REPLACE VIEW crypto_serving\\.${view}`));
    }
  });

  it('exposes PIT lineage and explicit crypto-company joins without execution capabilities', () => {
    assert.match(sql, /source_revision_id/);
    assert.match(sql, /known_at/);
    assert.match(sql, /summary_text AS summary/);
    assert.match(sql, /channel\.channel_class AS channel_key/);
    assert.match(sql, /exposure\.exposure_state AS lifecycle_state/);
    assert.match(sql, /CASE exposure\.sign[\s\S]*WHEN 'negative' THEN -1/);
    assert.match(sql, /exposure\.valid_from/);
    assert.match(sql, /shock\.risk_shock_id = exposure\.risk_shock_id/);
    assert.match(sql, /revision\.valid_from <= relation\.known_at/);
    assert.match(sql, /revision\.valid_from IS NULL OR revision\.valid_from <= relation\.known_at/);
    assert.match(sql, /revision\.valid_until > relation\.known_at/);
    assert.match(sql, /revision\.valid_from <= exposure\.known_at/);
    assert.match(sql, /revision\.valid_from IS NULL OR revision\.valid_from <= exposure\.known_at/);
    assert.match(sql, /revision\.valid_until > exposure\.known_at/);
    assert.match(sql, /core_entity_key/);
    assert.match(sql, /treasury_held_by_company/);
    assert.match(sql, /GRANT SELECT ON[\s\S]*TO si_readapi/);
    assert.doesNotMatch(sql, /GRANT\s+(?:INSERT|UPDATE|DELETE)/i);
    assert.doesNotMatch(sql, /execution_order|\bbroker\b|\bleverage\b/i);
  });
});
