import { createHash } from 'node:crypto';

// B1 — Broker-neutral event envelope (master plan §5.2).
// Deterministic identities: the same aggregate mutation always produces the
// same event_id and the same (event, destination) always produces the same
// delivery_id, so retries and crash replays cannot fork identity.

export type EventEnvelope = {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  partitionKey: string;
  occurredAt: string;
  producer: string;
  traceId?: string;
  causationId?: string;
  correlationId?: string;
  payload: Record<string, unknown>;
  payloadHash: string;
};

export type EnvelopeInput = Omit<EventEnvelope, 'eventId' | 'payloadHash'>;

/** Stable JSON canonicalization: recursively sorted object keys. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function payloadHashOf(payload: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export function deterministicEventId(input: {
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  schemaVersion: number;
}): string {
  const key = [
    input.aggregateType,
    input.aggregateId,
    String(input.aggregateVersion),
    input.eventType,
    String(input.schemaVersion),
  ].join('|');
  return `evt-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

export function deterministicDeliveryId(eventId: string, destination: string): string {
  return `dlv-${createHash('sha256').update(`${eventId}|${destination}`).digest('hex').slice(0, 32)}`;
}

const REQUIRED_STRING_FIELDS = [
  'eventType', 'aggregateType', 'aggregateId', 'partitionKey', 'occurredAt', 'producer',
] as const;

export function buildEnvelope(input: EnvelopeInput): EventEnvelope {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = input[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`event envelope field ${field} is required`);
    }
  }
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new Error('event envelope schemaVersion must be a positive integer');
  }
  if (!Number.isInteger(input.aggregateVersion) || input.aggregateVersion < 1) {
    throw new Error('event envelope aggregateVersion must be a positive integer');
  }
  if (Number.isNaN(new Date(input.occurredAt).getTime())) {
    throw new Error('event envelope occurredAt must be a valid timestamp');
  }
  return {
    ...input,
    eventId: deterministicEventId(input),
    payloadHash: payloadHashOf(input.payload),
  };
}
