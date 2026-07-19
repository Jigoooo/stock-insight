import { randomUUID } from 'node:crypto';

import type { PoolClient, QueryResultRow } from 'pg';

// B1 — Outbox dispatcher primitives (master plan §5.1).
// Lease claim with SKIP LOCKED + fencing token; ACK/fail require the exact
// (delivery_id, lease_token) pair so an expired worker cannot settle a row
// that was reclaimed by someone else. Retries are bounded; exhausted rows go
// to ops.dead_letter in the same transaction as the terminal status flip.
// NOTE: the live dispatcher loop stays OFF until B2~B8 producer coverage is
// GREEN (master plan §5.1) — these primitives are exercised by tests only.

export type ClaimedDelivery = {
  deliveryId: string;
  eventId: string;
  destination: string;
  attempts: number;
  leaseToken: string;
  leaseUntil: string;
  payload: Record<string, unknown>;
  eventType: string;
  schemaVersion: number;
  partitionKey: string;
};

/** Broker-neutral publisher port (Kafka adapter lands behind this later). */
export type EventPublisher = {
  publish: (delivery: ClaimedDelivery) => Promise<void>;
};

const CLAIM_SQL = `
WITH due AS (
  SELECT delivery.delivery_id
  FROM ops.outbox_delivery delivery
  WHERE delivery.destination = $1
    AND delivery.status IN ('pending', 'leased')
    AND delivery.not_before <= now()
    AND (delivery.status = 'pending' OR delivery.lease_until < now())
  ORDER BY delivery.not_before
  LIMIT $2
  FOR UPDATE SKIP LOCKED
)
UPDATE ops.outbox_delivery delivery
SET status = 'leased',
    attempts = delivery.attempts + 1,
    lease_token = $3,
    lease_until = now() + make_interval(secs => $4)
FROM due
JOIN ops.outbox_event event ON true
WHERE delivery.delivery_id = due.delivery_id
  AND event.event_id = delivery.event_id
RETURNING delivery.delivery_id, delivery.event_id, delivery.destination,
          delivery.attempts, delivery.lease_token, delivery.lease_until,
          event.payload, event.event_type, event.schema_version, event.partition_key
`;

const ACK_SQL = `
UPDATE ops.outbox_delivery
SET status = 'delivered', delivered_at = now(), lease_token = NULL, lease_until = NULL
WHERE delivery_id = $1 AND lease_token = $2 AND status = 'leased' AND lease_until >= now()
RETURNING delivery_id
`;

const FAIL_SQL = `
UPDATE ops.outbox_delivery
SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
    lease_token = NULL,
    lease_until = NULL,
    last_error = $3,
    not_before = now() + make_interval(secs => $4)
WHERE delivery_id = $1 AND lease_token = $2 AND status = 'leased'
RETURNING delivery_id, event_id, destination, attempts, max_attempts, status, last_error
`;

const DEAD_LETTER_SQL = `
INSERT INTO ops.dead_letter (delivery_id, event_id, destination, attempts, last_error)
VALUES ($1, $2, $3, $4, $5)
`;

/** Claim up to `limit` due deliveries for one destination (fenced lease). */
export async function claimDueDeliveries(
  client: PoolClient,
  options: { destination: string; limit?: number; leaseSeconds?: number },
): Promise<ClaimedDelivery[]> {
  const leaseToken = randomUUID();
  const result = await client.query<QueryResultRow & {
    delivery_id: string;
    event_id: string;
    destination: string;
    attempts: number;
    lease_token: string;
    lease_until: Date;
    payload: Record<string, unknown>;
    event_type: string;
    schema_version: number;
    partition_key: string;
  }>(CLAIM_SQL, [
    options.destination,
    options.limit ?? 10,
    leaseToken,
    options.leaseSeconds ?? 60,
  ]);
  return result.rows.map((row) => ({
    deliveryId: row.delivery_id,
    eventId: row.event_id,
    destination: row.destination,
    attempts: row.attempts,
    leaseToken: row.lease_token,
    leaseUntil: row.lease_until instanceof Date ? row.lease_until.toISOString() : String(row.lease_until),
    payload: row.payload,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    partitionKey: row.partition_key,
  }));
}

/** ACK requires the exact fencing token and an unexpired lease. */
export async function ackDelivery(
  client: PoolClient,
  deliveryId: string,
  leaseToken: string,
): Promise<boolean> {
  const result = await client.query(ACK_SQL, [deliveryId, leaseToken]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Record a failed attempt. Returns terminal status; when attempts are
 * exhausted the row flips to 'dead' and a dead-letter row is appended in the
 * same transaction.
 */
export async function failDelivery(
  client: PoolClient,
  deliveryId: string,
  leaseToken: string,
  error: string,
  retryDelaySeconds = 30,
): Promise<'pending' | 'dead' | 'lost_lease'> {
  const result = await client.query<QueryResultRow & {
    delivery_id: string;
    event_id: string;
    destination: string;
    attempts: number;
    status: string;
    last_error: string | null;
  }>(FAIL_SQL, [deliveryId, leaseToken, error.slice(0, 2000), retryDelaySeconds]);
  const row = result.rows[0];
  if (row === undefined) return 'lost_lease';
  if (row.status === 'dead') {
    await client.query(DEAD_LETTER_SQL, [
      row.delivery_id, row.event_id, row.destination, row.attempts, row.last_error,
    ]);
    return 'dead';
  }
  return 'pending';
}
