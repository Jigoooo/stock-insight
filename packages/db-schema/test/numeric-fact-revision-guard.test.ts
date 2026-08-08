import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { numericFactRevisionGuardMigrationSql } from '../src/migrations/090_numeric_fact_revision_guard.ts';

describe('090 numeric-fact revision guard', () => {
  it('registers after 089 without changing assertion or coverage guards', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const prior = indexSource.indexOf("id: '089_k4_market_intelligence_ledger'");
    const current = indexSource.indexOf("id: '090_numeric_fact_revision_guard'");
    assert.ok(prior >= 0 && current > prior);
    assert.match(indexSource, /numericFactRevisionGuardMigrationSql/);
    assert.doesNotMatch(numericFactRevisionGuardMigrationSql, /assertion_revision_guard/);
    assert.doesNotMatch(numericFactRevisionGuardMigrationSql, /coverage_ledger_revision_guard/);
  });

  it('replaces only the numeric fact trigger with an exact N-1 claim guard', () => {
    assert.match(
      numericFactRevisionGuardMigrationSql,
      /DROP TRIGGER IF EXISTS numeric_fact_revision_guard ON world\.numeric_fact/i,
    );
    assert.match(
      numericFactRevisionGuardMigrationSql,
      /CREATE TRIGGER numeric_fact_revision_guard[\s\S]*BEFORE INSERT ON world\.numeric_fact/i,
    );
    assert.match(
      numericFactRevisionGuardMigrationSql,
      /previous\.revision_no[\s\S]*NEW\.revision_no - 1/i,
    );
    assert.match(
      numericFactRevisionGuardMigrationSql,
      /previous\.restatement_group_key[\s\S]*NEW\.restatement_group_key/i,
    );
    assert.doesNotMatch(
      numericFactRevisionGuardMigrationSql,
      /previous\.fact_key[\s\S]*IS DISTINCT FROM[\s\S]*NEW\.fact_key/i,
    );
  });

  it('holds claim structure and metric definition fixed while allowing a new observation', () => {
    for (const field of [
      'entity_id',
      'concept_namespace',
      'concept_key',
      'unit',
      'currency',
      'scale_power',
      'period_start',
      'period_end',
      'instant_at',
      'fiscal_year',
      'fiscal_quarter',
      'dimensions_json',
    ]) {
      assert.match(numericFactRevisionGuardMigrationSql, new RegExp(`previous\\.${field}`));
      assert.match(numericFactRevisionGuardMigrationSql, new RegExp(`NEW\\.${field}`));
    }
    assert.match(numericFactRevisionGuardMigrationSql, /metadata\s*->>\s*'metricDefinitionKey'/i);
    for (const mutable of ['value', 'source_revision_id', 'original_cell_or_xbrl_locator']) {
      assert.doesNotMatch(
        numericFactRevisionGuardMigrationSql,
        new RegExp(`previous\\.${mutable}[\\s\\S]*IS DISTINCT FROM[\\s\\S]*NEW\\.${mutable}`, 'i'),
      );
    }
  });

  it('forbids knowledge or availability time from moving backwards', () => {
    assert.match(numericFactRevisionGuardMigrationSql, /NEW\.known_at\s*<\s*previous\.known_at/i);
    assert.match(
      numericFactRevisionGuardMigrationSql,
      /NEW\.available_at\s*<\s*previous\.available_at/i,
    );
  });

  it('does not expose the trigger function to PUBLIC execution', () => {
    assert.match(
      numericFactRevisionGuardMigrationSql,
      /REVOKE ALL ON FUNCTION world\.guard_numeric_fact_revision_chain\(\) FROM PUBLIC/i,
    );
  });
});
