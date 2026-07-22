\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_reader') THEN
    CREATE ROLE stock_insight_reader NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_writer') THEN
    CREATE ROLE stock_insight_writer NOLOGIN;
  END IF;
END
$$;

ALTER ROLE stock_insight_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE stock_insight_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT stock_insight_reader TO stock_insight_writer;
GRANT CONNECT ON DATABASE research_app TO stock_insight_reader, stock_insight_writer;
GRANT USAGE ON SCHEMA public, ops, stock, personalization
  TO stock_insight_reader, stock_insight_writer;
GRANT USAGE ON SCHEMA watchlist TO stock_insight_reader, stock_insight_writer;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, ops, stock, watchlist, personalization
  FROM stock_insight_reader, stock_insight_writer;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, ops
  FROM stock_insight_reader, stock_insight_writer;

ALTER TABLE public.app_mutation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_auth_bootstrap_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_local_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_auth_bootstrap_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_local_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_decision_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feed_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.analysis_job_events TO stock_insight_reader;
GRANT SELECT ON public.analysis_jobs TO stock_insight_reader;
GRANT SELECT ON public.app_mutation_idempotency TO stock_insight_reader;
GRANT SELECT ON public.app_auth_bootstrap_state TO stock_insight_reader;
GRANT SELECT ON public.app_local_accounts TO stock_insight_reader;
GRANT SELECT ON public.app_user_identity_map TO stock_insight_reader;
GRANT SELECT ON public.change_events TO stock_insight_reader;
GRANT SELECT ON public.company_financials TO stock_insight_reader;
GRANT SELECT ON public.company_profiles TO stock_insight_reader;
GRANT SELECT ON public.entities TO stock_insight_reader;
GRANT SELECT ON public.entity_glossary_terms TO stock_insight_reader;
GRANT SELECT ON public.entity_reach_cache TO stock_insight_reader;
GRANT SELECT ON public.market_signals TO stock_insight_reader;
GRANT SELECT ON public.migration_runs TO stock_insight_reader;
GRANT SELECT ON public.publication_records TO stock_insight_reader;
GRANT SELECT ON public.record_sources TO stock_insight_reader;
GRANT SELECT ON public.source_documents TO stock_insight_reader;
GRANT SELECT ON public.stock_learning_cards TO stock_insight_reader;
GRANT SELECT ON public.user_alert_events TO stock_insight_reader;
GRANT SELECT ON public.user_decision_journal_entries TO stock_insight_reader;
GRANT SELECT ON public.user_feed_index TO stock_insight_reader;
GRANT SELECT ON public.user_notification_rules TO stock_insight_reader;
GRANT SELECT ON public.user_positions TO stock_insight_reader;
GRANT SELECT ON public.user_watchlist TO stock_insight_reader;
GRANT SELECT ON public.v_graph_adjacency TO stock_insight_reader;
GRANT SELECT ON public.v_stock_learning_status TO stock_insight_reader;
GRANT SELECT ON public.v_user_decision_history_v3 TO stock_insight_reader;
GRANT SELECT ON public.v_user_feed_dedup TO stock_insight_reader;

GRANT SELECT ON ops.analysis_run_record_source TO stock_insight_reader;
GRANT SELECT ON ops.current_temporal_graph_edge TO stock_insight_reader;
GRANT SELECT ON ops.dataset_watermark TO stock_insight_reader;
GRANT SELECT ON ops.graph_evidence TO stock_insight_reader;
GRANT SELECT ON ops.internal_web_publication_records TO stock_insight_reader;
GRANT SELECT ON ops.publication_projection_status TO stock_insight_reader;
GRANT SELECT ON ops.source_document_revision TO stock_insight_reader;
GRANT SELECT ON ops.temporal_graph_edge TO stock_insight_reader;
GRANT SELECT ON ops.temporal_graph_edge_evidence TO stock_insight_reader;
GRANT SELECT ON ops.temporal_graph_evidence_health TO stock_insight_reader;

GRANT SELECT ON stock.candidates TO stock_insight_reader;
GRANT SELECT ON stock.market_snapshots TO stock_insight_reader;
GRANT SELECT ON watchlist.deep_cache TO stock_insight_reader;

GRANT SELECT ON personalization.user_profile_revision TO stock_insight_reader;
GRANT SELECT ON personalization.portfolio_snapshot TO stock_insight_reader;
GRANT SELECT ON personalization.portfolio_lot_snapshot TO stock_insight_reader;
GRANT SELECT ON personalization.portfolio_snapshot_seal TO stock_insight_reader;
GRANT SELECT ON personalization.thesis_revision TO stock_insight_reader;
GRANT SELECT ON personalization.decision_packet TO stock_insight_reader;
GRANT SELECT ON personalization.decision_packet_legal_review TO stock_insight_reader;

GRANT INSERT, UPDATE ON public.user_watchlist TO stock_insight_writer;
GRANT INSERT, UPDATE ON public.user_positions TO stock_insight_writer;
GRANT INSERT, UPDATE ON public.app_mutation_idempotency TO stock_insight_writer;
GRANT INSERT ON public.app_auth_bootstrap_state TO stock_insight_writer;
GRANT INSERT ON public.app_local_accounts TO stock_insight_writer;
GRANT INSERT ON personalization.user_profile_revision TO stock_insight_writer;
GRANT INSERT ON personalization.portfolio_snapshot TO stock_insight_writer;
GRANT INSERT ON personalization.portfolio_lot_snapshot TO stock_insight_writer;
GRANT INSERT ON personalization.portfolio_snapshot_seal TO stock_insight_writer;
GRANT INSERT ON personalization.thesis_revision TO stock_insight_writer;
GRANT INSERT ON personalization.decision_packet TO stock_insight_writer;
GRANT USAGE ON SEQUENCE public.user_watchlist_id_seq TO stock_insight_writer;
GRANT USAGE ON SEQUENCE public.user_positions_id_seq TO stock_insight_writer;

DO $policies$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'public.analysis_job_events',
    'public.analysis_jobs',
    'public.change_events',
    'public.company_financials',
    'public.company_profiles',
    'public.entities',
    'public.entity_glossary_terms',
    'public.entity_reach_cache',
    'public.market_signals',
    'public.migration_runs',
    'public.publication_records',
    'public.record_sources',
    'public.source_documents',
    'public.stock_learning_cards'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS stock_insight_reader_global ON %s', relation_name);
    EXECUTE format(
      'CREATE POLICY stock_insight_reader_global ON %s FOR SELECT TO stock_insight_reader USING (true)',
      relation_name
    );
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'public.app_mutation_idempotency',
    'public.app_user_identity_map',
    'public.user_feed_index',
    'public.user_positions',
    'public.user_watchlist'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS stock_insight_reader_scope ON %s', relation_name);
    EXECUTE format(
      'CREATE POLICY stock_insight_reader_scope ON %s FOR SELECT TO stock_insight_reader USING (user_id = nullif(current_setting(''stock_insight.user_id'', true), '''')::uuid)',
      relation_name
    );
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'public.user_alert_events',
    'public.user_decision_journal_entries',
    'public.user_notification_rules'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS stock_insight_reader_legacy_scope ON %s', relation_name);
    EXECUTE format(
      'CREATE POLICY stock_insight_reader_legacy_scope ON %s FOR SELECT TO stock_insight_reader USING (user_id = (SELECT identity_map.legacy_user_id FROM public.app_user_identity_map identity_map WHERE identity_map.user_id = nullif(current_setting(''stock_insight.user_id'', true), '''')::uuid))',
      relation_name
    );
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'public.app_mutation_idempotency',
    'public.user_positions',
    'public.user_watchlist'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS stock_insight_writer_insert ON %s', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS stock_insight_writer_update ON %s', relation_name);
    EXECUTE format(
      'CREATE POLICY stock_insight_writer_insert ON %s FOR INSERT TO stock_insight_writer WITH CHECK (user_id = nullif(current_setting(''stock_insight.user_id'', true), '''')::uuid)',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY stock_insight_writer_update ON %s FOR UPDATE TO stock_insight_writer USING (user_id = nullif(current_setting(''stock_insight.user_id'', true), '''')::uuid) WITH CHECK (user_id = nullif(current_setting(''stock_insight.user_id'', true), '''')::uuid)',
      relation_name
    );
  END LOOP;
END
$policies$;

DROP POLICY IF EXISTS stock_insight_reader_scope ON public.app_local_accounts;
CREATE POLICY stock_insight_reader_scope ON public.app_local_accounts FOR SELECT TO stock_insight_reader
  USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);

DROP POLICY IF EXISTS stock_insight_writer_insert ON public.app_local_accounts;
CREATE POLICY stock_insight_writer_insert ON public.app_local_accounts FOR INSERT TO stock_insight_writer
  WITH CHECK (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);

DROP POLICY IF EXISTS stock_insight_reader_scope ON public.app_auth_bootstrap_state;
CREATE POLICY stock_insight_reader_scope ON public.app_auth_bootstrap_state FOR SELECT TO stock_insight_reader
  USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);

DROP POLICY IF EXISTS stock_insight_writer_insert ON public.app_auth_bootstrap_state;
CREATE POLICY stock_insight_writer_insert ON public.app_auth_bootstrap_state FOR INSERT TO stock_insight_writer
  WITH CHECK (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);

ALTER VIEW public.v_user_decision_history_v3 SET (security_invoker = true);
ALTER VIEW public.v_user_feed_dedup SET (security_invoker = true);

COMMIT;
