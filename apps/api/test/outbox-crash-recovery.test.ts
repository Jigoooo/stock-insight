import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import pg, { type PoolClient } from 'pg';

import { buildEnvelope } from '../src/events/event-envelope.ts';
import { ackDelivery, claimDueDeliveries, failDelivery } from '../src/events/outbox-dispatcher.ts';
import { insertOutboxEvent, seedDeliveries } from '../src/events/outbox-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_OUTBOX_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_OUTBOX_TEST_DB_URL is required';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function seedOneDelivery(
  client: PoolClient,
  aggregateId: string,
  destination: string,
  maxAttempts = 8,
): Promise<{ eventId: string; destination: string }> {
  aggregateId = `${aggregateId}-${randomUUID()}`;
  destination = `${destination}-${randomUUID()}`;
  await client.query('BEGIN');
  const inserted = await insertOutboxEvent(client, buildEnvelope({
    eventType: 'report.published',
    schemaVersion: 1,
    aggregateType: 'report',
    aggregateId,
    aggregateVersion: 1,
    partitionKey: aggregateId,
    occurredAt: '2026-07-19T00:00:00.000Z',
    producer: 'crash-recovery-test',
    payload: { fixture: aggregateId },
  }));
  await seedDeliveries(client, inserted.eventId, [destination]);
  if (maxAttempts !== 8) {
    await client.query(
      'UPDATE ops.outbox_delivery SET max_attempts = $2 WHERE event_id = $1',
      [inserted.eventId, maxAttempts],
    );
  }
  await client.query('COMMIT');
  return { eventId: inserted.eventId, destination };
}

describe('B1 outbox crash recovery and lease fencing', () => {
  it('send-before-ACK crash: expired lease is reclaimed with the SAME identity and a fresh token', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      const seeded = await seedOneDelivery(client, 'agg-crash', 'dest-crash');
      // Worker A claims with an immediately-expiring lease, "sends", then dies
      // before ACK (simulated by simply not acking).
      const first = await claimDueDeliveries(client, {
        destination: seeded.destination, limit: 1, leaseSeconds: 0,
      });
      assert.equal(first.length, 1);
      assert.equal(first[0]!.attempts, 1);
      await sleep(50);
      // ACK after lease expiry must fail (fencing: lease_until >= now()).
      assert.equal(await ackDelivery(client, first[0]!.deliveryId, first[0]!.leaseToken), false);
      // FAIL after lease expiry is equally fenced, even before another worker reclaims it.
      assert.equal(
        await failDelivery(client, first[0]!.deliveryId, first[0]!.leaseToken, 'expired worker'),
        'lost_lease',
      );
      // Recovery claims the same delivery/event identity with attempts=2.
      const second = await claimDueDeliveries(client, {
        destination: seeded.destination, limit: 1, leaseSeconds: 60,
      });
      assert.equal(second.length, 1);
      assert.equal(second[0]!.deliveryId, first[0]!.deliveryId);
      assert.equal(second[0]!.eventId, first[0]!.eventId);
      assert.equal(second[0]!.attempts, 2);
      assert.notEqual(second[0]!.leaseToken, first[0]!.leaseToken);
      // ACK/FAIL with the STALE token must fail; ACK with the live token succeeds.
      assert.equal(await ackDelivery(client, second[0]!.deliveryId, first[0]!.leaseToken), false);
      assert.equal(
        await failDelivery(client, second[0]!.deliveryId, first[0]!.leaseToken, 'stale worker'),
        'lost_lease',
      );
      assert.equal(await ackDelivery(client, second[0]!.deliveryId, second[0]!.leaseToken), true);
      const status = await client.query(
        'SELECT status FROM ops.outbox_delivery WHERE delivery_id = $1',
        [second[0]!.deliveryId],
      );
      assert.equal(status.rows[0]!.status, 'delivered');
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('two claimers race: exactly one worker owns a due delivery', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      const seeded = await seedOneDelivery(clientA, 'agg-race', 'dest-race');
      const [claimsA, claimsB] = await Promise.all([
        claimDueDeliveries(clientA, { destination: seeded.destination, limit: 1, leaseSeconds: 60 }),
        claimDueDeliveries(clientB, { destination: seeded.destination, limit: 1, leaseSeconds: 60 }),
      ]);
      assert.equal(claimsA.length + claimsB.length, 1);
      const winner = claimsA[0] ?? claimsB[0];
      assert.ok(winner);
      const row = await clientA.query(
        'SELECT attempts FROM ops.outbox_delivery WHERE delivery_id = $1',
        [winner.deliveryId],
      );
      assert.equal(row.rows[0]!.attempts, 1);
    } finally {
      clientA.release();
      clientB.release();
      await pool.end();
    }
  });

  it('bounded retries: exhausted delivery flips to dead and appends exactly one dead letter', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      const seeded = await seedOneDelivery(client, 'agg-dead', 'dest-dead', 2);
      // Attempt 1 fails -> back to pending.
      const first = await claimDueDeliveries(client, { destination: seeded.destination, limit: 1, leaseSeconds: 60 });
      assert.equal(first.length, 1);
      await client.query('BEGIN');
      const afterFirst = await failDelivery(client, first[0]!.deliveryId, first[0]!.leaseToken, 'boom-1', 0);
      await client.query('COMMIT');
      assert.equal(afterFirst, 'pending');
      // Attempt 2 fails -> attempts(2) >= max_attempts(2) -> dead + dead letter.
      const second = await claimDueDeliveries(client, { destination: seeded.destination, limit: 1, leaseSeconds: 60 });
      assert.equal(second.length, 1);
      await client.query('BEGIN');
      const afterSecond = await failDelivery(client, second[0]!.deliveryId, second[0]!.leaseToken, 'boom-2', 0);
      await client.query('COMMIT');
      assert.equal(afterSecond, 'dead');
      const dead = await client.query(
        'SELECT count(*)::int AS n FROM ops.dead_letter WHERE delivery_id = $1',
        [second[0]!.deliveryId],
      );
      assert.equal(dead.rows[0]!.n, 1);
      // A dead delivery is no longer claimable.
      const third = await claimDueDeliveries(client, { destination: seeded.destination, limit: 1, leaseSeconds: 60 });
      assert.equal(third.length, 0);
      // failDelivery with a lost lease is a no-op signal.
      assert.equal(await failDelivery(client, second[0]!.deliveryId, 'stale-token', 'late', 0), 'lost_lease');
    } finally {
      client.release();
      await pool.end();
    }
  });
});
