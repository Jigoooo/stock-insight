-- P0-8 — model / prompt registry seed + run-manifest binding (roadmap §4 P0-8).
-- Registers every model + prompt/verifier version the pipelines actually use so
-- run outputs are traceable to exact model/prompt/schema versions (stored
-- output replay contract, ADR-001). Idempotent.

BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO ops.model_registry (model_id, role, dimension, config, status)
VALUES
  ('gemini-3.1-flash-lite', 'extraction', NULL,
   '{"provider":"google","usage":"knowledge claim/event extraction","temperature":0,"structured_output":true}'::jsonb,
   'active'),
  ('gemini-3.1-flash-lite:translation', 'translation', NULL,
   '{"provider":"google","usage":"news KO translation"}'::jsonb,
   'active'),
  ('tnic-reference-tfidf-v1', 'ranking', NULL,
   '{"usage":"product similarity (PRODUCT_SIMILARITY builder)","method":"tfidf-cosine","deterministic":true}'::jsonb,
   'active'),
  ('pearson-returns-v1', 'ranking', NULL,
   '{"usage":"relation_measurement price correlation","method":"pearson_daily_returns","deterministic":true}'::jsonb,
   'active')
ON CONFLICT (model_id) DO NOTHING;

INSERT INTO ops.prompt_registry (prompt_id, version, role, template_hash, template_uri, eval_result, status)
VALUES
  ('knowledge-extraction', 1, 'extraction',
   encode(sha256(convert_to('extract-v1:claims+events:allowlist+quote-verbatim', 'UTF8')), 'hex'),
   'apps/api/src/ingest/run-knowledge-extraction.ts#geminiExtract',
   '{"gates":["predicate_allowlist","quote_must_exist_in_source"],"validated":"2026-07-20"}'::jsonb,
   'active'),
  ('assertion-semantics-verifier', 1, 'nli',
   encode(sha256(convert_to('assertion-semantics-v1:polarity+modality+attribution+condition+correction+numeric', 'UTF8')), 'hex'),
   'apps/api/src/ingest/assertion-semantics.ts#verifyAssertionSemantics',
   '{"kind":"deterministic_rule_verifier","tests":"apps/api/test/assertion-semantics.test.ts","validated":"2026-07-20"}'::jsonb,
   'active'),
  ('impact-path-rule-engine', 2, 'ranking',
   encode(sha256(convert_to('impact-v2-r1:bounded-walk+hop-decay+freshness', 'UTF8')), 'hex'),
   'apps/api/src/analytics/run-v2-analytics-publish.ts',
   '{"kind":"deterministic_rule_engine","note":"industrial linkage, never price prediction"}'::jsonb,
   'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.migration_runs (run_id, job_name, source_system, status, started_at, finished_at, rows_read, rows_written, rows_skipped, error, summary)
VALUES (gen_random_uuid()::text, 'p0-8-registry-seed', 'governance', 'completed', now(), now(), 0, 7, 0, NULL,
        '{"action":"seed model/prompt registry for run-manifest binding"}'::jsonb);

COMMIT;

SELECT 'models', count(*) FROM ops.model_registry;
SELECT 'prompts', count(*) FROM ops.prompt_registry;
