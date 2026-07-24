import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { truthGeoServingMigrationSql } from '../src/migrations/036_truth_geo_serving.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P1-W6 truth-geo serving / compatibility migration', () => {
  it('registers migration 036 and its serving surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /truthGeoServingMigrationSql/);
    assert.match(indexSource, /id: '036_truth_geo_serving'/);
    for (const surface of [
      'v_truth_assertion_pit_v1',
      'v_world_event_current_v1',
      'v_geo_entity_exposure_v1',
      'v_pit_universe_current_v1',
      'truth_geo_serving_manifest',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('is a purely additive, non-destructive compatibility layer', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(truthGeoServingMigrationSql, token);
    }
    // Only creates views/tables; never mutates the canonical ledgers.
    assert.match(truthGeoServingMigrationSql, /create or replace view/i);
  });

  it('serves point-in-time truth assertions filtered by known_at', () => {
    assert.match(
      truthGeoServingMigrationSql,
      /create or replace view serving\.v_truth_assertion_pit_v1/i,
    );
    // The PIT view must expose both temporal clocks and never surface a
    // non-accepted assertion state by default.
    assert.match(truthGeoServingMigrationSql, /known_at/i);
    assert.match(truthGeoServingMigrationSql, /available_at/i);
    assert.match(truthGeoServingMigrationSql, /verification_state\s+in\s*\(/i);
  });

  it('exposes current world events and geo exposure as additive views', () => {
    assert.match(
      truthGeoServingMigrationSql,
      /create or replace view serving\.v_world_event_current_v1/i,
    );
    assert.match(
      truthGeoServingMigrationSql,
      /create or replace view serving\.v_geo_entity_exposure_v1/i,
    );
    assert.match(
      truthGeoServingMigrationSql,
      /create or replace view serving\.v_pit_universe_current_v1/i,
    );
    // Exposure view must never surface a ratio without its denominator.
    assert.match(truthGeoServingMigrationSql, /denominator/i);
  });

  it('records a lineage manifest of counts for backfill invariants', () => {
    assert.match(
      truthGeoServingMigrationSql,
      /create table if not exists serving\.truth_geo_serving_manifest\s*\(/i,
    );
    assert.match(truthGeoServingMigrationSql, /surface_name/i);
    assert.match(truthGeoServingMigrationSql, /row_count/i);
    assert.match(truthGeoServingMigrationSql, /captured_at/i);
    // The manifest is populated from the canonical ledgers at migration time.
    assert.match(truthGeoServingMigrationSql, /insert into serving\.truth_geo_serving_manifest/i);
  });

  it('grants read-only access to serving surfaces without delete', () => {
    assert.match(truthGeoServingMigrationSql, /grant select on/i);
    assert.doesNotMatch(truthGeoServingMigrationSql, /grant\s+delete/i);
    assert.doesNotMatch(truthGeoServingMigrationSql, /grant\s+insert\s+on\s+serving\.v_/i);
  });
});
