import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const sql = readFileSync(new URL('../src/roles/application_roles.sql', import.meta.url), 'utf8');

describe('least-privilege application database roles', () => {
  it('creates non-login reader/writer capability roles', () => {
    assert.match(sql, /CREATE ROLE stock_insight_reader NOLOGIN/i);
    assert.match(sql, /CREATE ROLE stock_insight_writer NOLOGIN/i);
    assert.match(sql, /GRANT stock_insight_reader TO stock_insight_writer/i);
    assert.match(
      sql,
      /ALTER ROLE stock_insight_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/i,
    );
    assert.match(
      sql,
      /ALTER ROLE stock_insight_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/i,
    );
  });

  it('grants reads only on enumerated app relations rather than all tables', () => {
    assert.doesNotMatch(sql, /GRANT SELECT ON ALL TABLES/i);
    assert.match(sql, /GRANT SELECT ON public\.entities/i);
    assert.match(sql, /GRANT SELECT ON public\.v_user_decision_history_v3/i);
    assert.match(sql, /GRANT SELECT ON ops\.current_temporal_graph_edge/i);
    assert.match(sql, /GRANT SELECT ON stock\.candidates/i);
    assert.match(sql, /GRANT USAGE ON SCHEMA watchlist/i);
    assert.match(sql, /GRANT SELECT ON watchlist\.deep_cache/i);
  });

  it('limits writes to portfolio and idempotency ledgers without delete or truncate', () => {
    assert.match(sql, /GRANT INSERT, UPDATE ON public\.user_watchlist/i);
    assert.match(sql, /GRANT INSERT, UPDATE ON public\.user_positions/i);
    assert.match(sql, /GRANT INSERT, UPDATE ON public\.app_mutation_idempotency/i);
    assert.match(sql, /GRANT USAGE ON SEQUENCE public\.user_watchlist_id_seq/i);
    assert.match(sql, /GRANT USAGE ON SEQUENCE public\.user_positions_id_seq/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:[^;]*\b)?DELETE\b/i);
    assert.doesNotMatch(sql, /GRANT\s+(?:[^;]*\b)?TRUNCATE\b/i);
  });

  it('binds user rows to the transaction-local canonical UUID and hardens user views', () => {
    assert.match(sql, /current_setting\(''stock_insight\.user_id'', true\)/i);
    assert.match(sql, /app_user_identity_map/i);
    assert.match(sql, /legacy_user_id/i);
    assert.match(
      sql,
      /ALTER VIEW public\.v_user_decision_history_v3 SET \(security_invoker = true\)/i,
    );
    assert.match(sql, /ALTER VIEW public\.v_user_feed_dedup SET \(security_invoker = true\)/i);
  });

  it('enables row-level security on every user-scoped relation before creating policies', () => {
    for (const relation of [
      'app_local_accounts',
      'app_auth_bootstrap_state',
      'app_mutation_idempotency',
      'app_user_identity_map',
      'user_alert_events',
      'user_decision_journal_entries',
      'user_feed_index',
      'user_notification_rules',
      'user_positions',
      'user_watchlist',
    ]) {
      assert.match(
        sql,
        new RegExp(`ALTER TABLE public\\.${relation} ENABLE ROW LEVEL SECURITY`, 'i'),
        `${relation} must not rely on an out-of-band RLS activation`,
      );
    }
  });

  it('grants scoped local-account reads and insert-only enrollment writes', () => {
    assert.match(sql, /GRANT SELECT ON public\.app_local_accounts TO stock_insight_reader/i);
    assert.match(sql, /GRANT INSERT ON public\.app_local_accounts TO stock_insight_writer/i);
    assert.match(sql, /GRANT SELECT ON public\.app_auth_bootstrap_state TO stock_insight_reader/i);
    assert.match(sql, /GRANT INSERT ON public\.app_auth_bootstrap_state TO stock_insight_writer/i);
    assert.match(sql, /ALTER TABLE public\.app_local_accounts FORCE ROW LEVEL SECURITY/i);
    assert.match(sql, /ALTER TABLE public\.app_auth_bootstrap_state FORCE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(
      sql,
      /GRANT\s+[^;]*\bUPDATE\b[^;]*ON public\.app_local_accounts TO stock_insight_writer/i,
    );
    assert.doesNotMatch(
      sql,
      /GRANT\s+[^;]*\b(?:DELETE|TRUNCATE)\b[^;]*ON public\.app_local_accounts TO stock_insight_writer/i,
    );
    assert.match(
      sql,
      /CREATE POLICY stock_insight_reader_scope\s+ON public\.app_local_accounts\s+FOR SELECT\s+TO stock_insight_reader\s+USING \(user_id = nullif\(current_setting\('stock_insight\.user_id', true\), ''\)::uuid\)/i,
    );
    assert.match(
      sql,
      /CREATE POLICY stock_insight_writer_insert\s+ON public\.app_local_accounts\s+FOR INSERT\s+TO stock_insight_writer\s+WITH CHECK \(user_id = nullif\(current_setting\('stock_insight\.user_id', true\), ''\)::uuid\)/i,
    );
    assert.doesNotMatch(
      sql,
      /CREATE POLICY \S+ ON public\.app_local_accounts FOR (?:UPDATE|DELETE)/i,
    );
    assert.doesNotMatch(
      sql,
      /GRANT\s+[^;]*\b(?:UPDATE|DELETE|TRUNCATE)\b[^;]*ON public\.app_auth_bootstrap_state/i,
    );
  });

  it('recreates local-account policies safely when the roles script is rerun', () => {
    for (const policy of ['stock_insight_reader_scope', 'stock_insight_writer_insert']) {
      const dropIndex = sql.search(
        new RegExp(`DROP POLICY IF EXISTS ${policy} ON public\\.app_local_accounts`, 'i'),
      );
      const createIndex = sql.search(
        new RegExp(`CREATE POLICY ${policy} ON public\\.app_local_accounts`, 'i'),
      );
      assert.ok(dropIndex >= 0, `${policy} must be dropped idempotently`);
      assert.ok(createIndex > dropIndex, `${policy} must be recreated after its idempotent drop`);
    }
  });
});
