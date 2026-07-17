import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import { buildNewsIngestAudit, type RssNewsBundle, type SourceDocumentSeed } from './news-rss.ts';

const JOB_NAME = 'stock-insight-rss-news-ingest';
const DEFAULT_RESEARCH_COMMON = join(homedir(), '.hermes/workspace/research-common');

const UPSERT_SOURCE_DOCUMENT_SQL = `
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
  valid_at = EXCLUDED.valid_at,
  known_at = CASE
    WHEN public.source_documents.revision_fingerprint <> EXCLUDED.revision_fingerprint
      THEN EXCLUDED.known_at
    ELSE public.source_documents.known_at
  END,
  revision_no = CASE
    WHEN public.source_documents.revision_fingerprint <> EXCLUDED.revision_fingerprint
      THEN public.source_documents.revision_no + 1
    ELSE public.source_documents.revision_no
  END,
  policy_decision = EXCLUDED.policy_decision,
  revision_fingerprint = EXCLUDED.revision_fingerprint
RETURNING (xmax = 0) AS inserted
`;

// Conservative linkage only: exact normalized title within ±7 days. If more
// than one candidate document exists, skip rather than guess.
const LINK_SIGNALS_SQL = `
WITH signal_norm AS (
  SELECT
    signal.id,
    signal.occurred_at,
    regexp_replace(
      regexp_replace(lower(signal.summary_text), '\\s+-\\s+[^-]+$', ''),
      '[^[:alnum:]가-힣]+', '', 'g'
    ) AS title_norm
  FROM public.market_signals signal
  WHERE signal.source_document_id IS NULL
    AND coalesce(signal.summary_text, '') <> ''
), document_norm AS (
  SELECT
    document.id,
    coalesce(document.published_at, document.valid_at, document.collected_at) AS document_at,
    regexp_replace(lower(document.title), '[^[:alnum:]가-힣]+', '', 'g') AS title_norm
  FROM public.source_documents document
  WHERE document.source_system = 'rss_news'
    AND document.source_type = 'news'
    AND coalesce(document.title, '') <> ''
), candidates AS (
  SELECT
    signal.id AS signal_id,
    document.id AS document_id,
    count(*) OVER (PARTITION BY signal.id) AS candidate_count,
    row_number() OVER (
      PARTITION BY signal.id
      ORDER BY abs(extract(epoch FROM (document.document_at - signal.occurred_at))), document.id
    ) AS candidate_rank
  FROM signal_norm signal
  JOIN document_norm document
    ON document.title_norm = signal.title_norm
   AND length(document.title_norm) >= 16
   AND document.document_at BETWEEN signal.occurred_at - interval '7 days'
                                AND signal.occurred_at + interval '7 days'
)
UPDATE public.market_signals signal
SET source_document_id = candidate.document_id
FROM candidates candidate
WHERE signal.id = candidate.signal_id
  AND candidate.candidate_count = 1
  AND candidate.candidate_rank = 1
RETURNING signal.id
`;

const ENRICH_DOCUMENT_ENTITIES_SQL = `
WITH unique_entity AS (
  SELECT
    signal.source_document_id AS document_id,
    min(entity.entity_key) AS entity_key
  FROM public.market_signals signal
  JOIN public.entities entity ON entity.id = signal.entity_id
  WHERE signal.source_document_id IS NOT NULL
  GROUP BY signal.source_document_id
  HAVING count(DISTINCT entity.entity_key) = 1
)
UPDATE public.source_documents document
SET entity_key = unique_entity.entity_key,
    entities = ARRAY[unique_entity.entity_key]
FROM unique_entity
WHERE document.id = unique_entity.document_id
  AND document.source_system = 'rss_news'
  AND document.entity_key IS NULL
RETURNING document.id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'rss-news', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

type UpsertRow = QueryResultRow & { inserted: boolean };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

function collectBundle(forceRefresh: boolean): Promise<RssNewsBundle> {
  const researchCommon = process.env.RESEARCH_COMMON_PATH?.trim() || DEFAULT_RESEARCH_COMMON;
  const python = process.env.PYTHON_BIN?.trim() || 'python3';
  const code = [
    'import json',
    'from research_common.news_feeds import collect_news',
    `result=collect_news(domains=('macro','stock'),per_feed=8,max_total=80,timeout=12,force_refresh=${forceRefresh ? 'True' : 'False'})`,
    'print(json.dumps(result, ensure_ascii=False))',
  ].join(';');

  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-c', code], {
      cwd: researchCommon,
      env: { ...process.env, PYTHONPATH: researchCommon },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (codeValue) => {
      if (codeValue !== 0) {
        reject(new Error(`news collector failed (${codeValue}): ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as RssNewsBundle);
      } catch (error) {
        reject(new Error(`news collector returned invalid JSON: ${String(error)}`));
      }
    });
  });
}

async function upsertSeed(client: PoolClient, seed: SourceDocumentSeed): Promise<boolean> {
  const result = await client.query<UpsertRow>(UPSERT_SOURCE_DOCUMENT_SQL, [
    seed.sourceKey,
    seed.sourceSystem,
    seed.sourceType,
    seed.sourceName,
    seed.title,
    seed.url,
    seed.publishedAt ?? null,
    seed.collectedAt,
    JSON.stringify(seed.rawJson),
    seed.contentHash,
    seed.providerKey,
    seed.validAt,
    seed.knownAt,
    seed.policyDecision,
    seed.revisionFingerprint,
  ]);
  return result.rows[0]?.inserted === true;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const forceRefresh = process.argv.includes('--force-refresh');
  const startedAt = new Date();
  const bundle = await collectBundle(forceRefresh);
  const audit = buildNewsIngestAudit(bundle, new Date().toISOString());

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          readOnly: true,
          audit: { ...audit, seeds: undefined },
          preview: audit.seeds.slice(0, 5),
        },
        null,
        2,
      ),
    );
    return;
  }

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let signalsLinked = 0;
  let documentsEnriched = 0;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', '120s', true)");
    await client.query("SELECT set_config('lock_timeout', '5s', true)");
    for (const seed of audit.seeds) {
      if (await upsertSeed(client, seed)) inserted += 1;
      else updated += 1;
    }
    signalsLinked = (await client.query(LINK_SIGNALS_SQL)).rowCount ?? 0;
    documentsEnriched = (await client.query(ENRICH_DOCUMENT_ENTITIES_SQL)).rowCount ?? 0;
    const summary = {
      collected: audit.collected,
      eligible: audit.eligible,
      inserted,
      updated,
      skipped: audit.skipped,
      duplicateUrls: audit.duplicateUrls,
      feedErrors: audit.feedErrors,
      signalsLinked,
      documentsEnriched,
    };
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `rss-news-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      audit.collected,
      inserted + updated,
      audit.skipped + audit.duplicateUrls,
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: summary }, null, 2));
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

await run();
