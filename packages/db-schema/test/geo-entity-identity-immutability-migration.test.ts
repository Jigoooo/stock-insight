import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { geoEntityIdentityImmutabilityMigrationSql } from '../src/migrations/042_geo_entity_identity_immutability.ts';

describe('P3-D geo entity identity immutability migration', () => {
  it('registers additive migration 042 for the canonical geo entity surface', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.match(indexSource, /geoEntityIdentityImmutabilityMigrationSql/);
    assert.match(indexSource, /id: '042_geo_entity_identity_immutability'/);
    assert.match(indexSource, /tables: \['geo_entity'\]/);
  });

  it('rejects every update and delete while preserving insert-only identity creation', () => {
    assert.match(
      geoEntityIdentityImmutabilityMigrationSql,
      /CREATE OR REPLACE FUNCTION geo\.reject_entity_identity_mutation\(\)/i,
    );
    assert.match(
      geoEntityIdentityImmutabilityMigrationSql,
      /BEFORE UPDATE OR DELETE ON geo\.entity/i,
    );
    assert.match(geoEntityIdentityImmutabilityMigrationSql, /geo entity identity is immutable/i);
    assert.doesNotMatch(geoEntityIdentityImmutabilityMigrationSql, /DROP\s+TABLE/i);
    assert.doesNotMatch(geoEntityIdentityImmutabilityMigrationSql, /TRUNCATE/i);
  });
});
