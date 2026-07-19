import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(
  new URL('../../../packages/db-schema/src/migrations/027_pipeline_run_claim.ts', import.meta.url),
);
const registryPath = fileURLToPath(
  new URL('../../../packages/db-schema/src/index.ts', import.meta.url),
);

describe('B9 pipeline run claim migration (027)', () => {
  it('registers the additive migration', () => {
    assert.ok(existsSync(migrationPath), '027_pipeline_run_claim migration must exist');
    const registry = readFileSync(registryPath, 'utf8');
    assert.match(registry, /id:\s*'027_pipeline_run_claim'/);
  });

  it('creates a claim table keyed by natural run key with fencing token', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS ops\.pipeline_run_claim\s*\(/);
    assert.match(migration, /natural_run_key\s+TEXT\s+NOT NULL/);
    assert.match(migration, /fencing_token\s+BIGINT\s+NOT NULL/);
    assert.match(migration, /UNIQUE\s*\(natural_run_key\)/);
  });

  it('provides an atomic claim function that returns exactly one winner', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE OR REPLACE FUNCTION ops\.claim_pipeline_run/);
    assert.match(
      migration,
      /pg_advisory_xact_lock\(hashtextextended\(p_natural_run_key, 0\)\)[\s\S]*?SELECT \* INTO v_row FROM ops\.pipeline_run_claim[\s\S]*?FOR UPDATE;[\s\S]*?v_now := clock_timestamp\(\)/,
    );
    assert.match(
      migration,
      /claimed_at\s*=\s*v_now,[\s\S]*?lease_expires_at\s*=\s*v_now \+ make_interval/,
    );
    // Expired-lease takeover must bump the fencing token.
    assert.match(migration, /fencing_token\s*=\s*v_row\.fencing_token\s*\+\s*1/);
    assert.match(
      migration,
      /IF v_row\.claim_status = 'completed' THEN[\s\S]*?false,[\s\S]*?v_row\.fencing_token/,
    );
  });

  it('renews and finishes only through owner plus fencing-token CAS functions', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE OR REPLACE FUNCTION ops\.renew_pipeline_run/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION ops\.finish_pipeline_run/);
    assert.equal(
      (migration.match(/pg_advisory_xact_lock\(hashtextextended\(p_natural_run_key, 0\)\)/g) ?? [])
        .length,
      3,
    );
    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION ops\.renew_pipeline_run[\s\S]*?FOR UPDATE;[\s\S]*?v_now := clock_timestamp\(\)[\s\S]*?CREATE OR REPLACE FUNCTION ops\.finish_pipeline_run/,
    );
    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION ops\.finish_pipeline_run[\s\S]*?FOR UPDATE;[\s\S]*?v_now := clock_timestamp\(\)/,
    );
    assert.match(
      migration,
      /WHERE natural_run_key = p_natural_run_key[\s\S]*?claimed_by = p_claimed_by[\s\S]*?fencing_token = p_fencing_token[\s\S]*?claim_status = 'claimed'/,
    );
    assert.match(migration, /SECURITY DEFINER\s+SET search_path = pg_catalog, ops/g);
  });

  it('claim terminal states are constrained', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /claim_status\s+TEXT\s+NOT NULL[\s\S]*?CHECK \(claim_status IN \('claimed','completed','failed','expired'\)\)/,
    );
  });

  it('denies direct scheduler DML and grants only read plus fenced function execution', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /REVOKE ALL ON ops\.pipeline_run_claim FROM PUBLIC, si_analytics/);
    assert.match(migration, /GRANT SELECT ON ops\.pipeline_run_claim TO si_analytics/);
    assert.match(migration, /REVOKE ALL ON SEQUENCE[\s\S]*?FROM PUBLIC, si_analytics/);
    assert.doesNotMatch(migration, /GRANT[^;]*(?:INSERT|UPDATE|DELETE)[^;]*TO si_analytics/);
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION ops\.claim_pipeline_run\(TEXT, TEXT, TEXT, INTEGER\) TO si_analytics/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION ops\.renew_pipeline_run\(TEXT, TEXT, BIGINT, INTEGER\) TO si_analytics/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION ops\.finish_pipeline_run\(TEXT, TEXT, BIGINT, TEXT\) TO si_analytics/,
    );
  });

  it('never mutates legacy tables', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /ALTER TABLE (?!ops\.pipeline_run_claim)/);
    assert.doesNotMatch(migration, /DELETE FROM/i);
  });
});
