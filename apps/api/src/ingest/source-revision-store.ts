import type { PoolClient, QueryResultRow } from 'pg';

function positiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return parsed;
}

// B2 — Immutable source revision store. Every write uses the caller's open
// transaction. Exact latest-hash retries reuse the existing revision; a changed
// payload appends the next revision under a per-identity row lock.

export type SourceRevisionInput = {
  sourceId: number;
  providerRecordKey: string;
  availableAt: string;
  contentHash: string;
  rawObjectId: number;
  sourceContractRevisionId: number;
  payloadMetadata?: Record<string, unknown>;
};

export type SourceRevisionResult = {
  outcome: 'inserted' | 'replayed';
  sourceRecordIdentityId: number;
  sourceRevisionId: number;
  revisionNo: number;
  availableAt: string;
};

const INSERT_IDENTITY_SQL = `
INSERT INTO ingestion.source_record_identity (source_id, provider_record_key, first_observed_at)
VALUES ($1, $2, $3)
ON CONFLICT (source_id, provider_record_key) DO NOTHING
RETURNING source_record_identity_id
`;

const READ_IDENTITY_SQL = `
SELECT source_record_identity_id
FROM ingestion.source_record_identity
WHERE source_id=$1 AND provider_record_key=$2
`;

const LOCK_LATEST_SQL = `
SELECT revision.source_revision_id, revision.revision_no, revision.content_hash, revision.available_at
FROM ingestion.source_revision revision
WHERE revision.source_record_identity_id = $1
ORDER BY revision.revision_no DESC
LIMIT 1
FOR UPDATE
`;

const INSERT_REVISION_SQL = `
INSERT INTO ingestion.source_revision (
  source_record_identity_id, revision_no, available_at, content_hash,
  raw_object_id, source_contract_revision_id,
  supersedes_source_revision_id, payload_metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
RETURNING source_revision_id
`;

export async function appendSourceRevision(
  client: PoolClient,
  input: SourceRevisionInput,
): Promise<SourceRevisionResult> {
  if (!input.providerRecordKey.trim()) throw new Error('providerRecordKey is required');
  if (!/^[a-f0-9]{64}$/i.test(input.contentHash))
    throw new Error('contentHash must be SHA-256 hex');
  if (Number.isNaN(new Date(input.availableAt).getTime()))
    throw new Error('availableAt must be valid');

  const insertedIdentity = await client.query<
    QueryResultRow & { source_record_identity_id: string | number }
  >(INSERT_IDENTITY_SQL, [input.sourceId, input.providerRecordKey, input.availableAt]);
  const existingIdentity =
    insertedIdentity.rows[0] ??
    (
      await client.query<QueryResultRow & { source_record_identity_id: string | number }>(
        READ_IDENTITY_SQL,
        [input.sourceId, input.providerRecordKey],
      )
    ).rows[0];
  if (existingIdentity === undefined)
    throw new Error('source record identity insert/readback failed');
  const identityId = positiveInteger(
    existingIdentity.source_record_identity_id,
    'sourceRecordIdentityId',
  );
  // Serialize first-revision races too (no row exists yet to FOR UPDATE).
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('ingestion.source_record_identity:' || $1::text, 0)
     )`,
    [identityId],
  );
  const latest = await client.query<
    QueryResultRow & {
      source_revision_id: string | number;
      revision_no: string | number;
      content_hash: string;
      available_at: Date | string;
    }
  >(LOCK_LATEST_SQL, [identityId]);
  const previous = latest.rows[0];
  if (previous?.content_hash === input.contentHash) {
    return {
      outcome: 'replayed',
      sourceRecordIdentityId: identityId,
      sourceRevisionId: positiveInteger(previous.source_revision_id, 'sourceRevisionId'),
      revisionNo: positiveInteger(previous.revision_no, 'revisionNo'),
      availableAt:
        previous.available_at instanceof Date
          ? previous.available_at.toISOString()
          : new Date(previous.available_at).toISOString(),
    };
  }
  const previousRevisionNo =
    previous === undefined ? 0 : positiveInteger(previous.revision_no, 'previousRevisionNo');
  const previousSourceRevisionId =
    previous === undefined
      ? null
      : positiveInteger(previous.source_revision_id, 'previousSourceRevisionId');
  const revisionNo = previousRevisionNo + 1;
  const inserted = await client.query<QueryResultRow & { source_revision_id: string | number }>(
    INSERT_REVISION_SQL,
    [
      identityId,
      revisionNo,
      input.availableAt,
      input.contentHash,
      input.rawObjectId,
      input.sourceContractRevisionId,
      previousSourceRevisionId,
      JSON.stringify(input.payloadMetadata ?? {}),
    ],
  );
  return {
    outcome: 'inserted',
    sourceRecordIdentityId: identityId,
    sourceRevisionId: positiveInteger(inserted.rows[0]!.source_revision_id, 'sourceRevisionId'),
    revisionNo,
    availableAt: new Date(input.availableAt).toISOString(),
  };
}

export const SOURCE_REVISION_PIT_SQL = `
SELECT DISTINCT ON (identity.source_record_identity_id)
       identity.source_record_identity_id,
       identity.source_id,
       identity.provider_record_key,
       revision.source_revision_id,
       revision.revision_no,
       revision.available_at,
       revision.content_hash,
       revision.raw_object_id,
       revision.source_contract_revision_id,
       revision.payload_metadata
FROM ingestion.source_record_identity identity
JOIN ingestion.source_revision revision
  ON revision.source_record_identity_id = identity.source_record_identity_id
WHERE identity.source_id = $1
  AND revision.available_at <= $2::timestamptz
ORDER BY identity.source_record_identity_id, revision.available_at DESC, revision.revision_no DESC
`;
