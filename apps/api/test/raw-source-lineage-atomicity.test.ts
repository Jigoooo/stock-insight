import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

import {
  hashContent,
  OPEN_FETCH_RUN_SQL,
  registerRawObjectWithRevision,
} from '../src/ingest/raw-object-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL is required';

describe('B2 raw object + source revision atomicity', () => {
  it('rolls back fetch run, raw row and source revision together', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const key = `b2-atomic-${Date.now()}`;
    const hash = hashContent(key);
    try {
      await client.query('BEGIN');
      const opened = await client.query(OPEN_FETCH_RUN_SQL, [
        'rss-news-bundle', key, key, new Date().toISOString(),
      ]);
      const sourceId = opened.rows[0]!.source_id;
      const result = await registerRawObjectWithRevision(client, {
        fetchRunId: opened.rows[0]!.fetch_run_id,
        sourceId,
        providerRecordKey: key,
        contentHash: hash,
        objectUri: `file:///tmp/${hash}.json`,
        httpMeta: { fixture: true },
        fetchedAt: new Date().toISOString(),
      });
      assert.equal(result.rawInserted, true);
      const inside = await client.query(`
        SELECT
          (SELECT count(*)::int FROM ingestion.raw_object WHERE raw_object_id=$1) AS raw_rows,
          (SELECT count(*)::int FROM ingestion.source_revision WHERE raw_object_id=$1) AS revision_rows
      `, [result.rawObjectId]);
      assert.deepEqual(inside.rows[0], { raw_rows: 1, revision_rows: 1 });
      await client.query('ROLLBACK');

      const outside = await client.query(`
        SELECT
          (SELECT count(*)::int FROM ingestion.raw_object WHERE source_id=$1 AND content_hash=$2) AS raw_rows,
          (SELECT count(*)::int FROM ingestion.source_record_identity WHERE source_id=$1 AND provider_record_key=$3) AS identities
      `, [sourceId, hash, key]);
      assert.deepEqual(outside.rows[0], { raw_rows: 0, identities: 0 });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  it('reuses exact raw bytes and returns a source-revision replay for the same provider key', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const key = `b2-replay-${Date.now()}`;
    const hash = hashContent(key);
    try {
      await client.query('BEGIN');
      const opened = await client.query(OPEN_FETCH_RUN_SQL, [
        'rss-news-bundle', key, key, new Date().toISOString(),
      ]);
      const input = {
        fetchRunId: opened.rows[0]!.fetch_run_id,
        sourceId: opened.rows[0]!.source_id,
        providerRecordKey: key,
        contentHash: hash,
        objectUri: `file:///tmp/${hash}.json`,
        httpMeta: { fixture: true },
        fetchedAt: new Date().toISOString(),
      };
      const first = await registerRawObjectWithRevision(client, input);
      const replay = await registerRawObjectWithRevision(client, input);
      assert.equal(first.rawInserted, true);
      assert.equal(first.replay, false);
      assert.equal(replay.rawInserted, false);
      assert.equal(replay.replay, true);
      assert.equal(replay.rawObjectId, first.rawObjectId);
      assert.equal(replay.revisionNo, first.revisionNo);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
