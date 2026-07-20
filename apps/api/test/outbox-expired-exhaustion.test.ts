import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import pg, { type PoolClient } from 'pg';

import { buildEnvelope } from '../src/events/event-envelope.ts';
import { claimDueDeliveries, expireExhaustedDeliveries } from '../src/events/outbox-dispatcher.ts';
import { insertOutboxEvent, seedDeliveries } from '../src/events/outbox-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_OUTBOX_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_OUTBOX_TEST_DB_URL is required';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function seedFinalAttempt(client: PoolClient): Promise<string> {
  const aggregateId = `expired-final-${randomUUID()}`;
  const destination = `expired-final-${randomUUID()}`;
  await client.query('BEGIN');
  const inserted = await insertOutboxEvent(
    client,
    buildEnvelope({
      eventType: 'report.published',
      schemaVersion: 1,
      aggregateType: 'report',
      aggregateId,
      aggregateVersion: 1,
      partitionKey: aggregateId,
      occurredAt: '2026-07-20T00:00:00.000Z',
      producer: 'expired-final-test',
      payload: { fixture: aggregateId },
    }),
  );
  await seedDeliveries(client, inserted.eventId, [destination]);
  await client.query('UPDATE ops.outbox_delivery SET max_attempts = 1 WHERE event_id = $1', [
    inserted.eventId,
  ]);
  await client.query('COMMIT');
  return destination;
}

describe('outbox exhausted lease recovery', () => {
  it(
    'atomically dead-letters an expired lease after the final claimed attempt',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      try {
        const destination = await seedFinalAttempt(client);
        const claimed = await claimDueDeliveries(client, {
          destination,
          limit: 1,
          leaseSeconds: 0,
        });
        assert.equal(claimed.length, 1);
        await sleep(50);

        await client.query('BEGIN');
        const deadCount = await expireExhaustedDeliveries(client, destination);
        await client.query('COMMIT');
        assert.equal(deadCount, 1);

        const state = await client.query(
          `SELECT delivery.status, delivery.attempts,
                  count(letter.dead_letter_id)::int AS dead_letters
           FROM ops.outbox_delivery delivery
           LEFT JOIN ops.dead_letter letter ON letter.delivery_id = delivery.delivery_id
           WHERE delivery.delivery_id = $1
           GROUP BY delivery.status, delivery.attempts`,
          [claimed[0]!.deliveryId],
        );
        assert.deepEqual(state.rows[0], { status: 'dead', attempts: 1, dead_letters: 1 });
        assert.equal(
          (await claimDueDeliveries(client, { destination, limit: 1, leaseSeconds: 60 })).length,
          0,
        );
      } finally {
        client.release();
        await pool.end();
      }
    },
  );
});
