import { createHash, randomUUID } from 'node:crypto';
import { appendFile, link, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { PoolClient, QueryResultRow } from 'pg';

import { appendSourceRevision } from './source-revision-store.ts';

// SET B / B-1: content-addressed raw object store (local filesystem tier).
// Layout: {root}/{provider}/{yyyy}/{mm}/{hash[:2]}/{hash}.{ext}
// Manifest: {root}/_manifest/{yyyy-mm-dd}.jsonl (one line per stored object).
// MinIO/S3 promotion is a config change (swap `writeRawObject` impl), not a schema change.

const DEFAULT_ROOT = process.env.RAW_OBJECT_ROOT?.trim() || '/home/jigoo/hermes-work/raw-objects';

export type RawObjectRef = {
  contentHash: string;
  objectUri: string;
  bytes: number;
};

function sanitizeProviderKey(providerKey: string): string {
  // provider keys may contain ':' (rss:cnbc-markets) — keep readable, path-safe.
  return providerKey.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

export function hashContent(content: Buffer | string): string {
  return createHash('sha256')
    .update(typeof content === 'string' ? Buffer.from(content, 'utf8') : content)
    .digest('hex');
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function verifyExistingObject(filePath: string, contentHash: string): Promise<void> {
  const existing = await readFile(filePath);
  const actual = hashContent(existing);
  if (actual !== contentHash) {
    throw new Error(`existing raw object hash mismatch: expected ${contentHash}, got ${actual}`);
  }
}

async function syncDirectory(dir: string): Promise<void> {
  const handle = await open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Publish complete, fsynced bytes without ever truncating an existing object. */
async function publishNoClobber(
  dir: string,
  filePath: string,
  body: Buffer,
  contentHash: string,
): Promise<void> {
  const temporaryPath = join(dir, `.${contentHash}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(body);
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await link(temporaryPath, filePath);
    await syncDirectory(dir);
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
    await verifyExistingObject(filePath, contentHash);
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (errorCode(error) !== 'ENOENT') throw error;
    });
  }
}

export async function writeRawObject(options: {
  providerKey: string;
  content: Buffer | string;
  extension?: string;
  fetchedAt?: Date;
  root?: string;
}): Promise<RawObjectRef> {
  const root = options.root ?? DEFAULT_ROOT;
  const fetchedAt = options.fetchedAt ?? new Date();
  const body =
    typeof options.content === 'string' ? Buffer.from(options.content, 'utf8') : options.content;
  const contentHash = hashContent(body);
  const extension = (options.extension ?? 'bin').replace(/^\./, '');

  const year = String(fetchedAt.getUTCFullYear());
  const month = String(fetchedAt.getUTCMonth() + 1).padStart(2, '0');
  const shard = contentHash.slice(0, 2);
  const dir = join(root, sanitizeProviderKey(options.providerKey), year, month, shard);
  const filePath = join(dir, `${contentHash}.${extension}`);
  const objectUri = `file://${filePath}`;

  await mkdir(dir, { recursive: true });
  await publishNoClobber(dir, filePath, body, contentHash);

  return { contentHash, objectUri, bytes: body.byteLength };
}

/** Secondary manifest: call only after the authoritative DB transaction commits. */
export async function appendRawObjectManifest(options: {
  providerKey: string;
  ref: RawObjectRef;
  fetchedAt: Date;
  root?: string;
}): Promise<void> {
  const root = options.root ?? DEFAULT_ROOT;
  const year = String(options.fetchedAt.getUTCFullYear());
  const month = String(options.fetchedAt.getUTCMonth() + 1).padStart(2,'0');
  const day = `${year}-${month}-${String(options.fetchedAt.getUTCDate()).padStart(2,'0')}`;
  const manifestDir = join(root,'_manifest');
  await mkdir(manifestDir,{ recursive: true });
  await appendFile(join(manifestDir,`${day}.jsonl`),`${JSON.stringify({
    provider_key: options.providerKey,
    content_hash: options.ref.contentHash,
    object_uri: options.ref.objectUri,
    bytes: options.ref.bytes,
    fetched_at: options.fetchedAt.toISOString(),
  })}\n`,'utf8');
}

/** Read an immutable raw object and verify its bytes against the registered hash. */
export async function readRawObjectVerified(ref: {
  objectUri: string;
  contentHash: string;
}): Promise<Buffer> {
  if (!ref.objectUri.startsWith('file://')) {
    throw new Error(`unsupported raw object URI: ${ref.objectUri}`);
  }
  if (!/^[a-f0-9]{64}$/i.test(ref.contentHash)) {
    throw new Error('raw object contentHash must be SHA-256 hex');
  }
  const body = await readFile(ref.objectUri.slice('file://'.length));
  const actual = hashContent(body);
  if (actual !== ref.contentHash.toLowerCase()) {
    throw new Error(`raw object hash mismatch: expected ${ref.contentHash}, got ${actual}`);
  }
  return body;
}

export const REGISTER_RAW_OBJECT_SQL = `
INSERT INTO ingestion.raw_object (
  fetch_run_id, source_id, source_document_id, content_hash, object_uri, http_meta, fetched_at
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
ON CONFLICT (source_id, content_hash) DO NOTHING
RETURNING raw_object_id
`;

/**
 * Register the raw bytes and append their B2 source revision in the caller's
 * open transaction. Exact byte replays reuse the content-addressed raw row;
 * every provider record identity still receives deterministic lineage.
 */
export async function registerRawObjectWithRevision(
  client: PoolClient,
  input: {
    fetchRunId: number;
    sourceId: number;
    providerRecordKey: string;
    contentHash: string;
    objectUri: string;
    httpMeta: Record<string, unknown>;
    fetchedAt: string;
  },
): Promise<{ rawObjectId: number; rawInserted: boolean; objectUri: string; revisionNo: number; replay: boolean }> {
  const registered = await client.query<QueryResultRow & { raw_object_id: number; object_uri?: string; content_hash?: string }>(
    REGISTER_RAW_OBJECT_SQL,
    [
      input.fetchRunId,
      input.sourceId,
      input.providerRecordKey,
      input.contentHash,
      input.objectUri,
      JSON.stringify(input.httpMeta),
      input.fetchedAt,
    ],
  );
  const rawInserted = (registered.rowCount ?? 0) > 0;
  const existing = rawInserted
    ? registered
    : await client.query<QueryResultRow & { raw_object_id: number; object_uri: string; content_hash: string }>(
        `SELECT raw_object_id,object_uri,content_hash FROM ingestion.raw_object
         WHERE source_id=$1 AND content_hash=$2`,
        [input.sourceId, input.contentHash],
      );
  const rawObjectId = existing.rows[0]?.raw_object_id;
  if (rawObjectId === undefined) {
    throw new Error('raw object registration did not return or resolve a durable row');
  }
  const authoritativeObjectUri = rawInserted ? input.objectUri : existing.rows[0]?.object_uri;
  if (authoritativeObjectUri === undefined) {
    throw new Error('existing raw object is missing its authoritative object URI');
  }
  if (!rawInserted) {
    const authoritativeContentHash = existing.rows[0]?.content_hash;
    if (authoritativeContentHash === undefined) {
      throw new Error('existing raw object is missing its authoritative content hash');
    }
    await readRawObjectVerified({
      contentHash: authoritativeContentHash,
      objectUri: authoritativeObjectUri,
    });
  }

  const contract = await client.query<QueryResultRow & { source_contract_revision_id: number }>(
    `SELECT source_contract_revision_id
     FROM ingestion.source_contract_revision
     WHERE source_id=$1
       AND policy_status IN ('provisional_review_required','approved')
       AND effective_from<=$2::timestamptz
       AND (effective_to IS NULL OR effective_to>$2::timestamptz)
       AND known_from<=now()
       AND (known_to IS NULL OR known_to>now())
     ORDER BY revision_no DESC,known_from DESC
     LIMIT 1`,
    [input.sourceId,input.fetchedAt],
  );
  if (contract.rows.length !== 1) {
    throw new Error(`source ${input.sourceId} requires exactly one current applicable contract; got ${contract.rows.length}`);
  }
  const sourceContractRevisionId = contract.rows[0]?.source_contract_revision_id;
  if (sourceContractRevisionId === undefined) {
    throw new Error(`source contract revision is missing for source ${input.sourceId}`);
  }

  const revision = await appendSourceRevision(client, {
    sourceId: input.sourceId,
    providerRecordKey: input.providerRecordKey,
    availableAt: input.fetchedAt,
    contentHash: input.contentHash,
    rawObjectId,
    sourceContractRevisionId,
    payloadMetadata: { object_uri: authoritativeObjectUri, http_meta: input.httpMeta },
  });
  return {
    rawObjectId,
    rawInserted,
    objectUri: authoritativeObjectUri,
    revisionNo: revision.revisionNo,
    replay: revision.outcome === 'replayed',
  };
}

export const OPEN_FETCH_RUN_SQL = `
INSERT INTO ingestion.fetch_run (
  source_id, run_id, idempotency_key, started_at, status
) VALUES (
  (SELECT source_id FROM ingestion.source WHERE provider_key = $1),
  $2, $3, $4, 'running'
)
ON CONFLICT (idempotency_key) DO UPDATE SET run_id = EXCLUDED.run_id
RETURNING fetch_run_id, source_id
`;

export const CLOSE_FETCH_RUN_SQL = `
UPDATE ingestion.fetch_run SET
  finished_at = $2,
  status = $3,
  records_read = $4,
  records_written = $5,
  records_skipped = $6,
  error_summary = $7::jsonb,
  watermark_at = $8,
  summary = $9::jsonb
WHERE fetch_run_id = $1
`;
