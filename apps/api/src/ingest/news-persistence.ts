export const ASSERT_NEWS_REVISION_LEDGER_SQL = `
SELECT (
  to_regclass('ops.source_document_revision') IS NOT NULL
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.source_documents'::regclass
      AND NOT tgisinternal
      AND tgname IN (
        'trg_prepare_source_document',
        'trg_record_source_document_revision'
      )
  ) = 2
) AS ready
`;

export const UPSERT_SOURCE_DOCUMENT_SQL = `
INSERT INTO public.source_documents (
  source_key, source_system, source_type, source_name, title, url, source_ref,
  published_at, collected_at, entity_key, entities, summary, raw_json,
  content_hash, provider_key, valid_at, known_at, revision_no,
  policy_decision, revision_fingerprint
) VALUES (
  $1, $2, $3, $4, $5, $6, $6,
  $7::timestamptz, $8::timestamptz, NULL, '{}'::text[], NULL, $9::jsonb,
  $10, $11, $12::timestamptz, $13::timestamptz, 1,
  $14, $15
)
ON CONFLICT (source_key) DO UPDATE SET
  source_name = EXCLUDED.source_name,
  title = EXCLUDED.title,
  url = EXCLUDED.url,
  source_ref = EXCLUDED.source_ref,
  published_at = EXCLUDED.published_at,
  collected_at = EXCLUDED.collected_at,
  raw_json = EXCLUDED.raw_json,
  content_hash = EXCLUDED.content_hash,
  provider_key = EXCLUDED.provider_key,
  valid_at = coalesce(EXCLUDED.published_at, public.source_documents.valid_at),
  known_at = EXCLUDED.known_at,
  policy_decision = EXCLUDED.policy_decision,
  title_ko = NULL,
  summary_ko = NULL,
  translated_at = NULL
WHERE ROW(
  public.source_documents.source_name,
  public.source_documents.title,
  public.source_documents.url,
  public.source_documents.published_at,
  public.source_documents.raw_json,
  public.source_documents.provider_key
) IS DISTINCT FROM ROW(
  EXCLUDED.source_name,
  EXCLUDED.title,
  EXCLUDED.url,
  EXCLUDED.published_at,
  EXCLUDED.raw_json,
  EXCLUDED.provider_key
)
RETURNING (xmax = 0) AS inserted
`;

export const LOAD_PENDING_TRANSLATIONS_SQL = `
SELECT id, title, summary, revision_fingerprint
FROM public.source_documents
WHERE source_system = 'rss_news'
  AND source_type = 'news'
  AND title_ko IS NULL
  AND coalesce(title, '') <> ''
ORDER BY id
LIMIT $1
`;

export const UPDATE_TRANSLATION_SQL = `
UPDATE public.source_documents
SET title_ko = $2,
    summary_ko = $3,
    translated_at = now()
WHERE id = $1::bigint
  AND revision_fingerprint = $4
  AND title_ko IS NULL
`;
