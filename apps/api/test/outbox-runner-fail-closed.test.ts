import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import pg from 'pg';

import { buildEnvelope } from '../src/events/event-envelope.ts';
import { insertOutboxEvent, seedDeliveries } from '../src/events/outbox-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_OUTBOX_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_OUTBOX_TEST_DB_URL is required';
const runnerUrl = new URL('../src/ops/run-outbox-delivery.ts', import.meta.url);
const pipelineUrl = new URL('../scripts/run_analytics_pipeline.sh', import.meta.url);

describe('P0 outbox runner fail-closed contract', () => {
  it('uses the fenced dispatcher primitives and forbids duplicate settlement SQL', async () => {
    const source = await readFile(runnerUrl, 'utf8');
    for (const symbol of [
      'ackDelivery',
      'claimDueDeliveries',
      'expireExhaustedDeliveries',
      'failDelivery',
    ]) {
      assert.match(source, new RegExp(`\\b${symbol}\\b`));
    }
    assert.doesNotMatch(source, /UPDATE ops\.outbox_delivery/);
  });

  it('requires zero dead deliveries in the final analytics gate', async () => {
    const source = await readFile(pipelineUrl, 'utf8');
    assert.match(source, /status\s*=\s*'dead'/);
    assert.match(source, /dead_letter/);
  });

  it('exits non-zero when an unresolved dead delivery exists', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      const aggregateId = `runner-dead-${randomUUID()}`;
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
          producer: 'runner-fail-closed-test',
          payload: { fixture: aggregateId },
        }),
      );
      await seedDeliveries(client, inserted.eventId, ['consumer_inbox:selective-recompute']);
      await client.query(
        `UPDATE ops.outbox_delivery
         SET status='dead', attempts=max_attempts, last_error='fixture'
         WHERE event_id=$1`,
        [inserted.eventId],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
      await pool.end();
    }

    const result = spawnSync(process.execPath, [runnerUrl.pathname, '--apply', '--loop'], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /dead/i);
  });
});
