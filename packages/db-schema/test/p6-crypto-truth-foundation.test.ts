import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cryptoTruthFoundationMigrationSql } from '../src/migrations/047_crypto_truth_foundation.ts';

const sql = cryptoTruthFoundationMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P6-2 crypto truth foundation migration', () => {
  it('registers separate event, evidence, dependency, and depeg ledgers', () => {
    assert.match(indexSource, /id: '047_crypto_truth_foundation'/);
    for (const table of [
      'event',
      'event_revision',
      'event_participant',
      'event_evidence',
      'contract_dependency_revision',
      'depeg_observation',
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS crypto_truth\\.${table}`));
    }
    assert.match(
      sql,
      /event_type IN \([\s\S]*'audit_publication'[\s\S]*'exploit'[\s\S]*'depeg'[\s\S]*'chain_halt'/,
    );
    assert.match(
      sql,
      /dependency_kind IN \([\s\S]*'calls'[\s\S]*'oracle_feed'[\s\S]*'reserve_backing'[\s\S]*'custody'/,
    );
  });

  it('preserves PIT, provenance, chain finality, and append-only revisions', () => {
    assert.match(sql, /source_revision_id\s+BIGINT NOT NULL REFERENCES ingestion\.source_revision/);
    assert.match(sql, /available_at\s+TIMESTAMPTZ NOT NULL/);
    assert.match(sql, /known_at\s+TIMESTAMPTZ NOT NULL/);
    assert.match(sql, /finality_state\s+TEXT NOT NULL/);
    assert.match(sql, /block_height\s+NUMERIC/);
    assert.match(sql, /supersedes_crypto_event_revision_id/);
    assert.match(sql, /supersedes_contract_dependency_revision_id/);
    for (const table of [
      'event',
      'event_revision',
      'event_participant',
      'event_evidence',
      'contract_dependency_revision',
      'depeg_observation',
    ]) {
      assert.match(sql, new RegExp(`${table}_append_only`));
    }
  });

  it('never writes stock predicates, accepted relations, or execution paths', () => {
    assert.doesNotMatch(sql, /ISSUED_BY|SUPPLIES_TO|knowledge\.relation_revision|order|broker/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:ALL|UPDATE|DELETE)/i);
    assert.match(sql, /TO si_readapi/);
  });
});
