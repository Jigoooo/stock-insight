import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { personalizationApiSurfaceMigrationSql } from '../src/migrations/044_personalization_api_surface.ts';

const sql = personalizationApiSurfaceMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P4-C personalization API ledger extension', () => {
  it('registers additive migration 044 without weakening append-only history', () => {
    assert.match(indexSource, /id: '044_personalization_api_surface'/);
    assert.match(indexSource, /sql: personalizationApiSurfaceMigrationSql/);
    assert.match(
      sql,
      /ALTER TABLE personalization\.thesis_revision[\s\S]*ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'system_generated'/i,
    );
    assert.match(sql, /CHECK \(source_kind IN \('user_authored', 'system_generated'\)\)/i);
    assert.match(
      sql,
      /ALTER TABLE personalization\.decision_packet[\s\S]*ADD COLUMN IF NOT EXISTS runtime_packet JSONB NOT NULL DEFAULT '\{\}'::jsonb/i,
    );
    assert.match(sql, /CHECK \(jsonb_typeof\(runtime_packet\) = 'object'\)/i);
    assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE|UPDATE)\b/i);
  });
});
