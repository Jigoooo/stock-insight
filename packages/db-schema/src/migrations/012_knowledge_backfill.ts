export const knowledgeBackfillMigrationSql = `
-- SET D / D-2~D-4: idempotent backfill into the knowledge layer.
--  D-2: public.source_documents -> knowledge.document (all systems, provider-resolved)
--  D-3: deterministic entity linking (legacy entity_key + ticker/alias exact matches)
--  D-4: market_signals triage — event-type signals promoted to knowledge.event,
--       numeric signals stay transitional (analytics input), narrative-only rows
--       are exposed via a quarantine view (never counted as evidence).

-- D-2. Documents. Idempotency anchor: legacy_source_document_pk.
WITH provider_map AS (
  SELECT provider_key, source_id FROM ingestion.source
), fallback AS (
  SELECT source_id FROM ingestion.source WHERE provider_key = 'rss-news-bundle'
)
INSERT INTO knowledge.document (
  source_id, source_document_id, source_type, canonical_url, title,
  published_at, observed_at, available_at, language_code, content_hash,
  raw_object_uri, processing_status, legacy_source_document_pk, metadata
)
SELECT
  coalesce(provider_map.source_id, (SELECT source_id FROM fallback)),
  legacy.source_key,
  legacy.source_type,
  nullif(legacy.url, ''),
  legacy.title,
  legacy.published_at,
  coalesce(legacy.collected_at, legacy.created_at, now()),
  coalesce(legacy.known_at, legacy.collected_at, legacy.created_at, now()),
  CASE WHEN legacy.title ~ '[가-힣]' THEN 'ko' ELSE 'en' END,
  coalesce(nullif(legacy.content_hash, ''), md5(coalesce(legacy.title, '') || legacy.id::text)),
  'legacy:pg-source_documents/' || legacy.id::text,
  'pending',
  legacy.id,
  jsonb_build_object(
    'source_system', legacy.source_system,
    'provider_key', legacy.provider_key,
    'title_ko', legacy.title_ko,
    'summary', legacy.summary,
    'summary_ko', legacy.summary_ko,
    'policy_decision', legacy.policy_decision,
    'revision_no', legacy.revision_no,
    'backfill', 'source-documents-v1'
  )
FROM public.source_documents legacy
LEFT JOIN provider_map ON provider_map.provider_key = legacy.provider_key
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.document existing
  WHERE existing.legacy_source_document_pk = legacy.id
)
ON CONFLICT (source_id, content_hash) DO NOTHING;

-- D-3a. Entity links carried over from legacy entity_key (highest trust).
INSERT INTO knowledge.document_entity (document_id, entity_id, link_method, confidence)
SELECT DISTINCT document.document_id, stock_ident.entity_id, 'legacy_key', 0.95
FROM knowledge.document document
JOIN public.source_documents legacy ON legacy.id = document.legacy_source_document_pk
JOIN core.entity_identifier stock_ident
  ON stock_ident.identifier_type = 'INTERNAL_KEY'
 AND stock_ident.identifier_value = legacy.entity_key
WHERE legacy.entity_key IS NOT NULL
ON CONFLICT DO NOTHING;

-- D-3b. Ticker-exact linking for US news titles (word-boundary uppercase symbol).
-- KR 6-digit codes rarely appear in titles; alias linking covers KR names instead.
INSERT INTO knowledge.document_entity (document_id, entity_id, link_method, confidence)
SELECT DISTINCT document.document_id, universe.security_entity_id, 'symbol_exact', 0.85
FROM knowledge.document document
JOIN core.v_security_universe universe
  ON universe.market = 'US'
 AND length(universe.ticker) >= 2                      -- 1-letter tickers are too ambiguous
 AND document.title ~ ('\\m' || universe.ticker || '\\M')
WHERE document.source_type = 'news'
  AND document.title IS NOT NULL
ON CONFLICT DO NOTHING;

-- D-3c. Alias-exact linking (KR company display names in Korean titles).
INSERT INTO knowledge.document_entity (document_id, entity_id, link_method, confidence)
SELECT DISTINCT document.document_id, alias.entity_id, 'alias_exact', 0.80
FROM knowledge.document document
JOIN core.entity_alias alias ON length(alias.alias_text) >= 3
JOIN core.entity stock ON stock.entity_id = alias.entity_id AND stock.entity_type = 'Stock'
WHERE document.source_type = 'news'
  AND document.title IS NOT NULL
  AND position(alias.alias_text IN document.title) > 0
ON CONFLICT DO NOTHING;

-- D-4a. Event-type signals -> knowledge.event (dedupe_key = 'legacy-signal:' || id).
WITH signal_target AS (
  SELECT signal.id, signal.signal_type, signal.occurred_at, signal.collected_at,
         signal.magnitude, signal.summary_text, signal.source_name, signal.domain,
         stock_ident.entity_id AS target_entity_id
  FROM public.market_signals signal
  JOIN public.entities legacy_entity ON legacy_entity.id = signal.entity_id
  LEFT JOIN core.entity_identifier stock_ident
    ON stock_ident.identifier_type = 'INTERNAL_KEY'
   AND stock_ident.identifier_value = legacy_entity.entity_key
  WHERE signal.signal_type IN ('sec_8k','insider_trade','policy_event','analyst','disclosure')
)
INSERT INTO knowledge.event (
  event_type, target_entity_id, occurred_at, announced_at, magnitude,
  verification_status, dedupe_key, summary_text, extraction_run_id, metadata
)
SELECT
  signal_target.signal_type,
  signal_target.target_entity_id,
  signal_target.occurred_at,
  signal_target.occurred_at,
  signal_target.magnitude,
  'unverified',
  'legacy-signal:' || signal_target.id::text,
  left(signal_target.summary_text, 2000),
  'legacy-signal-triage-v1',
  jsonb_build_object('domain', signal_target.domain, 'source_name', signal_target.source_name,
                     'legacy_signal_id', signal_target.id, 'provenance', 'legacy_no_document')
FROM signal_target
ON CONFLICT (dedupe_key) DO NOTHING;

-- D-4b. Quarantine view over narrative-only signals (no document, no magnitude).
CREATE OR REPLACE VIEW knowledge.v_signal_quarantine AS
SELECT signal.id, signal.signal_type, signal.domain, signal.summary_text,
       signal.occurred_at, 'untrusted_legacy'::text AS verification_status
FROM public.market_signals signal
WHERE signal.source_document_id IS NULL
  AND signal.magnitude IS NULL
  AND signal.signal_type NOT IN ('sec_8k','insider_trade','policy_event','analyst','disclosure');

-- D-4c. Numeric-signal registry view (analytics input; NOT knowledge evidence).
CREATE OR REPLACE VIEW knowledge.v_signal_numeric AS
SELECT signal.id, signal.signal_type, signal.domain, signal.magnitude,
       signal.summary_text, signal.occurred_at, signal.entity_id AS legacy_entity_id
FROM public.market_signals signal
WHERE signal.magnitude IS NOT NULL
  AND signal.signal_type NOT IN ('sec_8k','insider_trade','policy_event','analyst','disclosure');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON knowledge.v_signal_quarantine, knowledge.v_signal_numeric
      TO stock_insight_app_reader;
  END IF;
END $$;
`;
