import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(
  new URL(
    '../../../packages/db-schema/src/migrations/024_relation_builder_foundation.ts',
    import.meta.url,
  ),
);
const registryPath = fileURLToPath(
  new URL('../../../packages/db-schema/src/index.ts', import.meta.url),
);

describe('B6 relation builder foundation', () => {
  it('registers an additive migration that binds relation evidence to an exact source revision', () => {
    const registry = readFileSync(registryPath, 'utf8');
    assert.match(registry, /id:\s*'024_relation_builder_foundation'/);
    assert.ok(existsSync(migrationPath), '024_relation_builder_foundation migration must exist');
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /ADD COLUMN IF NOT EXISTS source_revision_id BIGINT/i);
    assert.match(
      migration,
      /source_revision_id\s+BIGINT[\s\S]*REFERENCES ingestion\.source_revision\(source_revision_id\)/i,
    );
    assert.match(migration, /evidence_kind\s*=\s*'source_revision'/i);
    assert.match(migration, /source_revision\.available_at\s*<=\s*NEW\.known_from/i);
    assert.match(
      migration,
      /evidence\.valid_to\s+IS\s+NULL[\s\S]*NEW\.valid_to\s+IS\s+NOT\s+NULL[\s\S]*NEW\.valid_to\s*<=\s*evidence\.valid_to/i,
      '024 must preserve the finite evidence valid_to cap from migration 023',
    );
  });

  it('seeds approved ontology revisions for every promotable B6 builder predicate', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    for (const predicate of [
      'CLASSIFIED_AS',
      'PRODUCT_SIMILARITY',
      'SUPPLIES',
      'CUSTOMER_OF',
      'HELD_BY',
      'OWNS',
      'COMMON_OWNER',
      'SAME_ETF_BASKET',
    ]) {
      assert.match(
        migration,
        new RegExp(`'${predicate}'[\\s\\S]{0,200}?'approved'`),
        `${predicate} must gain an approved ontology revision`,
      );
    }
  });

  it('never seeds an approved ontology revision for NEWS_COMENTION (non-promotable)', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.doesNotMatch(
      migration,
      /'NEWS_COMENTION'[\s\S]{0,200}?'approved'/,
      'NEWS_COMENTION must stay non-approved so the DB guard rejects accepted revisions',
    );
  });

  it('seeds ontology revisions idempotently (ON CONFLICT DO NOTHING)', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /INSERT INTO knowledge\.predicate_ontology_revision[\s\S]*ON CONFLICT \(predicate, revision_no\) DO NOTHING/i,
    );
  });
});
