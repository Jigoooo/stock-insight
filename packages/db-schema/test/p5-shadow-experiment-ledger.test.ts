import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { shadowExperimentLedgerMigrationSql } from '../src/migrations/045_shadow_experiment_ledger.ts';

const sql = shadowExperimentLedgerMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P5 shadow experiment ledger migration', () => {
  it('registers terminal experiment runs, candidate scores, and gate metrics', () => {
    assert.match(indexSource, /id: '045_shadow_experiment_ledger'/);
    assert.match(indexSource, /sql: shadowExperimentLedgerMigrationSql/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS analytics\.shadow_experiment_run/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS analytics\.candidate_score/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS analytics\.shadow_metric/);
    assert.match(
      sql,
      /experiment_kind IN \([\s\S]*'eventrag'[\s\S]*'pathsim'[\s\S]*'nbfnet'[\s\S]*'hgt'[\s\S]*'tgn'[\s\S]*'pcmci'[\s\S]*'sequential_conformal'[\s\S]*'contextual_bandit'[\s\S]*'decision_focused'[\s\S]*'offline_rl'[\s\S]*'remote_sensing'/,
    );
  });

  it('structurally prohibits accepted facts, product actions, and orders', () => {
    assert.match(
      sql,
      /candidate_only\s+BOOLEAN NOT NULL DEFAULT true CHECK \(candidate_only = true\)/i,
    );
    assert.match(
      sql,
      /accepted_fact_allowed\s+BOOLEAN NOT NULL DEFAULT false CHECK \(accepted_fact_allowed = false\)/i,
    );
    assert.match(
      sql,
      /order_executable\s+BOOLEAN NOT NULL DEFAULT false CHECK \(order_executable = false\)/i,
    );
    assert.doesNotMatch(sql, /REFERENCES\s+knowledge\.relation_revision/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:ALL|UPDATE|DELETE)/i);
  });

  it('keeps every experimental artifact append-only and snapshot-bound', () => {
    for (const table of ['shadow_experiment_run', 'candidate_score', 'shadow_metric']) {
      assert.match(sql, new RegExp(`${table}_append_only`));
    }
    assert.match(sql, /graph_snapshot_id\s+BIGINT REFERENCES analytics\.graph_snapshot/);
    assert.match(
      sql,
      /input_digest\s+TEXT NOT NULL CHECK \(input_digest ~ '\^\[a-f0-9\]\{64\}\$'\)/,
    );
    assert.match(sql, /model_artifact_digest\s+TEXT CHECK/);
    assert.match(sql, /UNIQUE \(shadow_experiment_run_id, candidate_kind, candidate_key\)/);
  });
});
