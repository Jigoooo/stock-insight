import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cryptoServingAppReaderGrantMigrationSql } from '../src/migrations/053_crypto_serving_app_reader_grant.ts';

const sql = cryptoServingAppReaderGrantMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P6 crypto serving production app-reader grant migration', () => {
  it('registers a forward-only 053 migration instead of mutating applied 051', () => {
    assert.match(indexSource, /id: '053_crypto_serving_app_reader_grant'/);
    assert.match(indexSource, /sql: cryptoServingAppReaderGrantMigrationSql/);
    assert.doesNotMatch(sql, /IF EXISTS \(SELECT 1 FROM pg_roles/);
  });

  it('grants only serving-view reads to the production app reader', () => {
    assert.match(sql, /GRANT USAGE ON SCHEMA crypto_serving TO stock_insight_app_reader/);
    for (const view of [
      'entity_revision',
      'event_revision',
      'core_relation_revision',
      'risk_exposure_revision',
    ]) {
      assert.match(sql, new RegExp(`crypto_serving\\.${view}`));
    }
    assert.match(sql, /TO stock_insight_app_reader/);
    assert.doesNotMatch(sql, /GRANT\s+(?:INSERT|UPDATE|DELETE)/i);
    assert.doesNotMatch(sql, /crypto_(?:identity|truth|analytics)\./);
    assert.doesNotMatch(sql, /cross_domain\./);
  });
});
