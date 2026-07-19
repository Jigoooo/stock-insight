import assert from 'node:assert/strict';
import { rm,writeFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import pg from 'pg';

import { payloadHashOf } from '../src/events/event-envelope.ts';
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
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('b2-source-revision-test',0))");
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
          (SELECT count(*)::int FROM ingestion.source_revision WHERE raw_object_id=$1) AS revision_rows,
          (SELECT count(*)::int FROM ops.outbox_event
           WHERE event_type='source.revision.appended' AND payload->>'raw_object_id'=$1::text) AS outbox_rows
      `, [result.rawObjectId]);
      assert.deepEqual(inside.rows[0], { raw_rows: 1, revision_rows: 1, outbox_rows: 1 });
      await client.query('ROLLBACK');

      const outside = await client.query(`
        SELECT
          (SELECT count(*)::int FROM ingestion.raw_object WHERE source_id=$1 AND content_hash=$2) AS raw_rows,
          (SELECT count(*)::int FROM ingestion.source_record_identity WHERE source_id=$1 AND provider_record_key=$3) AS identities,
          (SELECT count(*)::int FROM ops.outbox_event
           WHERE event_type='source.revision.appended' AND payload->>'content_hash'=$2) AS outbox_rows
      `, [sourceId, hash, key]);
      assert.deepEqual(outside.rows[0], { raw_rows: 0, identities: 0, outbox_rows: 0 });
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
    const rawPath = `/tmp/${hash}.json`;
    try {
      await writeFile(rawPath,key,{ flag: 'wx' });
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('b2-source-revision-test',0))");
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
      const events = await client.query(`
        SELECT event_id,payload,payload_hash,producer,occurred_at FROM ops.outbox_event
        WHERE event_type='source.revision.appended' AND payload->>'raw_object_id'=$1::text
      `,[first.rawObjectId]);
      assert.equal(events.rows.length,1);
      assert.equal(events.rows[0]!.payload_hash,payloadHashOf(events.rows[0]!.payload));
      assert.equal(events.rows[0]!.producer,'raw-object-store');
      assert.equal(new Date(events.rows[0]!.occurred_at).toISOString(),input.fetchedAt);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
      await rm(rawPath,{ force: true });
    }
  });

  it('rolls the domain mutation back when an aggregate slot contains the wrong source payload', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const key = `b2-conflict-${Date.now()}-${Math.random()}`;
    const hash = hashContent(key);
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('b2-source-revision-test',0))");
      const opened = await client.query(OPEN_FETCH_RUN_SQL,[
        'rss-news-bundle',key,key,new Date().toISOString(),
      ]);
      const identity = await client.query(`
        INSERT INTO ingestion.source_record_identity (source_id,provider_record_key,first_observed_at)
        VALUES ($1,$2,now()) RETURNING source_record_identity_id
      `,[opened.rows[0]!.source_id,key]);
      await client.query(`
        INSERT INTO ops.outbox_event (
          event_id,event_type,schema_version,aggregate_type,aggregate_id,aggregate_version,
          partition_key,occurred_at,producer,payload,payload_hash
        ) VALUES ($1,'source.revision.appended',1,'source_record',$2,1,$3,now(),'conflict-fixture','{"wrong":true}',$4)
      `,[`evt-conflict-${Date.now()}`,String(identity.rows[0]!.source_record_identity_id),String(opened.rows[0]!.source_id),'0'.repeat(64)]);
      await assert.rejects(
        () => registerRawObjectWithRevision(client,{
          fetchRunId: opened.rows[0]!.fetch_run_id,
          sourceId: opened.rows[0]!.source_id,
          providerRecordKey: key,
          contentHash: hash,
          objectUri: `file:///tmp/${hash}.json`,
          httpMeta: { fixture: true },
          fetchedAt: new Date().toISOString(),
        }),
        /conflicting outbox event occupies source revision aggregate version/,
      );
      await client.query('ROLLBACK');
      const outside = await client.query(`
        SELECT (SELECT count(*)::int FROM ingestion.source_record_identity WHERE provider_record_key=$1) AS identities,
               (SELECT count(*)::int FROM ingestion.raw_object WHERE content_hash=$2) AS raw_rows,
               (SELECT count(*)::int FROM ops.outbox_event WHERE aggregate_id=$3) AS outbox_rows
      `,[key,hash,String(identity.rows[0]!.source_record_identity_id)]);
      assert.deepEqual(outside.rows[0],{ identities: 0,raw_rows: 0,outbox_rows: 0 });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
