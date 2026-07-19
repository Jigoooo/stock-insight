import type { PoolClient, QueryResultRow } from 'pg';

import { deterministicDeliveryId, type EventEnvelope } from './event-envelope.ts';

// B1 — Transactional outbox store (master plan §5.1).
// insertOutboxEvent MUST be called on the same client/transaction as the
// domain mutation it describes: domain write + outbox insert commit or roll
// back together. The store never opens its own transaction.

export type OutboxInsertResult =
  | { outcome: 'inserted'; eventId: string }
  | { outcome: 'replayed'; eventId: string }
  | { outcome: 'conflict'; eventId: string };

const INSERT_EVENT_SQL = `
INSERT INTO ops.outbox_event (
  event_id, event_type, schema_version, aggregate_type, aggregate_id,
  aggregate_version, partition_key, occurred_at, producer,
  trace_id, causation_id, correlation_id, payload, payload_hash
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
ON CONFLICT (aggregate_type, aggregate_id, aggregate_version) DO NOTHING
RETURNING event_id
`;

const EXISTING_EVENT_SQL = `
SELECT event_id, payload_hash FROM ops.outbox_event
WHERE aggregate_type = $1 AND aggregate_id = $2 AND aggregate_version = $3
`;

const INSERT_CONFLICT_SQL = `
INSERT INTO ops.outbox_conflict (
  aggregate_type, aggregate_id, aggregate_version,
  existing_event_id, attempted_payload, attempted_hash, producer
) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
`;

const SEED_DELIVERY_SQL = `
INSERT INTO ops.outbox_delivery (delivery_id, event_id, destination)
VALUES ($1, $2, $3)
ON CONFLICT (event_id, destination) DO NOTHING
`;

const SCHEMA_ACTIVE_SQL = `
SELECT 1 FROM ops.event_schema_registry
WHERE event_type = $1 AND schema_version = $2 AND active
`;

/**
 * Insert an outbox event inside the caller's open transaction.
 * - Unknown/inactive (event_type, schema_version) -> throws (fail-closed).
 * - Same aggregate/version with the same payload hash -> idempotent replay.
 * - Same aggregate/version with a DIFFERENT payload hash -> quarantined in
 *   ops.outbox_conflict and reported as 'conflict' (caller decides to abort).
 */
export async function insertOutboxEvent(
  client: PoolClient,
  envelope: EventEnvelope,
): Promise<OutboxInsertResult> {
  const schema = await client.query(SCHEMA_ACTIVE_SQL, [envelope.eventType, envelope.schemaVersion]);
  if (schema.rowCount === 0) {
    throw new Error(
      `event schema ${envelope.eventType} v${envelope.schemaVersion} is not registered/active`,
    );
  }
  const inserted = await client.query<QueryResultRow & { event_id: string }>(INSERT_EVENT_SQL, [
    envelope.eventId,
    envelope.eventType,
    envelope.schemaVersion,
    envelope.aggregateType,
    envelope.aggregateId,
    envelope.aggregateVersion,
    envelope.partitionKey,
    envelope.occurredAt,
    envelope.producer,
    envelope.traceId ?? null,
    envelope.causationId ?? null,
    envelope.correlationId ?? null,
    JSON.stringify(envelope.payload),
    envelope.payloadHash,
  ]);
  if ((inserted.rowCount ?? 0) > 0) {
    return { outcome: 'inserted', eventId: envelope.eventId };
  }
  const existing = await client.query<QueryResultRow & { event_id: string; payload_hash: string }>(
    EXISTING_EVENT_SQL,
    [envelope.aggregateType, envelope.aggregateId, envelope.aggregateVersion],
  );
  const row = existing.rows[0];
  if (row === undefined) {
    throw new Error('outbox insert conflicted but the existing event row is missing');
  }
  if (row.payload_hash === envelope.payloadHash) {
    return { outcome: 'replayed', eventId: row.event_id };
  }
  await client.query(INSERT_CONFLICT_SQL, [
    envelope.aggregateType,
    envelope.aggregateId,
    envelope.aggregateVersion,
    row.event_id,
    JSON.stringify(envelope.payload),
    envelope.payloadHash,
    envelope.producer,
  ]);
  return { outcome: 'conflict', eventId: row.event_id };
}

/** Seed per-destination delivery rows (idempotent, same transaction). */
export async function seedDeliveries(
  client: PoolClient,
  eventId: string,
  destinations: readonly string[],
): Promise<void> {
  for (const destination of destinations) {
    await client.query(SEED_DELIVERY_SQL, [
      deterministicDeliveryId(eventId, destination),
      eventId,
      destination,
    ]);
  }
}
