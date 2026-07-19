import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

import { sourceRevisionContractsMigrationSql } from '../../../packages/db-schema/src/migrations/020_source_revision_contracts.ts';

const databaseUrl = process.env.STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL is required';

describe('B2 source contract coverage and immutability', () => {
  it('covers every active source exactly once with an honest active baseline contract', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM ingestion.source) AS active_sources,
          (SELECT count(*)::int FROM ingestion.source_contract_current_v1) AS active_contracts,
          (SELECT count(*)::int FROM ingestion.source source
           WHERE NOT EXISTS (
             SELECT 1 FROM ingestion.source_contract_current_v1 contract
             WHERE contract.source_id=source.source_id
           )) AS uncovered,
          (SELECT count(*)::int FROM ingestion.source_contract_revision
           WHERE policy_status='provisional_review_required') AS provisional
      `);
      assert.equal(result.rows[0]!.uncovered, 0);
      assert.equal(result.rows[0]!.active_contracts, result.rows[0]!.active_sources);
      // Initial backfill must not fabricate operator approval.
      assert.equal(result.rows[0]!.provisional, result.rows[0]!.active_sources);
    } finally {
      await pool.end();
    }
  });

  it('derives current contract from the latest append-only revision', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const appended = await client.query(`
        INSERT INTO ingestion.source_contract_revision (
          source_id,revision_no,policy_status,cadence_policy,cutoff_policy,delay_policy,
          correction_policy,required_fields,license_policy,redistribution_policy,
          raw_retention_policy,quality_gate_policy,effective_from,known_from,
          supersedes_contract_revision_id,content_hash
        )
        SELECT source_id,revision_no+1,'approved',cadence_policy,cutoff_policy,delay_policy,
               correction_policy,required_fields,license_policy,redistribution_policy,
               raw_retention_policy,quality_gate_policy,now(),now(),
               source_contract_revision_id,$1
        FROM ingestion.source_contract_current_v1 ORDER BY source_id LIMIT 1
        RETURNING source_contract_revision_id,source_id,revision_no
      `, [createHash('sha256').update(randomUUID()).digest('hex')]);
      const current = await client.query(`
        SELECT source_contract_revision_id,revision_no
        FROM ingestion.source_contract_current_v1 WHERE source_id=$1
      `, [appended.rows[0]!.source_id]);
      assert.equal(current.rows[0]!.source_contract_revision_id, appended.rows[0]!.source_contract_revision_id);
      assert.equal(current.rows[0]!.revision_no, appended.rows[0]!.revision_no);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  it('appends a late raw object after max revision instead of renumbering history', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query(`
        SELECT identity.source_record_identity_id,identity.source_id,identity.provider_record_key,
               max(revision.revision_no)::int AS max_revision
        FROM ingestion.source_record_identity identity
        JOIN ingestion.source_revision revision USING(source_record_identity_id)
        GROUP BY identity.source_record_identity_id,identity.source_id,identity.provider_record_key
        ORDER BY identity.source_record_identity_id LIMIT 1
      `);
      const row = selected.rows[0]!;
      const suffix = randomUUID();
      const contentHash = createHash('sha256').update(suffix).digest('hex');
      const raw = await client.query(`
        WITH inserted_fetch AS (
          INSERT INTO ingestion.fetch_run (source_id,run_id,idempotency_key,started_at,status)
          VALUES ($1,$2,$2,now(),'running') RETURNING fetch_run_id
        )
        INSERT INTO ingestion.raw_object (
          fetch_run_id,source_id,source_document_id,content_hash,object_uri,http_meta,fetched_at
        ) SELECT fetch_run_id,$1,$3,$4,$5,'{}','2000-01-01T00:00:00Z' FROM inserted_fetch
        RETURNING raw_object_id
      `, [row.source_id, `late-${suffix}`, row.provider_record_key, contentHash, `file:///tmp/${contentHash}`]);
      await client.query(sourceRevisionContractsMigrationSql);
      const revision = await client.query(`
        SELECT revision.revision_no,revision.available_at,
               (SELECT count(*)::int FROM ops.outbox_event event
                WHERE event.aggregate_type='source_record'
                  AND event.aggregate_id=revision.source_record_identity_id::text
                  AND event.aggregate_version=revision.revision_no
                  AND event.event_type='source.revision.appended') AS outbox_rows
        FROM ingestion.source_revision revision WHERE revision.raw_object_id=$1
      `,[raw.rows[0]!.raw_object_id]);
      assert.equal(revision.rows[0]!.revision_no, row.max_revision + 1);
      assert.equal(new Date(revision.rows[0]!.available_at).toISOString(), '2000-01-01T00:00:00.000Z');
      assert.equal(revision.rows[0]!.outbox_rows,1);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  it('rejects UPDATE and DELETE on both immutable revision ledgers', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assert.rejects(
        () => client.query(`UPDATE ingestion.source_contract_revision SET policy_status='approved' WHERE source_contract_revision_id=(SELECT min(source_contract_revision_id) FROM ingestion.source_contract_revision)`),
        /append-only/,
      );
      await client.query('ROLLBACK');

      // Seed one ledger row when the schema-only rehearsal has no raw backfill.
      const seed = await client.query(`
        WITH selected AS (
          SELECT contract.source_contract_revision_id, contract.source_id
          FROM ingestion.source_contract_revision contract ORDER BY contract.source_id LIMIT 1
        ), fetch_row AS (
          INSERT INTO ingestion.fetch_run (source_id,run_id,idempotency_key,started_at,status)
          SELECT source_id, 'immutability-fixture', 'immutability-fixture', now(), 'running' FROM selected
          ON CONFLICT (idempotency_key) DO UPDATE SET run_id=EXCLUDED.run_id
          RETURNING fetch_run_id, source_id
        ), raw AS (
          INSERT INTO ingestion.raw_object (fetch_run_id,source_id,source_document_id,content_hash,object_uri,http_meta,fetched_at)
          SELECT fetch_run_id,source_id,'immutability-fixture',repeat('a',64),'file:///tmp/immutability-fixture','{}',now() FROM fetch_row
          ON CONFLICT (source_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash
          RETURNING raw_object_id,source_id
        ), identity AS (
          INSERT INTO ingestion.source_record_identity (source_id,provider_record_key,first_observed_at)
          SELECT source_id,'immutability-fixture',now() FROM raw
          ON CONFLICT (source_id,provider_record_key) DO NOTHING
          RETURNING source_record_identity_id,source_id
        )
        INSERT INTO ingestion.source_revision (source_record_identity_id,revision_no,available_at,content_hash,raw_object_id,source_contract_revision_id)
        SELECT identity.source_record_identity_id,1,now(),repeat('a',64),raw.raw_object_id,selected.source_contract_revision_id
        FROM identity JOIN raw USING(source_id) JOIN selected USING(source_id)
        ON CONFLICT (source_record_identity_id,revision_no) DO NOTHING
        RETURNING source_revision_id
      `);
      const revisionId = seed.rows[0]?.source_revision_id ?? (
        await client.query(`SELECT min(source_revision_id) AS id FROM ingestion.source_revision`)
      ).rows[0]!.id;
      assert.ok(revisionId);
      await client.query('BEGIN');
      await assert.rejects(
        () => client.query('DELETE FROM ingestion.source_revision WHERE source_revision_id=$1', [revisionId]),
        /append-only/,
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });
});
