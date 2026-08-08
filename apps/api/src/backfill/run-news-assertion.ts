import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg, { type PoolClient } from 'pg';

import {
  buildAssertions,
  findAssertionViolations,
  type AssertionRow,
  type ChunkProvenance,
  type ClaimReading,
} from './claim-assertion.ts';
import {
  buildChunkLineage,
  type BundleItem,
  type ChunkLineage,
  type ChunkReading,
} from './news-chunk-lineage.ts';

/**
 * Connects the news knowledge stack to the ingestion stack, then writes the
 * assertions that connection makes possible.
 *
 * Two steps in one job because the second cannot be checked without the first:
 * an assertion needs a source revision, and the only way a news chunk gets one is
 * the reconstruction this job performs. Splitting them would leave a job whose
 * dry-run says "nothing to do" for a reason living in another file.
 *
 * The K2 survey called this blocked. It tested content_hash and
 * provider_record_key, found no matches, and concluded no bridge existed — but
 * never tried the article URL, which both stacks carry. Measured 2026-08-08:
 * 6,196 of 6,794 URL-matched documents have chunk text that reproduces exactly
 * from retained bundle bytes, and 332 of 374 claims with evidence stand on one.
 */

const JOB_NAME = 'stock-insight-news-assertion';
const NEWS_PROVIDER = 'rss-news-bundle';

const BUNDLES_SQL = `
SELECT sr.source_revision_id, sr.available_at, sr.ingested_at, ro.object_uri
  FROM ingestion.source_revision sr
  JOIN ingestion.raw_object ro ON ro.raw_object_id = sr.raw_object_id
  JOIN ingestion.source s ON s.source_id = ro.source_id
 WHERE s.provider_key = $1
 ORDER BY sr.source_revision_id
`;

const CHUNKS_SQL = `
SELECT c.chunk_id, c.document_id, d.canonical_url, c.content
  FROM knowledge.document_chunk c
  JOIN knowledge.document d ON d.document_id = c.document_id
 WHERE c.source_revision_id IS NULL
`;

const CLAIMS_SQL = `
SELECT cl.claim_id, ce.chunk_id, cl.subject_entity_id, cl.predicate,
       cl.object_entity_id, cl.object_value, cl.claim_type, cl.polarity,
       cl.verification_status, cl.valid_from, cl.valid_to, cl.published_at,
       cl.extraction_run_id,
       (SELECT p.predicate_ontology_revision_id
          FROM knowledge.predicate_ontology_revision p
         WHERE p.predicate = cl.predicate AND p.policy_status = 'approved'
         ORDER BY p.revision_no DESC LIMIT 1) AS predicate_ontology_revision_id
  FROM knowledge.claim cl
  JOIN knowledge.claim_evidence ce ON ce.claim_id = cl.claim_id
 ORDER BY cl.claim_id, ce.chunk_id
`;

const EXISTING_ASSERTIONS_SQL = `SELECT assertion_key FROM knowledge.assertion`;

/**
 * Only the null column is filled, and the evidence goes beside it.
 *
 * available_at and ingested_at are COALESCEd rather than overwritten: where the
 * chunk already carries them they are a statement somebody else made and this
 * job has no standing to replace it.
 */
const LINK_CHUNK_SQL = `
UPDATE knowledge.document_chunk
   SET source_revision_id = $2,
       available_at = coalesce(available_at, $3::timestamptz),
       ingested_at = coalesce(ingested_at, $4::timestamptz),
       content_metadata = coalesce(content_metadata, '{}'::jsonb) || $5::jsonb
 WHERE chunk_id = $1
   AND source_revision_id IS NULL
`;

const INSERT_ASSERTION_COLUMNS = `
  assertion_key, revision_no, source_revision_id, subject_entity_id, predicate_key,
  predicate_ontology_revision_id, object_entity_id, literal_value, polarity, modality,
  quotation_scope, valid_time_start, valid_time_end, published_at, available_at,
  known_at, source_span_locator, parser_version, extraction_run_id, verification_state,
  metadata`;

const INSERT_CHUNK_ROWS = 200;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for the news assertion backfill');
  return url;
}

function placeholders(rowCount: number, columnCount: number): string {
  const rows: string[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const cells: string[] = [];
    for (let column = 0; column < columnCount; column += 1) {
      cells.push(`$${row * columnCount + column + 1}`);
    }
    rows.push(`(${cells.join(',')})`);
  }
  return rows.join(',');
}

function loadBundleItems(
  rows: readonly {
    source_revision_id: string;
    available_at: Date;
    ingested_at: Date;
    object_uri: string;
  }[],
): { itemsByUrl: Map<string, BundleItem>; unreadable: number } {
  const itemsByUrl = new Map<string, BundleItem>();
  let unreadable = 0;

  for (const row of rows) {
    let payload: { items?: { url?: string; title?: string; summary?: string }[] };
    try {
      payload = JSON.parse(readFileSync(fileURLToPath(row.object_uri), 'utf8')) as typeof payload;
    } catch {
      unreadable += 1;
      continue;
    }
    for (const item of payload.items ?? []) {
      // First capture wins. A later bundle carrying the same url is a re-fetch,
      // and the earliest revision is the one that was actually available first.
      if (!item.url || itemsByUrl.has(item.url)) continue;
      itemsByUrl.set(item.url, {
        sourceRevisionId: Number(row.source_revision_id),
        url: item.url,
        title: item.title ?? null,
        summary: item.summary ?? null,
        availableAt: new Date(row.available_at).toISOString(),
        ingestedAt: new Date(row.ingested_at).toISOString(),
      });
    }
  }

  return { itemsByUrl, unreadable };
}

async function linkChunks(client: PoolClient, lineage: readonly ChunkLineage[]): Promise<number> {
  let linked = 0;
  for (const link of lineage) {
    const result = await client.query(LINK_CHUNK_SQL, [
      link.chunkId,
      link.sourceRevisionId,
      link.availableAt,
      link.ingestedAt,
      JSON.stringify({ sourceRevisionEvidence: link.evidence, linkedBy: JOB_NAME }),
    ]);
    linked += result.rowCount ?? 0;
  }
  return linked;
}

async function writeAssertions(client: PoolClient, rows: readonly AssertionRow[]): Promise<number> {
  let written = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_ROWS) {
    const batch = rows.slice(index, index + INSERT_CHUNK_ROWS);
    const params = batch.flatMap((row) => [
      row.assertionKey,
      1,
      row.sourceRevisionId,
      row.subjectEntityId,
      row.predicateKey,
      row.predicateOntologyRevisionId,
      row.objectEntityId,
      row.literalValue,
      row.polarity,
      row.modality,
      row.quotationScope,
      row.validTimeStart,
      row.validTimeEnd,
      row.publishedAt,
      row.availableAt,
      row.knownAt,
      JSON.stringify(row.sourceSpanLocator),
      row.parserVersion,
      row.extractionRunId,
      row.verificationState,
      JSON.stringify(row.metadata),
    ]);
    const result = await client.query(
      `INSERT INTO knowledge.assertion (${INSERT_ASSERTION_COLUMNS})
       VALUES ${placeholders(batch.length, 21)}
       ON CONFLICT (assertion_key, revision_no) DO NOTHING`,
      params,
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rehearse = process.argv.includes('--rehearse');
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    const [bundles, chunks, claims, existing] = await Promise.all([
      client.query<{
        source_revision_id: string;
        available_at: Date;
        ingested_at: Date;
        object_uri: string;
      }>(BUNDLES_SQL, [NEWS_PROVIDER]),
      client.query<{
        chunk_id: string;
        document_id: string;
        canonical_url: string | null;
        content: string | null;
      }>(CHUNKS_SQL),
      client.query<{
        claim_id: string;
        chunk_id: string;
        subject_entity_id: string;
        predicate: string;
        object_entity_id: string | null;
        object_value: string | null;
        claim_type: string;
        polarity: number;
        verification_status: string;
        valid_from: Date | null;
        valid_to: Date | null;
        published_at: Date | null;
        extraction_run_id: string | null;
        predicate_ontology_revision_id: string | null;
      }>(CLAIMS_SQL),
      client.query<{ assertion_key: string }>(EXISTING_ASSERTIONS_SQL),
    ]);

    const { itemsByUrl, unreadable } = loadBundleItems(bundles.rows);

    const chunkReadings: ChunkReading[] = chunks.rows.map((row) => ({
      chunkId: Number(row.chunk_id),
      documentId: Number(row.document_id),
      canonicalUrl: row.canonical_url,
      content: row.content ?? '',
    }));
    const { lineage, skips: lineageSkips } = buildChunkLineage(chunkReadings, itemsByUrl);

    const provenanceByChunk = new Map<number, ChunkProvenance>(
      lineage.map((link) => [
        link.chunkId,
        {
          chunkId: link.chunkId,
          sourceRevisionId: link.sourceRevisionId,
          availableAt: link.availableAt,
          ingestedAt: link.ingestedAt,
          bundleUrl: link.evidence.bundleUrl,
        },
      ]),
    );

    const claimReadings: ClaimReading[] = claims.rows.map((row) => ({
      claimId: Number(row.claim_id),
      chunkId: Number(row.chunk_id),
      subjectEntityId: Number(row.subject_entity_id),
      predicate: row.predicate,
      objectEntityId: row.object_entity_id === null ? null : Number(row.object_entity_id),
      objectValue: row.object_value,
      claimType: row.claim_type,
      polarity: row.polarity,
      verificationStatus: row.verification_status,
      validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
      validTo: row.valid_to ? new Date(row.valid_to).toISOString() : null,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      extractionRunId: row.extraction_run_id,
      predicateOntologyRevisionId:
        row.predicate_ontology_revision_id === null
          ? null
          : Number(row.predicate_ontology_revision_id),
    }));

    const built = buildAssertions(claimReadings, provenanceByChunk);
    const alreadyWritten = new Set(existing.rows.map((row) => row.assertion_key));
    // One claim can have several evidence chunks; the assertion is keyed by claim,
    // so the first chunk that carries a source revision is the one it stands on.
    const seen = new Set<string>();
    const toWrite = built.rows.filter((row) => {
      if (alreadyWritten.has(row.assertionKey) || seen.has(row.assertionKey)) return false;
      seen.add(row.assertionKey);
      return true;
    });
    const violations = findAssertionViolations(toWrite);

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : rehearse ? 'rehearse' : 'dry-run',
      bundles: bundles.rows.length,
      unreadableBundles: unreadable,
      bundleUrls: itemsByUrl.size,
      chunksWithoutLineage: chunkReadings.length,
      chunksToLink: lineage.length,
      lineageSkips,
      claimEvidenceRows: claimReadings.length,
      assertionsAlreadyWritten: alreadyWritten.size,
      assertionsToWrite: toWrite.length,
      assertionSkips: built.skips,
      schemaViolations: violations,
    };

    if (!apply && !rehearse) {
      console.log(JSON.stringify({ ...summary, hint: 'rerun with --apply' }, null, 2));
      return;
    }
    if (violations.length > 0) {
      throw new Error(`refusing to write: ${JSON.stringify(violations)}`);
    }

    await client.query('BEGIN');
    try {
      const linked = await linkChunks(client, lineage);
      const written = await writeAssertions(client, toWrite);
      await client.query(rehearse ? 'ROLLBACK' : 'COMMIT');
      console.log(
        JSON.stringify(
          {
            ...summary,
            [rehearse ? 'chunksLinkedThenRolledBack' : 'chunksLinked']: linked,
            [rehearse ? 'assertionsRolledBack' : 'assertionsWritten']: written,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
