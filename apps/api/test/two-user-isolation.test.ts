import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

// Two-user data isolation regression. Requires the LIVE research DB (RLS + roles
// already applied). Creates two invited users, writes one watchlist row for each
// under its own scope, and proves the per-user GUC + RLS make cross-user reads
// return zero rows. Skips when no live write URL is configured.
const databaseUrl = process.env.STOCK_INSIGHT_LIVE_WRITE_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_LIVE_WRITE_DB_URL is required';

const VALID_RECORD =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function digestOf(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

async function createUser(client: pg.Client, username: string, digests: string[]): Promise<string> {
  const code = `iso-${randomUUID()}`;
  const digest = digestOf(code);
  digests.push(digest);
  await client.query(
    `INSERT INTO public.app_invitations (code_digest, max_uses, expires_at)
     VALUES ($1, 1, now() + interval '1 hour')`,
    [digest],
  );
  const res = await client.query(
    `SELECT status, user_id::text AS user_id
       FROM public.consume_invitation_and_create_account($1, $2, $3)`,
    [digest, username, VALID_RECORD],
  );
  assert.equal(res.rows[0].status, 'created');
  return res.rows[0].user_id as string;
}

async function withScope<T>(client: pg.Client, userId: string, work: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  await client.query("SELECT set_config('stock_insight.user_id', $1, true)", [userId]);
  try {
    const out = await work();
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

describe('two-user watchlist isolation (RLS)', () => {
  it(
    'never lets one user read or overwrite another user watchlist row',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const admin = new pg.Client({ connectionString: databaseUrl });
      await admin.connect();
      const aKey = `ISO:${randomUUID().slice(0, 6).toUpperCase()}`;
      const bKey = `ISO:${randomUUID().slice(0, 6).toUpperCase()}`;
      const usernameA = `isoa${Date.now().toString(36)}`;
      const usernameB = `isob${Date.now().toString(36)}`;
      let userA = '';
      let userB = '';
      const createdDigests: string[] = [];
      // Use a writer-role connection so RLS actually applies (admin owner would bypass).
      const writer = new pg.Client({ connectionString: databaseUrl });
      await writer.connect();
      try {
        userA = await createUser(admin, usernameA, createdDigests);
        userB = await createUser(admin, usernameB, createdDigests);

        // Each user writes exactly one watchlist row under its own scope.
        await withScope(writer, userA, async () => {
          await writer.query(
            `INSERT INTO public.user_watchlist (user_id, entity_key, source, active)
             VALUES ($1::uuid, $2, 'test', true)`,
            [userA, aKey],
          );
        });
        await withScope(writer, userB, async () => {
          await writer.query(
            `INSERT INTO public.user_watchlist (user_id, entity_key, source, active)
             VALUES ($1::uuid, $2, 'test', true)`,
            [userB, bKey],
          );
        });

        // A sees only A's row; B's key is invisible.
        const aVisible = await withScope(writer, userA, async () => {
          const own = await writer.query(
            'SELECT count(*)::int AS c FROM public.user_watchlist WHERE entity_key=$1',
            [aKey],
          );
          const foreign = await writer.query(
            'SELECT count(*)::int AS c FROM public.user_watchlist WHERE entity_key=$1',
            [bKey],
          );
          return { own: own.rows[0].c as number, foreign: foreign.rows[0].c as number };
        });
        assert.equal(aVisible.own, 1);
        assert.equal(aVisible.foreign, 0);

        // B sees only B's row; A's key is invisible.
        const bVisible = await withScope(writer, userB, async () => {
          const own = await writer.query(
            'SELECT count(*)::int AS c FROM public.user_watchlist WHERE entity_key=$1',
            [bKey],
          );
          const foreign = await writer.query(
            'SELECT count(*)::int AS c FROM public.user_watchlist WHERE entity_key=$1',
            [aKey],
          );
          return { own: own.rows[0].c as number, foreign: foreign.rows[0].c as number };
        });
        assert.equal(bVisible.own, 1);
        assert.equal(bVisible.foreign, 0);

        // A cannot UPDATE B's row (RLS UPDATE policy scopes to own user_id).
        const crossUpdate = await withScope(writer, userA, async () => {
          const res = await writer.query(
            `UPDATE public.user_watchlist SET display_name='hijacked' WHERE entity_key=$1`,
            [bKey],
          );
          return res.rowCount ?? 0;
        });
        assert.equal(crossUpdate, 0);
      } finally {
        // Cleanup: remove test rows and users as the owner (bypasses RLS).
        try {
          if (userA)
            await admin.query('DELETE FROM public.user_watchlist WHERE user_id=$1', [userA]);
          if (userB)
            await admin.query('DELETE FROM public.user_watchlist WHERE user_id=$1', [userB]);
          for (const uid of [userA, userB].filter(Boolean)) {
            await admin.query('DELETE FROM public.app_invitation_consumptions WHERE user_id=$1', [
              uid,
            ]);
            await admin.query('DELETE FROM public.app_local_accounts WHERE user_id=$1', [uid]);
            await admin.query('DELETE FROM public.app_auth_bootstrap_state WHERE user_id=$1', [
              uid,
            ]);
            await admin.query('DELETE FROM public.app_user_identity_map WHERE user_id=$1', [uid]);
          }
          if (createdDigests.length > 0) {
            await admin.query('DELETE FROM public.app_invitations WHERE code_digest = ANY($1)', [
              createdDigests,
            ]);
          }
        } catch {
          // best-effort cleanup
        }
        await writer.end();
        await admin.end();
      }
    },
  );
});
