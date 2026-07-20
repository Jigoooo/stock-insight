import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import {
  ackDelivery,
  claimDueDeliveries,
  expireExhaustedDeliveries,
  failDelivery,
  type ClaimedDelivery,
} from '../events/outbox-dispatcher.ts';

// P0-6 — outbox delivery worker (roadmap §4 P0-6; e2e-layers X2; §6.2 limits).
// Guarantees: at-least-once delivery to a SMALL set of internal consumers,
// idempotent consumption via ops.consumer_inbox, bounded retries with backoff,
// dead-lettering after max_attempts. This is NOT a Kafka replacement — long
// retention replay / many independent consumers / high throughput would need a
// log broker (documented trigger, §6.2).
//
// Destinations (v1, all internal):
//   consumer_inbox:selective-recompute  — marks affected aggregates for the
//                                         next pipeline tick (X1 reads inbox)
//
// Usage:
//   node src/ops/run-outbox-delivery.ts             # dry-run (counts only)
//   node src/ops/run-outbox-delivery.ts --apply     # deliver one batch
//   node src/ops/run-outbox-delivery.ts --apply --loop  # poll until drained

const APPLY = process.argv.includes('--apply');
const LOOP = process.argv.includes('--loop');
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const BATCH_SIZE = 200;
const LEASE_SECONDS = 120;
const DESTINATION = 'consumer_inbox:selective-recompute';
const CONSUMER_ID = 'selective-recompute-v1';
const BACKOFF_BASE_SECONDS = 30;

async function seedMissingDeliveries(client: PoolClient): Promise<number> {
  // Every outbox event gets exactly one delivery row per destination.
  const result = await client.query(
    `INSERT INTO ops.outbox_delivery (delivery_id, event_id, destination)
     SELECT 'dlv-' || event.event_id || ':' || $1, event.event_id, $1
     FROM ops.outbox_event event
     WHERE NOT EXISTS (
       SELECT 1 FROM ops.outbox_delivery delivery
       WHERE delivery.event_id = event.event_id AND delivery.destination = $1
     )
     ON CONFLICT (event_id, destination) DO NOTHING`,
    [DESTINATION],
  );
  return result.rowCount ?? 0;
}

async function deliverOne(
  client: PoolClient,
  delivery: ClaimedDelivery,
): Promise<'delivered' | 'dead' | 'retry'> {
  try {
    await client.query('BEGIN');
    // Idempotent consumption: the inbox PK makes replay a no-op.
    await client.query(
      `INSERT INTO ops.consumer_inbox (consumer_id, event_id)
       VALUES ($1, $2)
       ON CONFLICT (consumer_id, event_id) DO NOTHING`,
      [CONSUMER_ID, delivery.eventId],
    );
    if (!(await ackDelivery(client, delivery.deliveryId, delivery.leaseToken))) {
      await client.query('ROLLBACK');
      return 'retry';
    }
    await client.query('COMMIT');
    return 'delivered';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    const backoffSeconds = BACKOFF_BASE_SECONDS * 2 ** Math.min(delivery.attempts, 6);
    try {
      await client.query('BEGIN');
      const outcome = await failDelivery(
        client,
        delivery.deliveryId,
        delivery.leaseToken,
        message,
        backoffSeconds,
      );
      await client.query('COMMIT');
      return outcome === 'dead' ? 'dead' : 'retry';
    } catch (settlementError) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw settlementError;
    }
  }
}

async function main(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  let terminated = false;
  const stop = (): void => {
    terminated = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    if (!APPLY) {
      const pending = await client.query<QueryResultRow & { count: string | number }>(
        `SELECT count(*) AS count FROM ops.outbox_event event
         WHERE NOT EXISTS (
           SELECT 1 FROM ops.outbox_delivery delivery
           WHERE delivery.event_id = event.event_id
             AND delivery.destination = $1
             AND delivery.status = 'delivered'
         )`,
        [DESTINATION],
      );
      console.log(
        JSON.stringify({
          mode: 'dry-run',
          destination: DESTINATION,
          undelivered: Number(pending.rows[0]!.count),
        }),
      );
      return;
    }

    const totals = { seeded: 0, delivered: 0, retried: 0, dead: 0, batches: 0 };
    for (;;) {
      if (terminated) break;
      totals.seeded += await seedMissingDeliveries(client);
      await client.query('BEGIN');
      try {
        totals.dead += await expireExhaustedDeliveries(client, DESTINATION);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
      const batch = await claimDueDeliveries(client, {
        destination: DESTINATION,
        limit: BATCH_SIZE,
        leaseSeconds: LEASE_SECONDS,
      });
      if (batch.length === 0) break;
      totals.batches += 1;
      let index = 0;
      for (; index < batch.length; index += 1) {
        if (terminated) break;
        const outcome = await deliverOne(client, batch[index]!);
        if (outcome === 'delivered') totals.delivered += 1;
        else if (outcome === 'dead') totals.dead += 1;
        else totals.retried += 1;
      }
      for (; index < batch.length; index += 1) {
        const delivery = batch[index]!;
        await client.query('BEGIN');
        try {
          const outcome = await failDelivery(
            client,
            delivery.deliveryId,
            delivery.leaseToken,
            'worker terminated before delivery',
            0,
          );
          await client.query('COMMIT');
          if (outcome === 'dead') totals.dead += 1;
          else totals.retried += 1;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }
      if (!LOOP) break;
    }
    const unresolved = await client.query<QueryResultRow & { count: string | number }>(
      `SELECT count(*) AS count
       FROM ops.outbox_delivery
       WHERE destination = $1 AND status = 'dead'`,
      [DESTINATION],
    );
    const unresolvedDead = Number(unresolved.rows[0]!.count);
    console.log(
      JSON.stringify({
        mode: 'apply',
        destination: DESTINATION,
        consumerId: CONSUMER_ID,
        terminatedBySignal: terminated,
        unresolvedDead,
        ...totals,
      }),
    );
    if (unresolvedDead > 0) {
      throw new Error(`outbox delivery has ${unresolvedDead} unresolved dead deliveries`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
