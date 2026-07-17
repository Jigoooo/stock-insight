import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

const readerUrl = process.env.STOCK_INSIGHT_LIVE_READER_DB_URL;
const writerUrl = process.env.STOCK_INSIGHT_LIVE_WRITER_DB_URL;
const userId = process.env.STOCK_INSIGHT_LIVE_USER_ID;
const skipReason =
  readerUrl && writerUrl && userId
    ? false
    : 'STOCK_INSIGHT_LIVE_READER_DB_URL, STOCK_INSIGHT_LIVE_WRITER_DB_URL, and STOCK_INSIGHT_LIVE_USER_ID are required';

function postgresCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function setScope(client: pg.PoolClient, scopeUserId: string) {
  await client.query('BEGIN');
  await client.query("SELECT set_config('stock_insight.user_id', $1, true)", [scopeUserId]);
}

describe('live application role boundaries', () => {
  it('allows enumerated reads while denying reader writes', { skip: skipReason }, async () => {
    assert.ok(readerUrl);
    assert.ok(userId);
    const pool = new pg.Pool({ connectionString: readerUrl, max: 1 });
    const client = await pool.connect();
    try {
      await setScope(client, userId);
      const identity = await client.query<{ current_user: string }>('SELECT current_user');
      assert.equal(identity.rows[0]?.current_user, 'stock_insight_app_reader');
      await client.query('SELECT count(*) FROM watchlist.deep_cache');
      await assert.rejects(
        client.query('UPDATE public.user_watchlist SET display_name = display_name WHERE false'),
        (error) => postgresCode(error) === '42501',
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  it(
    'allows scoped writer inserts but denies cross-user rows and delete',
    { skip: skipReason },
    async () => {
      assert.ok(writerUrl);
      assert.ok(userId);
      const pool = new pg.Pool({ connectionString: writerUrl, max: 1 });
      const client = await pool.connect();
      try {
        await setScope(client, userId);
        const identity = await client.query<{ current_user: string }>('SELECT current_user');
        assert.equal(identity.rows[0]?.current_user, 'stock_insight_app_writer');
        await client.query(
          `INSERT INTO public.app_mutation_idempotency
           (user_id, idempotency_key, operation, request_hash, state)
         VALUES ($1::uuid, $2::uuid, 'role-boundary-test', $3, 'pending')`,
          [userId, randomUUID(), 'a'.repeat(64)],
        );
        await client.query('ROLLBACK');

        await setScope(client, userId);
        await assert.rejects(
          client.query(
            `INSERT INTO public.app_mutation_idempotency
             (user_id, idempotency_key, operation, request_hash, state)
           VALUES ('22222222-2222-4222-8222-222222222222'::uuid, $1::uuid,
                   'cross-user-test', $2, 'pending')`,
            [randomUUID(), 'b'.repeat(64)],
          ),
          (error) => postgresCode(error) === '42501',
        );
        await client.query('ROLLBACK');

        await setScope(client, userId);
        await assert.rejects(
          client.query('DELETE FROM public.user_watchlist WHERE false'),
          (error) => postgresCode(error) === '42501',
        );
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
  );
});
