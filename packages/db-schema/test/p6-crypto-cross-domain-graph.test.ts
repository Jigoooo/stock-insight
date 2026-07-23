import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cryptoCrossDomainGraphMigrationSql } from '../src/migrations/050_crypto_cross_domain_graph.ts';

const sql = cryptoCrossDomainGraphMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P6-5 crypto cross-domain graph migration', () => {
  it('registers crypto-core, metric, geo, macro, and world-event link ledgers', () => {
    assert.match(indexSource, /id: '050_crypto_cross_domain_graph'/);
    assert.match(sql, /CREATE SCHEMA IF NOT EXISTS cross_domain/);
    for (const table of [
      'crypto_core_relation_revision',
      'crypto_core_metric_revision',
      'crypto_geo_relation_revision',
      'crypto_macro_relation_revision',
      'crypto_world_event_link_revision',
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS cross_domain\\.${table}`));
    }
  });

  it('models corporate treasury, issuer, reserve, revenue, mining, custody, and ETF links', () => {
    assert.match(
      sql,
      /relation_kind IN \([\s\S]*'issued_by_company'[\s\S]*'treasury_held_by_company'[\s\S]*'reserve_managed_by_company'[\s\S]*'mined_by_company'[\s\S]*'custodied_by_company'[\s\S]*'revenue_exposure_company'[\s\S]*'etf_underlying_exposure'/,
    );
    assert.match(sql, /v_core_type NOT IN \('Company','Stock','ETF','Fund','LegalEntity'/);
    assert.match(
      sql,
      /geo_relation_kind IN \([\s\S]*'issuer_jurisdiction'[\s\S]*'reserve_custody_location'[\s\S]*'mining_operation'/,
    );
    assert.match(
      sql,
      /macro_relation_kind IN \([\s\S]*'governed_by_regulation'[\s\S]*'sensitive_to_metric'[\s\S]*'exposed_to_risk_factor'/,
    );
  });

  it('keeps economic magnitude separate from confidence with PIT provenance and append-only revisions', () => {
    assert.match(sql, /economic_magnitude\s+NUMERIC/);
    assert.match(sql, /epistemic_confidence\s+NUMERIC/);
    assert.match(sql, /source_revision_id\s+BIGINT NOT NULL REFERENCES ingestion\.source_revision/);
    assert.match(sql, /known_at\s+TIMESTAMPTZ NOT NULL/);
    for (const table of [
      'crypto_core_relation_revision',
      'crypto_core_metric_revision',
      'crypto_geo_relation_revision',
      'crypto_macro_relation_revision',
      'crypto_world_event_link_revision',
    ]) {
      assert.match(sql, new RegExp(`${table}_append_only`));
    }
    assert.doesNotMatch(sql, /order|broker|leverage/i);
  });
});
