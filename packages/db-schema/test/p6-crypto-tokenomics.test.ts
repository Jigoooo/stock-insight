import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cryptoTokenomicsMigrationSql } from '../src/migrations/048_crypto_tokenomics.ts';

const sql = cryptoTokenomicsMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P6-3 crypto tokenomics migration', () => {
  it('registers supply, unlock, emission, governance, and action revisions', () => {
    assert.match(indexSource, /id: '048_crypto_tokenomics'/);
    for (const table of [
      'token_supply_revision',
      'unlock_schedule_revision',
      'emission_schedule_revision',
      'governance_proposal',
      'governance_proposal_revision',
      'governance_action',
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS crypto_analytics\\.${table}`));
    }
    assert.match(sql, /beneficiary_class IN \([\s\S]*'team'[\s\S]*'investor'[\s\S]*'treasury'/);
    assert.match(
      sql,
      /proposal_state IN \([\s\S]*'draft'[\s\S]*'active'[\s\S]*'passed'[\s\S]*'executed'/,
    );
  });

  it('keeps original coefficients, units, PIT, source, and supersession', () => {
    assert.match(sql, /unlock_amount\s+NUMERIC/);
    assert.match(sql, /percentage_of_total_supply\s+NUMERIC/);
    assert.match(sql, /amount_unit\s+TEXT/);
    assert.match(sql, /source_revision_id\s+BIGINT NOT NULL REFERENCES ingestion\.source_revision/);
    assert.match(sql, /known_at\s+TIMESTAMPTZ NOT NULL/);
    assert.match(sql, /supersedes_unlock_schedule_revision_id/);
    assert.match(sql, /supersedes_emission_schedule_revision_id/);
    assert.match(sql, /supersedes_governance_proposal_revision_id/);
  });

  it('is append-only and disconnected from execution paths', () => {
    for (const table of [
      'token_supply_revision',
      'unlock_schedule_revision',
      'emission_schedule_revision',
      'governance_proposal',
      'governance_proposal_revision',
      'governance_action',
    ]) {
      assert.match(sql, new RegExp(`${table}_append_only`));
    }
    assert.doesNotMatch(sql, /order|broker|position|leverage/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:ALL|UPDATE|DELETE)/i);
  });
});
