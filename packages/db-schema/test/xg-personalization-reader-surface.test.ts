import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { personalizationReaderSurfaceHardeningMigrationSql } from '../src/migrations/052_personalization_reader_surface_hardening.ts';

const sql = personalizationReaderSurfaceHardeningMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('XG personalization reader surface hardening', () => {
  it('registers migration 052 after crypto serving views', () => {
    const servingPosition = indexSource.indexOf("id: '051_crypto_serving_views'");
    const hardeningPosition = indexSource.indexOf(
      "id: '052_personalization_reader_surface_hardening'",
    );
    assert.ok(servingPosition >= 0);
    assert.ok(hardeningPosition > servingPosition);
    assert.match(indexSource, /sql: personalizationReaderSurfaceHardeningMigrationSql/);
  });

  it('revokes raw table reads and grants only API-required columns', () => {
    const grantSection = sql.split('DO $effective_privilege_guard$')[0] ?? '';
    for (const table of ['decision_packet', 'decision_packet_legal_review']) {
      assert.match(
        sql,
        new RegExp(
          `REVOKE SELECT ON personalization\\.${table}[\\s\\S]*FROM stock_insight_reader, stock_insight_writer`,
        ),
      );
    }
    for (const column of [
      'decision_packet_id',
      'runtime_packet',
      'common_view_digest',
      'review_status',
      'reviewed_at',
    ]) {
      assert.match(sql, new RegExp(`\\b${column}\\b`));
    }
    assert.doesNotMatch(grantSection, /reviewer_ref|review_note|review_digest|packet_digest/);
    assert.doesNotMatch(sql, /GRANT\s+SELECT\s+ON\s+personalization\.decision_packet/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)/i);
    assert.match(sql, /information_schema\.columns/);
    assert.match(sql, /has_column_privilege\(/);
    assert.match(sql, /NOT \(column_name = ANY \(ARRAY\[/);
    assert.match(sql, /table_name = 'decision_packet'/);
    assert.match(sql, /table_name = 'decision_packet_legal_review'/);
    assert.match(sql, /effective raw personalization read privilege remains/);
  });
});
