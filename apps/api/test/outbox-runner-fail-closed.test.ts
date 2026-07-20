import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

  it('fails the worker and analytics gate on signals or any undrained delivery', async () => {
    const runner = await readFile(runnerUrl, 'utf8');
    const pipeline = await readFile(pipelineUrl, 'utf8');
    assert.match(runner, /terminatedBySignal/);
    assert.match(runner, /unresolvedUndelivered/);
    assert.match(runner, /if \(terminated \|\| unresolvedUndelivered > 0\)/);
    assert.match(
      pipeline,
      /destination\s*=\s*'consumer_inbox:selective-recompute'[\s\S]*status IN \('pending','leased'\)[\s\S]*= 0/,
    );
    assert.doesNotMatch(pipeline, /status IN \('pending','leased'\)[^\n]*10 minutes/);
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

  it('exits non-zero and releases the batch tail after SIGTERM', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const eventIds: string[] = [];
    try {
      await client.query('BEGIN');
      for (let index = 0; index < 2; index += 1) {
        const aggregateId = `runner-signal-${randomUUID()}`;
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
            producer: 'runner-signal-test',
            payload: { fixture: aggregateId },
          }),
        );
        eventIds.push(inserted.eventId);
        await seedDeliveries(client, inserted.eventId, ['consumer_inbox:selective-recompute']);
      }
      await client.query(`
        CREATE OR REPLACE FUNCTION ops.delay_signal_test_inbox()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.event_id = ANY (ARRAY[${eventIds.map((id) => `'${id}'`).join(',')}]::text[]) THEN
            PERFORM pg_sleep(2);
          END IF;
          RETURN NEW;
        END $$;
        DROP TRIGGER IF EXISTS delay_signal_test_inbox ON ops.consumer_inbox;
        CREATE TRIGGER delay_signal_test_inbox
        BEFORE INSERT ON ops.consumer_inbox
        FOR EACH ROW EXECUTE FUNCTION ops.delay_signal_test_inbox();
      `);
      await client.query('COMMIT');

      const child = spawn(process.execPath, [runnerUrl.pathname, '--apply', '--loop'], {
        cwd: new URL('..', import.meta.url).pathname,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));

      const deadline = Date.now() + 10_000;
      let leased = 0;
      while (Date.now() < deadline) {
        const result = await client.query(
          `SELECT count(*)::int AS count FROM ops.outbox_delivery
           WHERE event_id = ANY($1::text[]) AND status='leased'`,
          [eventIds],
        );
        leased = Number(result.rows[0]!.count);
        if (leased === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(leased, 2, 'runner never leased the complete signal fixture batch');
      child.kill('SIGTERM');
      const exitCode = await new Promise<number | null>((resolve) =>
        child.once('exit', (code) => resolve(code)),
      );
      assert.notEqual(exitCode, 0, stdout);
      assert.match(stderr, /stopped before drain|unresolved dead/i);

      const states = await client.query(
        `SELECT status,count(*)::int AS count FROM ops.outbox_delivery
         WHERE event_id = ANY($1::text[]) GROUP BY status`,
        [eventIds],
      );
      assert.equal(
        states.rows.reduce(
          (sum, row) => sum + (row.status === 'leased' ? Number(row.count) : 0),
          0,
        ),
        0,
      );
    } finally {
      await client.query('DROP TRIGGER IF EXISTS delay_signal_test_inbox ON ops.consumer_inbox');
      await client.query('DROP FUNCTION IF EXISTS ops.delay_signal_test_inbox()');
      client.release();
      await pool.end();
    }
  });
});
