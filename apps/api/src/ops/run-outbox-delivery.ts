import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import { Client, type QueryResultRow } from 'pg';

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

type DeliveryRow = QueryResultRow & {
  delivery_id: string;
  event_id: string;
  attempts: number;
  max_attempts: number;
};

async function seedMissingDeliveries(client: Client): Promise<number> {
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

async function leaseBatch(client: Client, leaseToken: string): Promise<DeliveryRow[]> {
  const result = await client.query<DeliveryRow>(
    `UPDATE ops.outbox_delivery delivery
     SET status = 'leased',
         lease_token = $1,
         lease_until = now() + make_interval(secs => $2),
         attempts = delivery.attempts + 1
     WHERE delivery.delivery_id IN (
       SELECT candidate.delivery_id
       FROM ops.outbox_delivery candidate
       WHERE candidate.destination = $3
         AND candidate.not_before <= now()
         AND (
           candidate.status = 'pending'
           OR (candidate.status = 'leased' AND candidate.lease_until < now())
         )
       ORDER BY candidate.created_at
       LIMIT $4
       FOR UPDATE SKIP LOCKED
     )
     RETURNING delivery.delivery_id, delivery.event_id, delivery.attempts, delivery.max_attempts`,
    [leaseToken, LEASE_SECONDS, DESTINATION, BATCH_SIZE],
  );
  return result.rows;
}

async function deliverOne(
  client: Client,
  delivery: DeliveryRow,
  leaseToken: string,
): Promise<'delivered' | 'dead' | 'retry'> {
  try {
    await client.query('BEGIN');
    // Idempotent consumption: the inbox PK makes replay a no-op.
    await client.query(
      `INSERT INTO ops.consumer_inbox (consumer_id, event_id)
       VALUES ($1, $2)
       ON CONFLICT (consumer_id, event_id) DO NOTHING`,
      [CONSUMER_ID, delivery.event_id],
    );
    const marked = await client.query(
      `UPDATE ops.outbox_delivery
       SET status = 'delivered', delivered_at = now(), lease_token = NULL, lease_until = NULL
       WHERE delivery_id = $1 AND lease_token = $2 AND status = 'leased'`,
      [delivery.delivery_id, leaseToken],
    );
    if (marked.rowCount !== 1) {
      // Lease was fenced out (another worker took over) — do not double-count.
      await client.query('ROLLBACK');
      return 'retry';
    }
    await client.query('COMMIT');
    return 'delivered';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    if (delivery.attempts >= delivery.max_attempts) {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO ops.dead_letter (delivery_id, event_id, destination, attempts, last_error)
         VALUES ($1, $2, $3, $4, $5)`,
        [delivery.delivery_id, delivery.event_id, DESTINATION, delivery.attempts, message],
      );
      await client.query(
        `UPDATE ops.outbox_delivery
         SET status = 'dead', last_error = $2, lease_token = NULL, lease_until = NULL
         WHERE delivery_id = $1`,
        [delivery.delivery_id, message],
      );
      await client.query('COMMIT');
      return 'dead';
    }
    const backoffSeconds = BACKOFF_BASE_SECONDS * 2 ** Math.min(delivery.attempts, 6);
    await client.query(
      `UPDATE ops.outbox_delivery
       SET status = 'pending', last_error = $2, lease_token = NULL, lease_until = NULL,
           not_before = now() + make_interval(secs => $3)
       WHERE delivery_id = $1`,
      [delivery.delivery_id, message, backoffSeconds],
    );
    return 'retry';
  }
}

async function main(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
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
      const leaseToken = `${hostname()}:${process.pid}:${randomUUID()}`;
      const batch = await leaseBatch(client, leaseToken);
      if (batch.length === 0) break;
      totals.batches += 1;
      for (const delivery of batch) {
        if (terminated) break;
        const outcome = await deliverOne(client, delivery, leaseToken);
        if (outcome === 'delivered') totals.delivered += 1;
        else if (outcome === 'dead') totals.dead += 1;
        else totals.retried += 1;
      }
      if (!LOOP) break;
    }
    console.log(
      JSON.stringify({
        mode: 'apply',
        destination: DESTINATION,
        consumerId: CONSUMER_ID,
        terminatedBySignal: terminated,
        ...totals,
      }),
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
