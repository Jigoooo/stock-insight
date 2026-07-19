import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

import { processInboxEvent } from '../src/events/consumer-inbox.ts';
import { buildEnvelope } from '../src/events/event-envelope.ts';
import { insertOutboxEvent } from '../src/events/outbox-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_OUTBOX_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_OUTBOX_TEST_DB_URL is required';

describe('B1 consumer inbox atomicity', () => {
  it('projection failure rolls the inbox marker back; success is exactly-once per consumer', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const aggregateId = `agg-inbox-${randomUUID()}`;
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS ops.b1_test_projection (event_id TEXT NOT NULL, consumer_id TEXT NOT NULL)`);

      await client.query('BEGIN');
      const inserted = await insertOutboxEvent(client, buildEnvelope({
        eventType: 'report.published',
        schemaVersion: 1,
        aggregateType: 'report',
        aggregateId,
        aggregateVersion: 1,
        partitionKey: aggregateId,
        occurredAt: '2026-07-19T00:00:00.000Z',
        producer: 'inbox-test',
        payload: { fixture: true },
      }));
      await client.query('COMMIT');
      const eventId = inserted.eventId;

      // 1) Projection failure inside the transaction: marker must roll back.
      await client.query('BEGIN');
      await assert.rejects(
        () => processInboxEvent(client, 'consumer-a', eventId, async () => {
          throw new Error('projection boom');
        }),
        /projection boom/,
      );
      await client.query('ROLLBACK');
      const afterFailure = await client.query(
        `SELECT count(*)::int AS n FROM ops.consumer_inbox WHERE consumer_id = 'consumer-a' AND event_id = $1`,
        [eventId],
      );
      assert.equal(afterFailure.rows[0]!.n, 0);

      // 2) Success: marker + projection commit together.
      await client.query('BEGIN');
      const processed = await processInboxEvent(client, 'consumer-a', eventId, async (tx) => {
        await tx.query(
          `INSERT INTO ops.b1_test_projection (event_id, consumer_id) VALUES ($1, 'consumer-a')`,
          [eventId],
        );
      });
      await client.query('COMMIT');
      assert.equal(processed, 'processed');

      // 3) Redelivery of the same event to the same consumer is a duplicate:
      //    the projection must NOT run again.
      await client.query('BEGIN');
      const duplicate = await processInboxEvent(client, 'consumer-a', eventId, async () => {
        throw new Error('projection must not run for a duplicate');
      });
      await client.query('COMMIT');
      assert.equal(duplicate, 'duplicate');

      // 4) A DIFFERENT consumer has an independent receipt and projects once.
      await client.query('BEGIN');
      const otherConsumer = await processInboxEvent(client, 'consumer-b', eventId, async (tx) => {
        await tx.query(
          `INSERT INTO ops.b1_test_projection (event_id, consumer_id) VALUES ($1, 'consumer-b')`,
          [eventId],
        );
      });
      await client.query('COMMIT');
      assert.equal(otherConsumer, 'processed');

      const projections = await client.query(
        'SELECT consumer_id,count(*)::int AS n FROM ops.b1_test_projection WHERE event_id=$1 GROUP BY consumer_id ORDER BY consumer_id',
        [eventId],
      );
      assert.deepEqual(
        projections.rows.map((row) => `${row.consumer_id}:${row.n}`),
        ['consumer-a:1', 'consumer-b:1'],
      );
    } finally {
      client.release();
      await pool.end();
    }
  });
});
