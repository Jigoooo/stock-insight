import type { PoolClient } from 'pg';

// B1 — Consumer inbox (master plan §5.1).
// PK (consumer_id, event_id): each fan-out consumer keeps an independent
// receipt. The inbox marker and the consumer's projection MUST share the
// caller's transaction so a failed projection rolls the marker back (the
// event stays retryable) and a duplicate event skips the projection.

const INBOX_INSERT_SQL = `
INSERT INTO ops.consumer_inbox (consumer_id, event_id)
VALUES ($1, $2)
ON CONFLICT (consumer_id, event_id) DO NOTHING
RETURNING event_id
`;

export type InboxOutcome = 'processed' | 'duplicate';

/**
 * Process one event exactly once per consumer, inside the caller's open
 * transaction. `projection` runs only when this consumer has not yet
 * processed the event; if it throws, the whole transaction (marker included)
 * rolls back, so the event remains deliverable.
 */
export async function processInboxEvent(
  client: PoolClient,
  consumerId: string,
  eventId: string,
  projection: (client: PoolClient) => Promise<void>,
): Promise<InboxOutcome> {
  const marker = await client.query(INBOX_INSERT_SQL, [consumerId, eventId]);
  if ((marker.rowCount ?? 0) === 0) {
    return 'duplicate';
  }
  await projection(client);
  return 'processed';
}
