import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

import { appendSourceRevision, SOURCE_REVISION_PIT_SQL } from '../src/ingest/source-revision-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL is required';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('B2 source revision point-in-time semantics', () => {
  it('exact retry reuses latest; correction appends and PIT reads preserve the old state', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const key = `b2-test-${Date.now()}`;
    try {
      const contract = await client.query(`SELECT source_contract_revision_id, source_id FROM ingestion.source_contract_revision WHERE effective_to IS NULL AND known_to IS NULL ORDER BY source_id LIMIT 1`);
      const contractId = contract.rows[0]!.source_contract_revision_id;
      const sourceId = contract.rows[0]!.source_id;
      const fetch = await client.query(`INSERT INTO ingestion.fetch_run (source_id,run_id,idempotency_key,started_at,status) VALUES ($1,$2,$2,now(),'running') RETURNING fetch_run_id`, [sourceId, key]);
      const fetchRunId = fetch.rows[0]!.fetch_run_id;
      const hashA = sha(`${key}:A`);
      const hashB = sha(`${key}:B`);
      const rawA = await client.query(`INSERT INTO ingestion.raw_object (fetch_run_id,source_id,source_document_id,content_hash,object_uri,http_meta,fetched_at) VALUES ($1,$2,$3,$4,$5,'{}', '2026-01-01T00:00:00Z') RETURNING raw_object_id`, [fetchRunId, sourceId, key, hashA, `file:///tmp/${key}-a`]);
      const rawB = await client.query(`INSERT INTO ingestion.raw_object (fetch_run_id,source_id,source_document_id,content_hash,object_uri,http_meta,fetched_at) VALUES ($1,$2,$3,$4,$5,'{}', '2026-02-01T00:00:00Z') RETURNING raw_object_id`, [fetchRunId, sourceId, key, hashB, `file:///tmp/${key}-b`]);

      await client.query('BEGIN');
      const first = await appendSourceRevision(client, { sourceId, providerRecordKey: key, availableAt: '2026-01-01T00:00:00Z', contentHash: hashA, rawObjectId: rawA.rows[0]!.raw_object_id, sourceContractRevisionId: contractId });
      const replay = await appendSourceRevision(client, { sourceId, providerRecordKey: key, availableAt: '2026-01-01T00:00:00Z', contentHash: hashA, rawObjectId: rawA.rows[0]!.raw_object_id, sourceContractRevisionId: contractId });
      const correction = await appendSourceRevision(client, { sourceId, providerRecordKey: key, availableAt: '2026-02-01T00:00:00Z', contentHash: hashB, rawObjectId: rawB.rows[0]!.raw_object_id, sourceContractRevisionId: contractId });
      const reappearance = await appendSourceRevision(client, { sourceId, providerRecordKey: key, availableAt: '2026-03-01T00:00:00Z', contentHash: hashA, rawObjectId: rawA.rows[0]!.raw_object_id, sourceContractRevisionId: contractId });
      await client.query('COMMIT');
      assert.equal(first.outcome, 'inserted');
      assert.equal(replay.outcome, 'replayed');
      assert.equal(replay.sourceRevisionId, first.sourceRevisionId);
      assert.equal(correction.revisionNo, 2);
      assert.equal(reappearance.revisionNo, 3);

      const jan = await client.query(SOURCE_REVISION_PIT_SQL, [sourceId, '2026-01-15T00:00:00Z']);
      const feb = await client.query(SOURCE_REVISION_PIT_SQL, [sourceId, '2026-02-15T00:00:00Z']);
      const mar = await client.query(SOURCE_REVISION_PIT_SQL, [sourceId, '2026-03-15T00:00:00Z']);
      const janRow = jan.rows.find((row) => row.provider_record_key === key);
      const febRow = feb.rows.find((row) => row.provider_record_key === key);
      const marRow = mar.rows.find((row) => row.provider_record_key === key);
      assert.equal(janRow!.content_hash, hashA);
      assert.equal(janRow!.revision_no, 1);
      assert.equal(febRow!.content_hash, hashB);
      assert.equal(febRow!.revision_no, 2);
      assert.equal(marRow!.content_hash, hashA);
      assert.equal(marRow!.revision_no, 3);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
