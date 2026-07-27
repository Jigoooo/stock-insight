import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import { assertKnowledgeSyncComplete } from './knowledge-revision-contract.ts';

const JOB_NAME = 'stock-insight-knowledge-document-sync';
const APPLY = process.argv.includes('--apply');

const PLAN_SQL = `
WITH provider_map AS (
  SELECT provider_key, source_id FROM ingestion.source
), fallback AS (
  SELECT source_id FROM ingestion.source WHERE provider_key = 'rss-news-bundle'
), source_rows AS (
  SELECT legacy.*,
         coalesce(provider_map.source_id, (SELECT source_id FROM fallback)) AS resolved_source_id
  FROM public.source_documents legacy
  LEFT JOIN provider_map ON provider_map.provider_key = legacy.provider_key
  WHERE legacy.source_system = 'rss_news'
    AND legacy.source_type = 'news'
)
SELECT
  count(*)::int AS source_documents,
  count(*) FILTER (WHERE document.document_id IS NULL)::int AS unpromoted,
  count(*) FILTER (
    WHERE document.document_id IS NOT NULL
      AND document.metadata ->> 'source_revision_fingerprint'
          IS DISTINCT FROM source_rows.revision_fingerprint
  )::int AS revision_drift,
  count(*) FILTER (
    WHERE document.document_id IS NOT NULL
      AND length(trim(coalesce(source_rows.title,'') || E'\n' || coalesce(source_rows.summary,''))) > 0
      AND NOT EXISTS (
        SELECT 1 FROM knowledge.document_chunk chunk
        WHERE chunk.document_id = document.document_id
          AND chunk.revision_no = source_rows.revision_no
          AND chunk.chunk_index = 0
      )
  )::int AS chunks_missing
FROM source_rows
LEFT JOIN knowledge.document document
  ON document.legacy_source_document_pk = source_rows.id
`;

const INSERT_DOCUMENTS_SQL = `
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
    'source_revision_fingerprint', legacy.revision_fingerprint,
    'knowledge_sync_run_id', current_setting('stock_insight.knowledge_sync_run_id'),
    'promoted_by', 'runtime-knowledge-sync-v1'
  )
FROM public.source_documents legacy
LEFT JOIN provider_map ON provider_map.provider_key = legacy.provider_key
WHERE legacy.source_system = 'rss_news'
  AND legacy.source_type = 'news'
  AND NOT EXISTS (
    SELECT 1 FROM knowledge.document existing
    WHERE existing.legacy_source_document_pk = legacy.id
  )
ON CONFLICT (source_id, content_hash) DO NOTHING
RETURNING document_id
`;

const UPDATE_DOCUMENTS_SQL = `
UPDATE knowledge.document document
SET canonical_url = nullif(legacy.url, ''),
    title = legacy.title,
    published_at = legacy.published_at,
    metadata = document.metadata || jsonb_build_object(
      'source_system', legacy.source_system,
      'provider_key', legacy.provider_key,
      'title_ko', legacy.title_ko,
      'summary', coalesce(legacy.summary, ''),
      'summary_ko', legacy.summary_ko,
      'policy_decision', legacy.policy_decision,
      'revision_no', legacy.revision_no,
      'source_revision_fingerprint', legacy.revision_fingerprint,
      'knowledge_sync_run_id', current_setting('stock_insight.knowledge_sync_run_id'),
      'promoted_by', 'runtime-knowledge-sync-v1'
    ),
    processing_status = 'pending'
FROM public.source_documents legacy
WHERE document.legacy_source_document_pk = legacy.id
  AND legacy.source_system = 'rss_news'
  AND legacy.source_type = 'news'
  AND (
    document.metadata ->> 'source_revision_fingerprint'
      IS DISTINCT FROM legacy.revision_fingerprint
    OR document.title IS DISTINCT FROM legacy.title
    OR document.canonical_url IS DISTINCT FROM nullif(legacy.url, '')
    OR document.published_at IS DISTINCT FROM legacy.published_at
  )
RETURNING document.document_id
`;

export const RECLAIM_PENDING_NEWS_SQL = `
UPDATE knowledge.document document
SET processing_status = 'pending',
    metadata = (
      document.metadata
      - 'knowledge_extraction_owner'
      - 'knowledge_extraction_claimed_sync_run_id'
      - 'knowledge_extraction_claimed_revision_no'
      - 'knowledge_extraction_claimed_at'
      - 'knowledge_extraction_lease_until'
    ) || jsonb_build_object(
      'knowledge_sync_run_id', current_setting('stock_insight.knowledge_sync_run_id'),
      'knowledge_sync_reclaim_history',
    coalesce(document.metadata -> 'knowledge_sync_reclaim_history', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'from_run_id', document.metadata ->> 'knowledge_sync_run_id',
      'to_run_id', current_setting('stock_insight.knowledge_sync_run_id'),
      'reclaimed_at', clock_timestamp()
    ))
)
WHERE document.source_type = 'news'
  AND document.legacy_source_document_pk IS NOT NULL
  AND document.metadata ->> 'promoted_by' = 'runtime-knowledge-sync-v1'
  AND document.metadata ->> 'source_system' = 'rss_news'
  AND document.metadata ->> 'knowledge_sync_run_id'
      IS DISTINCT FROM current_setting('stock_insight.knowledge_sync_run_id')
  AND (
    document.processing_status = 'pending'
    OR (
      document.processing_status = 'chunked'
      AND (
        document.metadata ->> 'knowledge_extraction_owner' IS NULL
        OR (document.metadata ->> 'knowledge_extraction_lease_until')::timestamptz
            <= clock_timestamp()
      )
    )
  )
RETURNING document.document_id
`;

const INSERT_CHUNKS_SQL = `
INSERT INTO knowledge.document_chunk (
  document_id, chunk_index, content, token_count, content_hash,
  revision_no, parser_version, available_at, ingested_at,
  source_revision_id, content_metadata
)
SELECT document.document_id,
       0,
       trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,'')),
       greatest(1, ceil(length(trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,''))) / 4.0)::integer),
       encode(sha256(convert_to(trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,'')), 'UTF8')), 'hex'),
       legacy.revision_no,
       'runtime-title-summary-v1',
       coalesce(legacy.known_at, legacy.collected_at, legacy.created_at, now()),
       now(),
       NULL,
       jsonb_build_object(
         'content_scope','title_and_summary_only',
         'full_body',false,
         'source_table','public.source_documents',
         'source_revision_fingerprint',legacy.revision_fingerprint,
         'policy','runtime-knowledge-sync-v1'
       )
FROM knowledge.document document
JOIN public.source_documents legacy ON legacy.id = document.legacy_source_document_pk
WHERE legacy.source_system = 'rss_news'
  AND legacy.source_type = 'news'
  AND length(trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,''))) > 0
ON CONFLICT (document_id, revision_no, chunk_index) DO NOTHING
RETURNING chunk_id
`;

const INSERT_LEGACY_LINKS_SQL = `
WITH unique_identity AS (
  SELECT identifier_value, min(entity_id) AS entity_id
  FROM core.entity_identifier
  WHERE identifier_type = 'INTERNAL_KEY'
    AND valid_to IS NULL
  GROUP BY identifier_value
  HAVING count(DISTINCT entity_id) = 1
)
INSERT INTO knowledge.document_entity (document_id, entity_id, link_method, confidence)
SELECT DISTINCT document.document_id, identity.entity_id, 'legacy_key', 0.95
FROM knowledge.document document
JOIN public.source_documents legacy ON legacy.id = document.legacy_source_document_pk
JOIN unique_identity identity ON identity.identifier_value = legacy.entity_key
WHERE legacy.entity_key IS NOT NULL
ON CONFLICT DO NOTHING
RETURNING document_id
`;

const INSERT_SYMBOL_LINKS_SQL = `
INSERT INTO knowledge.document_entity (document_id, entity_id, link_method, confidence)
SELECT DISTINCT document.document_id, universe.security_entity_id, 'symbol_exact', 0.85
FROM knowledge.document document
JOIN core.v_security_universe universe
  ON universe.market = 'US'
 AND length(universe.ticker) >= 2
 AND document.title ~ ('\\m' || universe.ticker || '\\M')
WHERE document.source_type = 'news'
  AND document.title IS NOT NULL
ON CONFLICT DO NOTHING
RETURNING document_id
`;

const INSERT_ALIAS_LINKS_SQL = `
WITH unique_alias AS (
  SELECT lower(alias.alias_text) AS alias_text, min(alias.entity_id) AS entity_id
  FROM core.entity_alias alias
  JOIN core.entity stock ON stock.entity_id = alias.entity_id AND stock.entity_type = 'Stock'
  WHERE length(alias.alias_text) >= 3
  GROUP BY lower(alias.alias_text)
  HAVING count(DISTINCT alias.entity_id) = 1
)
INSERT INTO knowledge.document_entity (document_id, entity_id, link_method, confidence)
SELECT DISTINCT document.document_id, alias.entity_id, 'alias_exact', 0.80
FROM knowledge.document document
JOIN unique_alias alias
  ON position(alias.alias_text IN lower(document.title)) > 0
WHERE document.source_type = 'news'
  AND document.title IS NOT NULL
ON CONFLICT DO NOTHING
RETURNING document_id
`;

const INSERT_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1,$2,'pipeline-sync','completed',$3,$4,$5,$6,$7,NULL,$8::jsonb)
`;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

type PlanRow = QueryResultRow & {
  source_documents: number;
  unpromoted: number;
  revision_drift: number;
  chunks_missing: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function plan(client: PoolClient): Promise<PlanRow> {
  const result = await client.query<PlanRow>(PLAN_SQL);
  const row = result.rows[0];
  if (!row) throw new Error('knowledge document sync plan returned no row');
  return row;
}

async function run(): Promise<void> {
  const startedAt = new Date();
  const syncRunId = process.env.KNOWLEDGE_SYNC_RUN_ID?.trim() || `knowledge-sync-${randomUUID()}`;
  if (!/^knowledge-sync-[A-Za-z0-9._:-]{8,200}$/.test(syncRunId)) {
    throw new Error('KNOWLEDGE_SYNC_RUN_ID has an invalid format');
  }
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    if (!APPLY) {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const before = await plan(client);
      await client.query('COMMIT');
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: before }, null, 2));
      return;
    }

    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('stock-insight-knowledge-document-sync',0))",
    );
    await client.query("SELECT set_config('statement_timeout','300s',true)");
    await client.query("SELECT set_config('stock_insight.knowledge_sync_run_id',$1,true)", [
      syncRunId,
    ]);
    const before = await plan(client);
    const inserted = await client.query(INSERT_DOCUMENTS_SQL);
    const updated = await client.query(UPDATE_DOCUMENTS_SQL);
    const reclaimed = await client.query(RECLAIM_PENDING_NEWS_SQL);
    const chunks = await client.query(INSERT_CHUNKS_SQL);
    const legacyLinks = await client.query(INSERT_LEGACY_LINKS_SQL);
    const symbolLinks = await client.query(INSERT_SYMBOL_LINKS_SQL);
    const aliasLinks = await client.query(INSERT_ALIAS_LINKS_SQL);
    const after = await plan(client);
    assertKnowledgeSyncComplete(after);
    const rowsWritten =
      (inserted.rowCount ?? 0) +
      (updated.rowCount ?? 0) +
      (reclaimed.rowCount ?? 0) +
      (chunks.rowCount ?? 0) +
      (legacyLinks.rowCount ?? 0) +
      (symbolLinks.rowCount ?? 0) +
      (aliasLinks.rowCount ?? 0);
    const audit = {
      before,
      inserted: inserted.rowCount ?? 0,
      updated: updated.rowCount ?? 0,
      reclaimed: reclaimed.rowCount ?? 0,
      chunksInserted: chunks.rowCount ?? 0,
      linksInserted:
        (legacyLinks.rowCount ?? 0) + (symbolLinks.rowCount ?? 0) + (aliasLinks.rowCount ?? 0),
      after,
    };
    await client.query(INSERT_RUN_SQL, [
      syncRunId,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      before.source_documents,
      rowsWritten,
      after.unpromoted,
      JSON.stringify(audit),
    ]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, syncRunId, audit }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
