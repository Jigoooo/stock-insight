import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(
  new URL('../../../packages/db-schema/src/migrations/026_backend_serving_v2.ts', import.meta.url),
);
const registryPath = fileURLToPath(
  new URL('../../../packages/db-schema/src/index.ts', import.meta.url),
);

describe('B8 backend serving v2 migration (026)', () => {
  it('registers the additive migration', () => {
    assert.ok(existsSync(migrationPath), '026_backend_serving_v2 migration must exist');
    const registry = readFileSync(registryPath, 'utf8');
    assert.match(registry, /id:\s*'026_backend_serving_v2'/);
  });

  it('creates a canonical content pack bound to an exact graph snapshot with lineage', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS serving\.content_pack\s*\(/);
    assert.match(
      migration,
      /graph_snapshot_id\s+BIGINT\s+NOT NULL\s+REFERENCES analytics\.graph_snapshot/,
    );
    assert.match(migration, /pack_digest\s+TEXT\s+NOT NULL/);
    assert.match(migration, /fresh_until\s+TIMESTAMPTZ\s+NOT NULL/);
    assert.match(
      migration,
      /UNIQUE\s*\(pack_kind,\s*entity_id,\s*graph_snapshot_id,\s*builder_version\)/,
    );
  });

  it('content pack items carry typed evidence FKs — no free-floating JSON evidence', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS serving\.content_pack_item\s*\(/);
    assert.match(
      migration,
      /relation_revision_id\s+BIGINT\s+REFERENCES knowledge\.relation_revision/,
    );
    assert.match(
      migration,
      /relation_evidence_ledger_id\s+BIGINT\s+REFERENCES knowledge\.relation_evidence_ledger/,
    );
    assert.match(migration, /impact_path_v2_id\s+BIGINT\s+REFERENCES analytics\.impact_path_v2/);
    assert.match(migration, /num_nonnulls\(/);
    assert.match(migration, /UNIQUE\s*\(content_pack_id,\s*item_no\)/);
  });

  it('serving projection status view exposes freshness for the new graph read path', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE OR REPLACE VIEW serving\.v_relation_graph_freshness/);
    assert.match(migration, /sealed/);
  });

  it('grants the publisher write access and read APIs the exact serving projection', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /GRANT SELECT, INSERT ON serving\.content_pack TO si_publisher/);
    assert.match(
      migration,
      /GRANT UPDATE \(status, published_at\) ON serving\.content_pack TO si_publisher/,
    );
    assert.match(migration, /GRANT SELECT, INSERT ON serving\.content_pack_item TO si_publisher/);
    assert.match(
      migration,
      /GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA serving TO si_publisher/,
    );
    assert.match(
      migration,
      /GRANT SELECT ON serving\.content_pack,\s*serving\.content_pack_item,\s*serving\.v_relation_graph_freshness\s*TO si_readapi/,
    );
    assert.match(
      migration,
      /GRANT SELECT ON serving\.content_pack_item,\s*serving\.v_relation_graph_freshness\s*TO stock_insight_app_reader/,
    );
  });

  it('grants relation readers scoped access to user state required by the v2 overlay', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /GRANT SELECT ON public\.user_watchlist, public\.user_positions TO si_readapi/,
    );
    assert.match(
      migration,
      /CREATE POLICY relation_adapter_readapi_scope ON public\.user_watchlist[\s\S]*?TO si_readapi[\s\S]*?current_setting\('stock_insight\.user_id', true\)/,
    );
    assert.match(
      migration,
      /GRANT SELECT ON public\.user_watchlist, public\.user_positions\s+TO stock_insight_app_reader[\s\S]*?CREATE POLICY relation_adapter_app_reader_scope ON public\.user_watchlist[\s\S]*?CREATE POLICY relation_adapter_app_reader_scope ON public\.user_positions/,
    );
    assert.match(
      migration,
      /CREATE POLICY relation_adapter_readapi_boundary ON public\.user_watchlist\s+AS RESTRICTIVE\s+FOR SELECT TO si_readapi/,
    );
    assert.match(
      migration,
      /CREATE POLICY relation_adapter_readapi_boundary ON public\.user_positions\s+AS RESTRICTIVE\s+FOR SELECT TO si_readapi/,
    );
    assert.match(
      migration,
      /CREATE POLICY relation_adapter_app_reader_boundary ON public\.user_watchlist\s+AS RESTRICTIVE\s+FOR SELECT TO stock_insight_app_reader/,
    );
    assert.match(
      migration,
      /CREATE POLICY relation_adapter_app_reader_boundary ON public\.user_positions\s+AS RESTRICTIVE\s+FOR SELECT TO stock_insight_app_reader/,
    );
  });

  it('publishes packs atomically and rejects mutation or late item writes', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE OR REPLACE FUNCTION serving\.canonical_jsonb_text/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION serving\.compute_content_pack_digest/);
    assert.match(
      migration,
      /v_actual_digest := serving\.compute_content_pack_digest\(OLD\.content_pack_id\)[\s\S]*?v_actual_digest IS DISTINCT FROM NEW\.pack_digest/,
    );
    assert.match(migration, /CREATE OR REPLACE FUNCTION serving\.guard_content_pack_write/);
    assert.match(
      migration,
      /CREATE TRIGGER content_pack_write_guard\s+BEFORE INSERT OR UPDATE OR DELETE ON serving\.content_pack/,
    );
    assert.match(migration, /CREATE OR REPLACE FUNCTION serving\.guard_content_pack_item_write/);
    assert.match(
      migration,
      /CREATE TRIGGER content_pack_item_write_guard\s+BEFORE INSERT OR UPDATE OR DELETE ON serving\.content_pack_item/,
    );
    assert.match(migration, /content pack item_count mismatch/);
  });

  it('serializes pack items and pack publication against parent state changes', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /SELECT pack\.status, pack\.graph_snapshot_id\s+INTO v_pack_status, v_pack_snapshot_id[\s\S]*?WHERE pack\.content_pack_id = NEW\.content_pack_id\s+FOR SHARE/,
    );
    assert.match(
      migration,
      /SELECT snapshot\.status INTO v_snapshot_status[\s\S]*?WHERE snapshot\.graph_snapshot_id = NEW\.graph_snapshot_id\s+FOR SHARE/,
    );
  });

  it('requires every typed item anchor to belong to the pack graph snapshot', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.match(
      migration,
      /NEW\.relation_revision_id[\s\S]*?analytics\.graph_snapshot_edge[\s\S]*?v_pack_snapshot_id/,
    );
    assert.match(
      migration,
      /NEW\.relation_evidence_ledger_id[\s\S]*?knowledge\.relation_evidence_ledger[\s\S]*?relation_payload_hash/,
    );
    assert.match(
      migration,
      /NEW\.impact_path_v2_id[\s\S]*?analytics\.impact_path_v2[\s\S]*?v_pack_snapshot_id[\s\S]*?path\.status = 'sealed'/,
    );
    assert.match(
      migration,
      /NEW\.relation_measurement_id[\s\S]*?analytics\.relation_measurement[\s\S]*?v_pack_snapshot_id/,
    );
  });

  it('never mutates legacy serving/ops tables', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /ALTER TABLE ops\./);
    assert.doesNotMatch(migration, /DELETE FROM/i);
    assert.doesNotMatch(migration, /UPDATE ops\./);
  });
});
