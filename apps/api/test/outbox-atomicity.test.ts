import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg, { type PoolClient } from 'pg';

import { buildEnvelope, deterministicEventId, payloadHashOf } from '../src/events/event-envelope.ts';
import { insertOutboxEvent, seedDeliveries } from '../src/events/outbox-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_OUTBOX_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_OUTBOX_TEST_DB_URL is required';

function envelopeFixture(version = 1, payload: Record<string, unknown> = { value: 'a' }) {
  return buildEnvelope({
    eventType: 'report.published',
    schemaVersion: 1,
    aggregateType: 'report',
    aggregateId: 'agg-atomicity',
    aggregateVersion: version,
    partitionKey: 'agg-atomicity',
    occurredAt: '2026-07-19T00:00:00.000Z',
    producer: 'outbox-atomicity-test',
    payload,
  });
}

async function withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  assert.ok(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function cleanupAggregate(client: PoolClient): Promise<void> {
  const aggregateId = 'agg-atomicity';
  await client.query(
    'DELETE FROM ops.dead_letter WHERE event_id IN (SELECT event_id FROM ops.outbox_event WHERE aggregate_id = $1)',
    [aggregateId],
  );
  await client.query(
    'DELETE FROM ops.outbox_delivery WHERE event_id IN (SELECT event_id FROM ops.outbox_event WHERE aggregate_id = $1)',
    [aggregateId],
  );
  await client.query('DELETE FROM ops.outbox_conflict WHERE aggregate_id = $1', [aggregateId]);
  await client.query('DELETE FROM ops.outbox_event WHERE aggregate_id = $1', [aggregateId]);
}

describe('B1 outbox atomicity', () => {
  it('deterministic identities are stable and payload-hash canonicalized', () => {
    const idA = deterministicEventId({
      aggregateType: 'report', aggregateId: 'r1', aggregateVersion: 1,
      eventType: 'report.published', schemaVersion: 1,
    });
    const idB = deterministicEventId({
      aggregateType: 'report', aggregateId: 'r1', aggregateVersion: 1,
      eventType: 'report.published', schemaVersion: 1,
    });
    assert.equal(idA, idB);
    assert.equal(payloadHashOf({ a: 1, b: 2 }), payloadHashOf({ b: 2, a: 1 }));
    assert.notEqual(payloadHashOf({ a: 1 }), payloadHashOf({ a: 2 }));
  });

  it('domain mutation and outbox insert roll back together', { skip: skipReason }, async () => {
    await withClient(async (client) => {
      await cleanupAggregate(client);
      await client.query(`CREATE TABLE IF NOT EXISTS ops.b1_test_domain (id TEXT PRIMARY KEY)`);
      await client.query('DELETE FROM ops.b1_test_domain');

      await client.query('BEGIN');
      await client.query('INSERT INTO ops.b1_test_domain (id) VALUES ($1)', ['row-1']);
      const result = await insertOutboxEvent(client, envelopeFixture(1));
      assert.equal(result.outcome, 'inserted');
      await client.query('ROLLBACK');

      const domain = await client.query('SELECT count(*)::int AS n FROM ops.b1_test_domain');
      const outbox = await client.query(
        'SELECT count(*)::int AS n FROM ops.outbox_event WHERE aggregate_id = $1',
        ['agg-atomicity'],
      );
      assert.equal(domain.rows[0]!.n, 0);
      assert.equal(outbox.rows[0]!.n, 0);
    });
  });

  it('exact replay is idempotent; different payload at the same version is a quarantined conflict', { skip: skipReason }, async () => {
    await withClient(async (client) => {
      await cleanupAggregate(client);

      await client.query('BEGIN');
      const first = await insertOutboxEvent(client, envelopeFixture(2, { value: 'a' }));
      const replay = await insertOutboxEvent(client, envelopeFixture(2, { value: 'a' }));
      const conflict = await insertOutboxEvent(client, envelopeFixture(2, { value: 'DIFFERENT' }));
      await client.query('COMMIT');

      assert.equal(first.outcome, 'inserted');
      assert.equal(replay.outcome, 'replayed');
      assert.equal(replay.eventId, first.eventId);
      assert.equal(conflict.outcome, 'conflict');
      const quarantined = await client.query(
        'SELECT count(*)::int AS n FROM ops.outbox_conflict WHERE aggregate_id = $1',
        ['agg-atomicity'],
      );
      assert.equal(quarantined.rows[0]!.n, 1);
      const events = await client.query(
        'SELECT count(*)::int AS n FROM ops.outbox_event WHERE aggregate_id = $1 AND aggregate_version = 2',
        ['agg-atomicity'],
      );
      assert.equal(events.rows[0]!.n, 1);
    });
  });

  it('unregistered event schema fails closed', { skip: skipReason }, async () => {
    await withClient(async (client) => {
      const bogus = buildEnvelope({
        eventType: 'not.registered',
        schemaVersion: 99,
        aggregateType: 'report',
        aggregateId: 'agg-atomicity',
        aggregateVersion: 3,
        partitionKey: 'agg-atomicity',
        occurredAt: '2026-07-19T00:00:00.000Z',
        producer: 'outbox-atomicity-test',
        payload: {},
      });
      await client.query('BEGIN');
      await assert.rejects(() => insertOutboxEvent(client, bogus), /not registered/);
      await client.query('ROLLBACK');
    });
  });

  it('delivery seeding is idempotent per (event, destination)', { skip: skipReason }, async () => {
    await withClient(async (client) => {
      await client.query('BEGIN');
      const inserted = await insertOutboxEvent(client, envelopeFixture(4, { value: 'seed' }));
      await seedDeliveries(client, inserted.eventId, ['projection', 'projection', 'webhook']);
      await seedDeliveries(client, inserted.eventId, ['projection']);
      await client.query('COMMIT');
      const rows = await client.query(
        'SELECT count(*)::int AS n FROM ops.outbox_delivery WHERE event_id = $1',
        [inserted.eventId],
      );
      assert.equal(rows.rows[0]!.n, 2);
    });
  });
});
