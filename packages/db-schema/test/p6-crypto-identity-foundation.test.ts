import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cryptoIdentityFoundationMigrationSql } from '../src/migrations/046_crypto_identity_foundation.ts';

const sql = cryptoIdentityFoundationMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P6-1 crypto identity foundation migration', () => {
  it('registers a separate additive crypto identity module', () => {
    assert.match(indexSource, /id: '046_crypto_identity_foundation'/);
    assert.match(indexSource, /sql: cryptoIdentityFoundationMigrationSql/);
    assert.match(sql, /CREATE SCHEMA IF NOT EXISTS crypto_identity/);
    for (const table of [
      'entity',
      'entity_revision',
      'entity_alias',
      'identity_evidence',
      'core_crosswalk',
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS crypto_identity\\.${table}`));
    }
    assert.match(
      sql,
      /entity_kind IN \([\s\S]*'blockchain'[\s\S]*'l2'[\s\S]*'protocol'[\s\S]*'smart_contract'[\s\S]*'token'[\s\S]*'stablecoin'[\s\S]*'bridge'[\s\S]*'oracle'[\s\S]*'validator'[\s\S]*'exchange'[\s\S]*'custodian'[\s\S]*'wallet_cluster'/,
    );
  });

  it('is append-only, bitemporal, and source-revision anchored', () => {
    assert.match(sql, /source_revision_id\s+BIGINT NOT NULL REFERENCES ingestion\.source_revision/);
    assert.match(sql, /available_at\s+TIMESTAMPTZ NOT NULL/);
    assert.match(sql, /known_at\s+TIMESTAMPTZ NOT NULL/);
    assert.match(sql, /valid_from\s+TIMESTAMPTZ/);
    assert.match(sql, /valid_until\s+TIMESTAMPTZ/);
    assert.match(sql, /supersedes_crypto_entity_revision_id/);
    for (const table of [
      'entity',
      'entity_revision',
      'entity_alias',
      'identity_evidence',
      'core_crosswalk',
    ]) {
      assert.match(sql, new RegExp(`${table}_append_only`));
    }
  });

  it('does not reuse legacy crypto candidates, stock predicates, or order paths', () => {
    assert.doesNotMatch(sql, /crypto\.candidates|ISSUED_BY|SUPPLIES_TO|order|broker/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:ALL|UPDATE|DELETE)/i);
    assert.match(sql, /TO si_readapi/);
  });
});
