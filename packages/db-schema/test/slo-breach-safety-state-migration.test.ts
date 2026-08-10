import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { additiveAppMigrations } from '../src/index.ts';
import { wrapperFailureStreakSloMigrationSql } from '../src/migrations/096_wrapper_failure_streak_slo.ts';
import { sloBreachSafetyStateMigrationSql } from '../src/migrations/097_slo_breach_safety_state.ts';

const PROMOTED = [
  'ops.pipeline.wrapper_failure_streak',
  'ingestion.source_revision.growth',
  'knowledge.claim.growth',
  'knowledge.relation_evidence.growth',
  'serving.content_pack.servable',
  'serving.content_pack.freshness',
];

/** Disproved or never measured by the 2026-07-20..08-11 replay. */
const WITHHELD = ['ops.pipeline.expected_runs', 'governance.coverage_ledger.delta'];

describe('096 wrapper failure streak SLO', () => {
  it('is registered after the wrapper health view it measures', () => {
    const index = additiveAppMigrations.findIndex(
      ({ id }) => id === '096_wrapper_failure_streak_slo',
    );
    assert.notEqual(index, -1);
    assert.equal(additiveAppMigrations[index - 1]?.id, '095_pipeline_wrapper_health');
  });

  it('seeds report-only, leaving promotion to a separate decision', () => {
    assert.match(wrapperFailureStreakSloMigrationSql, /NULL, 'migration-096'/);
    assert.doesNotMatch(wrapperFailureStreakSloMigrationSql, /'CAUTION', 'migration-096'/);
  });

  it('is idempotent, because the ledger has no delete', () => {
    assert.match(wrapperFailureStreakSloMigrationSql, /WHERE NOT EXISTS/);
  });

  it('stays inside the five frozen gauge kinds', () => {
    // canonical/08 §8 grounds slo_kind's CHECK. Widening it to name a sixth axis
    // would claim the freeze says something it does not.
    assert.match(wrapperFailureStreakSloMigrationSql, /'artifact_count'/);
    assert.doesNotMatch(wrapperFailureStreakSloMigrationSql, /ALTER TABLE[\s\S]*slo_kind/);
  });
});

describe('097 SLO breach safety state', () => {
  it('is registered last, after the definition it promotes', () => {
    const index = additiveAppMigrations.findIndex(({ id }) => id === '097_slo_breach_safety_state');
    assert.notEqual(index, -1);
    assert.equal(additiveAppMigrations[index - 1]?.id, '096_wrapper_failure_streak_slo');
  });

  it('promotes only the gauges the replay corroborated', () => {
    for (const key of PROMOTED) {
      assert.match(sloBreachSafetyStateMigrationSql, new RegExp(`'${key.replaceAll('.', '\\.')}'`));
    }
    const promoteStatement = sloBreachSafetyStateMigrationSql.slice(
      sloBreachSafetyStateMigrationSql.indexOf("SET breach_safety_state = 'CAUTION'"),
    );
    const untilSemicolon = promoteStatement.slice(0, promoteStatement.indexOf(';'));
    for (const key of WITHHELD) {
      assert.doesNotMatch(untilSemicolon, new RegExp(key.replaceAll('.', '\\.')));
    }
  });

  it('never arms a state that stops recommendations', () => {
    // INFORMATION_ONLY and HALTED are recommendation_allowed:false in
    // contracts/safety-state.json. Nothing reads safety state yet, so pre-arming a
    // stop nobody has calibrated would be a guess with a consumer arriving later.
    assert.doesNotMatch(sloBreachSafetyStateMigrationSql, /'INFORMATION_ONLY'|'HALTED'/);
  });

  it('does not re-promote a gauge someone has already decided about', () => {
    assert.match(sloBreachSafetyStateMigrationSql, /AND breach_safety_state IS NULL/);
  });

  it('requires six sustained observations of the streak, not two', () => {
    assert.match(
      sloBreachSafetyStateMigrationSql,
      /SET breach_consecutive_required = 6\s+WHERE slo_key = 'ops\.pipeline\.wrapper_failure_streak'/,
    );
  });

  it('records why the two withheld gauges were withheld', () => {
    // A gauge left report-only without a reason reads as an oversight, and the next
    // reader has to redo the replay to find out.
    assert.match(sloBreachSafetyStateMigrationSql, /NOT PROMOTED, and why/);
    for (const key of WITHHELD) {
      assert.match(sloBreachSafetyStateMigrationSql, new RegExp(key.replaceAll('.', '\\.')));
    }
  });

  it('leaves migration 083 untouched', () => {
    // canonical-kernel-migration.test.ts pins 083's seed text. Promotion is an
    // UPDATE in a later migration, which is what GRANT UPDATE on the column is for.
    assert.doesNotMatch(sloBreachSafetyStateMigrationSql, /INSERT INTO governance\.slo_definition/);
    assert.match(sloBreachSafetyStateMigrationSql, /UPDATE governance\.slo_definition/);
  });
});
