import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { scenarioSpatialImpactMigrationSql } from '../src/migrations/040_scenario_spatial_impact.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P2-WD scenario / spatial-impact migration', () => {
  it('registers migration 040 and all scenario/spatial surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /scenarioSpatialImpactMigrationSql/);
    assert.match(indexSource, /id: '040_scenario_spatial_impact'/);
    for (const surface of [
      'scenario_set',
      'scenario_branch',
      'scenario_invalidation',
      'spatial_impact_path',
      'spatial_impact_step',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('requires PostGIS and never rewrites history', () => {
    assert.match(scenarioSpatialImpactMigrationSql, /create extension if not exists postgis/i);
    for (const token of destructiveTokens) {
      assert.doesNotMatch(scenarioSpatialImpactMigrationSql, token);
    }
  });

  it('models a scenario set with bull/base/bear plus policy delay/exemption branches', () => {
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /create table if not exists analytics\.scenario_set\s*\(/i,
    );
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /create table if not exists analytics\.scenario_branch\s*\(/i,
    );
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /branch_kind\s+text\s+not null[\s\S]+bull[\s\S]+base[\s\S]+bear/i,
    );
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /policy_modifier\s+text[\s\S]+delay[\s\S]+exemption/i,
    );
  });

  it('forces every scenario branch to carry counter-evidence and an invalidation condition', () => {
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /create table if not exists analytics\.scenario_invalidation\s*\(/i,
    );
    assert.match(scenarioSpatialImpactMigrationSql, /invalidation_condition\s+text\s+not null/i);
    assert.match(scenarioSpatialImpactMigrationSql, /counter_evidence_locator\s+jsonb\s+not null/i);
    // A guard forbids sealing a scenario branch without counter-evidence + invalidation.
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /create or replace function analytics\.guard_scenario_branch_write/i,
    );
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /scenario branch requires counter-evidence and an invalidation condition/i,
    );
    assert.match(scenarioSpatialImpactMigrationSql, /is append-only/i);
  });

  it('models a spatial impact path with a declared stable method (not distance-only)', () => {
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /create table if not exists analytics\.spatial_impact_path\s*\(/i,
    );
    // The three standard spatial paths (§22.8): disaster polygon x facility,
    // sanction jurisdiction, port closure.
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /path_kind\s+text\s+not null[\s\S]+disaster_facility[\s\S]+sanction_jurisdiction[\s\S]+port_closure/i,
    );
    // A stable method must be named; pure spatial distance may not promote an edge.
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /stable_method\s+text\s+not null[\s\S]+spatial_join[\s\S]+hierarchy_rollup[\s\S]+event_coreference[\s\S]+gravity[\s\S]+io_facility_graph[\s\S]+regional_panel/i,
    );
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /create table if not exists analytics\.spatial_impact_step\s*\(/i,
    );
    assert.match(scenarioSpatialImpactMigrationSql, /evidence_locator\s+jsonb\s+not null/i);
  });

  it('forbids promoting a spatial edge on distance alone', () => {
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /create or replace function analytics\.guard_spatial_impact_path_write/i,
    );
    // A path may not be sealed/accepted when its only basis is spatial distance.
    assert.match(
      scenarioSpatialImpactMigrationSql,
      /spatial proximity alone cannot promote an impact edge/i,
    );
  });

  it('grants least-privilege with analytics USAGE and no delete', () => {
    assert.match(scenarioSpatialImpactMigrationSql, /grant usage on schema analytics/i);
    assert.match(scenarioSpatialImpactMigrationSql, /grant select, insert on/i);
    assert.match(scenarioSpatialImpactMigrationSql, /grant select on/i);
    assert.doesNotMatch(scenarioSpatialImpactMigrationSql, /grant\s+delete/i);
  });
});
