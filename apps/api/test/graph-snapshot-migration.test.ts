import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(
  new URL(
    '../../../packages/db-schema/src/migrations/025_graph_snapshot_analytics.ts',
    import.meta.url,
  ),
);
const registryPath = fileURLToPath(
  new URL('../../../packages/db-schema/src/index.ts', import.meta.url),
);

describe('B7 graph snapshot analytics migration (025)', () => {
  it('registers the additive migration', () => {
    assert.ok(existsSync(migrationPath), '025_graph_snapshot_analytics migration must exist');
    const registry = readFileSync(registryPath, 'utf8');
    assert.match(registry, /id:\s*'025_graph_snapshot_analytics'/);
  });

  it('creates a reproducible snapshot header with digest and dual-time cutoffs', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.graph_snapshot\s*\(/);
    assert.match(migration, /snapshot_digest\s+TEXT\s+NOT NULL/);
    assert.match(migration, /as_of\s+TIMESTAMPTZ\s+NOT NULL/);
    assert.match(migration, /known_at\s+TIMESTAMPTZ\s+NOT NULL/);
    assert.match(migration, /UNIQUE\s*\(as_of,\s*known_at,\s*builder_version\)/);
  });

  it('binds snapshot edges to exact relation revisions', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.graph_snapshot_edge\s*\(/);
    assert.match(
      migration,
      /relation_revision_id\s+BIGINT\s+NOT NULL\s+REFERENCES knowledge\.relation_revision/,
    );
    assert.match(migration, /UNIQUE\s*\(graph_snapshot_id,\s*relation_revision_id\)/);
    assert.match(
      migration,
      /relation_identity_id\s+BIGINT\s+NOT NULL\s+REFERENCES knowledge\.relation_identity/,
    );
    assert.match(migration, /ux_graph_snapshot_edge_identity/);
  });

  it('records per-snapshot entity degree (B6 cross-hub carry-over)', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.graph_snapshot_degree\s*\(/);
    assert.match(migration, /UNIQUE\s*\(graph_snapshot_id,\s*entity_id\)/);
  });

  it('impact path v2 uses step-level exact edge FKs — no BIGINT[] arrays', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.impact_path_v2/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.impact_path_step/);
    assert.match(
      migration,
      /graph_snapshot_edge_id BIGINT NOT NULL REFERENCES analytics\.graph_snapshot_edge/,
    );
    assert.match(migration, /UNIQUE \(impact_path_v2_id, step_no\)/);
    assert.match(migration, /status\s+TEXT NOT NULL DEFAULT 'building'/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION analytics\.guard_impact_path_write/);
    assert.match(
      migration,
      /v_step_count <> NEW\.hop_count[\s\S]*?v_first_step <> 1[\s\S]*?v_last_step <> NEW\.hop_count/,
    );
    assert.match(migration, /v_broken_links[\s\S]*?lag\(step\.to_entity_id\)/);
    assert.match(
      migration,
      /edge\.subject_entity_id = NEW\.from_entity_id[\s\S]*?edge\.object_entity_id = NEW\.to_entity_id/,
    );
    assert.match(migration, /v_parent_status IS DISTINCT FROM 'building'/);
    assert.doesNotMatch(migration, /edge_ids\s+BIGINT\[\]/);
  });

  it('market measurements are snapshot-scoped, model-config-bound, and never structural', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.relation_measurement\s*\(/);
    assert.match(migration, /model_config\s+JSONB\s+NOT NULL/);
    assert.match(
      migration,
      /measurement_kind\s+TEXT\s+NOT NULL[\s\S]*?CHECK \(measurement_kind IN \('correlation','partial_correlation','lead_lag','fevd','event_study'\)\)/,
    );
    // Market validation must not write into the structural relation ledger.
    assert.doesNotMatch(migration, /INSERT INTO knowledge\.relation_revision/);
    assert.doesNotMatch(migration, /INSERT INTO knowledge\.relation_evidence_ledger/);
  });

  it('community assignments are snapshot-scoped with algorithm+parameters and distinct from themes', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.graph_community\s*\(/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS analytics\.graph_community_member\s*\(/);
    assert.match(migration, /algorithm\s+TEXT\s+NOT NULL/);
    assert.match(migration, /parameters\s+JSONB\s+NOT NULL/);
    // Communities must not masquerade as themes.
    assert.doesNotMatch(migration, /INSERT INTO analytics\.theme/);
  });

  it('grants the analytics worker write access and downstream roles read access', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON[\s\S]*?analytics\.graph_snapshot[\s\S]*?TO si_analytics/,
    );
    assert.match(
      migration,
      /GRANT UPDATE \(status, sealed_at\) ON analytics\.graph_snapshot TO si_analytics/,
    );
    assert.match(
      migration,
      /GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics/,
    );
    assert.match(
      migration,
      /GRANT SELECT ON[\s\S]*?analytics\.graph_snapshot[\s\S]*?TO si_publisher, si_readapi/,
    );
  });

  it('seals snapshot artifacts against mutation and post-seal inserts', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE OR REPLACE FUNCTION analytics\.compute_graph_snapshot_digest/);
    assert.match(
      migration,
      /v_actual_digest := analytics\.compute_graph_snapshot_digest\(OLD\.graph_snapshot_id\)[\s\S]*?v_actual_digest IS DISTINCT FROM NEW\.snapshot_digest/,
    );
    assert.match(migration, /CREATE OR REPLACE FUNCTION analytics\.guard_graph_snapshot_write/);
    assert.match(
      migration,
      /CREATE TRIGGER graph_snapshot_write_guard\s+BEFORE INSERT OR UPDATE OR DELETE ON analytics\.graph_snapshot/,
    );
    assert.match(migration, /CREATE OR REPLACE FUNCTION analytics\.guard_graph_artifact_write/);
    for (const table of [
      'graph_snapshot_edge',
      'graph_snapshot_degree',
      'impact_path_v2',
      'impact_path_step',
      'relation_measurement',
      'graph_community',
      'graph_community_member',
    ]) {
      assert.match(
        migration,
        new RegExp(
          `CREATE TRIGGER ${table}_write_guard\\s+BEFORE INSERT OR UPDATE OR DELETE ON analytics\\.${table}`,
        ),
      );
    }
  });

  it('serializes child inserts against snapshot state transitions', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /SELECT snapshot\.status, snapshot\.as_of, snapshot\.known_at\s+INTO v_actual_status, v_snapshot_as_of, v_snapshot_known_at[\s\S]*?WHERE snapshot\.graph_snapshot_id = v_snapshot_id\s+FOR SHARE/,
    );
  });

  it('rejects non-PIT relation membership and cross-snapshot impact steps', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /revision\.revision_status = 'accepted'[\s\S]*?revision\.valid_from <= v_snapshot_as_of[\s\S]*?revision\.known_from <= v_snapshot_known_at/,
    );
    assert.match(
      migration,
      /NOT EXISTS\s*\([\s\S]*?newer\.relation_identity_id = revision\.relation_identity_id[\s\S]*?newer\.revision_no > revision\.revision_no[\s\S]*?newer\.known_from <= v_snapshot_known_at/,
    );
    assert.match(
      migration,
      /WHEN 'impact_path_step'[\s\S]*?edge\.graph_snapshot_id[\s\S]*?v_anchor_snapshot_id IS DISTINCT FROM v_snapshot_id/,
    );
  });

  it('never mutates or drops applied legacy analytics tables', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /ALTER TABLE analytics\.impact_path\b/);
    assert.doesNotMatch(migration, /DELETE FROM analytics\.impact_path\b/);
  });
});
