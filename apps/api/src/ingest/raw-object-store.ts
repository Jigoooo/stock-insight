import { createHash } from 'node:crypto';
import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  // Content-addressed: identical hash ⇒ identical bytes; overwrite is a no-op-safe idempotent write.
  await writeFile(filePath, body, { flag: 'w' });

  const manifestDir = join(root, '_manifest');
  await mkdir(manifestDir, { recursive: true });
  const day = `${year}-${month}-${String(fetchedAt.getUTCDate()).padStart(2, '0')}`;
  await appendFile(
    join(manifestDir, `${day}.jsonl`),
    `${JSON.stringify({
      provider_key: options.providerKey,
      content_hash: contentHash,
      object_uri: objectUri,
      bytes: body.byteLength,
      fetched_at: fetchedAt.toISOString(),
    })}\n`,
    'utf8',
  );

  return { contentHash, objectUri, bytes: body.byteLength };
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
