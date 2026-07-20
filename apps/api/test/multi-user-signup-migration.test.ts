import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

import { appHistoryUuidBridgeMigrationSql } from '../../../packages/db-schema/src/migrations/002_app_history_uuid_bridge.ts';
import { appLocalAccountEnrollmentMigrationSql } from '../../../packages/db-schema/src/migrations/005_local_account_enrollment.ts';
import { multiUserInvitationSignupMigrationSql } from '../../../packages/db-schema/src/migrations/030_multi_user_invitation_signup.ts';

const databaseUrl = process.env.STOCK_INSIGHT_MIGRATION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_MIGRATION_TEST_DB_URL is required';

const VALID_RECORD =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function digestOf(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

async function freshSchema(client: pg.Client): Promise<void> {
  // Minimal identity substrate the invitation migration builds on.
  await client.query('DROP TABLE IF EXISTS public.app_invitation_consumptions CASCADE');
  await client.query('DROP TABLE IF EXISTS public.app_invitations CASCADE');
  await client.query('DROP TABLE IF EXISTS public.app_local_accounts CASCADE');
  await client.query('DROP TABLE IF EXISTS public.app_auth_bootstrap_state CASCADE');
  await client.query('DROP TABLE IF EXISTS public.app_users CASCADE');
  await client.query('DROP TABLE IF EXISTS public.app_user_identity_map CASCADE');
  await client.query('DROP TABLE IF EXISTS public.user_decision_journal_entries CASCADE');
  await client.query('DROP TABLE IF EXISTS public.entities CASCADE');
  await client.query(`
    CREATE TABLE public.user_decision_journal_entries (
      entry_key text PRIMARY KEY, user_id text NOT NULL, entity_key text, market text,
      entry_type text, title text, thesis_text text, evidence_json jsonb, source_kind text,
      source_ref text, occurred_at timestamptz, review_due_at timestamptz, status text,
      advice_prohibited boolean, created_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE public.entities (entity_key text PRIMARY KEY, name text, symbol text);
    CREATE TABLE public.app_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      external_ref text NOT NULL,
      display_name text,
      channel_type text,
      active boolean NOT NULL DEFAULT true,
      raw_json jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await client.query(appHistoryUuidBridgeMigrationSql);
  await client.query(appLocalAccountEnrollmentMigrationSql);
  await client.query(multiUserInvitationSignupMigrationSql);
  // Mirror application_roles.sql: FORCE-RLS credential tables get a scoped
  // SELECT policy so a GUC-set reader can see its own rows, exactly as the
  // production reader role does. Applied to the connecting owner role for test.
  await client.query(`
    DROP POLICY IF EXISTS test_scoped_select ON public.app_local_accounts;
    CREATE POLICY test_scoped_select ON public.app_local_accounts FOR SELECT
      USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
    DROP POLICY IF EXISTS test_scoped_select ON public.app_auth_bootstrap_state;
    CREATE POLICY test_scoped_select ON public.app_auth_bootstrap_state FOR SELECT
      USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
  `);
}

describe('030 multi-user invitation signup', () => {
  it('declares digest-only invitations, bounded uses, and an atomic signup function', () => {
    assert.match(
      multiUserInvitationSignupMigrationSql,
      /CREATE TABLE IF NOT EXISTS public\.app_invitations/,
    );
    assert.match(
      multiUserInvitationSignupMigrationSql,
      /code_digest[\s\S]*~ '\^\[0-9a-f\]\{64\}\$'/,
    );
    assert.match(multiUserInvitationSignupMigrationSql, /used_count[\s\S]*<= max_uses/);
    assert.match(
      multiUserInvitationSignupMigrationSql,
      /FUNCTION public\.consume_invitation_and_create_account/,
    );
    assert.match(multiUserInvitationSignupMigrationSql, /pg_advisory_xact_lock/);
    assert.match(multiUserInvitationSignupMigrationSql, /SECURITY DEFINER/);
  });

  it(
    'creates a user + account + consumption atomically and rejects reuse/expiry/dupes',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await freshSchema(client);
        const code = `invite-${randomUUID()}`;
        await client.query(
          `INSERT INTO public.app_invitations (code_digest, label, max_uses, expires_at)
           VALUES ($1, 'test', 1, now() + interval '1 hour')`,
          [digestOf(code)],
        );

        // Happy path: creates one user with a bound account.
        const created = await client.query(
          `SELECT * FROM public.consume_invitation_and_create_account($1, $2, $3)`,
          [digestOf(code), 'alice', VALID_RECORD],
        );
        assert.equal(created.rows[0].status, 'created');
        const aliceId = created.rows[0].user_id as string;
        assert.match(aliceId, /^[0-9a-f-]{36}$/);

        // The two credential tables are FORCE-RLS, so read them exactly like
        // production: inside a transaction that first sets the scoped user GUC.
        await client.query('BEGIN');
        await client.query("SELECT set_config('stock_insight.user_id', $1, true)", [aliceId]);
        const account = await client.query(
          'SELECT username, password_record FROM public.app_local_accounts WHERE user_id=$1',
          [aliceId],
        );
        assert.equal(account.rows[0].username, 'alice');
        const bootstrap = await client.query(
          'SELECT count(*)::int AS c FROM public.app_auth_bootstrap_state WHERE user_id=$1',
          [aliceId],
        );
        assert.equal(bootstrap.rows[0].c, 1);
        await client.query('COMMIT');

        // A newly signed-up user must own an app_users row so watchlist/positions
        // (which FK to app_users.id) can be created under their scope.
        const appUser = await client.query(
          'SELECT count(*)::int AS c FROM public.app_users WHERE id=$1',
          [aliceId],
        );
        assert.equal(appUser.rows[0].c, 1);

        // Exhausted: single-use invite cannot mint a second account.
        const exhausted = await client.query(
          `SELECT status FROM public.consume_invitation_and_create_account($1, $2, $3)`,
          [digestOf(code), 'bob', VALID_RECORD],
        );
        assert.equal(exhausted.rows[0].status, 'exhausted');
        assert.equal(exhausted.rows[0].user_id ?? null, null);

        // Unknown code.
        const unknown = await client.query(
          `SELECT status FROM public.consume_invitation_and_create_account($1, $2, $3)`,
          [digestOf('nope'), 'carol', VALID_RECORD],
        );
        assert.equal(unknown.rows[0].status, 'invalid_code');

        // Expired code.
        const expiredCode = `invite-${randomUUID()}`;
        await client.query(
          `INSERT INTO public.app_invitations (code_digest, max_uses, expires_at)
           VALUES ($1, 5, now() - interval '1 minute')`,
          [digestOf(expiredCode)],
        );
        const expired = await client.query(
          `SELECT status FROM public.consume_invitation_and_create_account($1, $2, $3)`,
          [digestOf(expiredCode), 'dave', VALID_RECORD],
        );
        assert.equal(expired.rows[0].status, 'expired');

        // Duplicate username across a fresh multi-use invite.
        const multiCode = `invite-${randomUUID()}`;
        await client.query(
          `INSERT INTO public.app_invitations (code_digest, max_uses, expires_at)
           VALUES ($1, 5, now() + interval '1 hour')`,
          [digestOf(multiCode)],
        );
        const dupe = await client.query(
          `SELECT status FROM public.consume_invitation_and_create_account($1, $2, $3)`,
          [digestOf(multiCode), 'ALICE', VALID_RECORD],
        );
        assert.equal(dupe.rows[0].status, 'username_taken');

        // Login lookup by username resolves the account WITHOUT knowing the id,
        // bypassing per-user RLS via SECURITY DEFINER. Canonical (lowercased).
        const byName = await client.query(
          `SELECT user_id::text, username, password_record
             FROM public.lookup_login_account($1)`,
          ['ALICE'],
        );
        assert.equal(byName.rows.length, 1);
        assert.equal(byName.rows[0].user_id, aliceId);
        assert.equal(byName.rows[0].username, 'alice');
        assert.equal(byName.rows[0].password_record, VALID_RECORD);

        // Unknown username returns no row (fail-closed).
        const missing = await client.query(
          `SELECT user_id::text FROM public.lookup_login_account($1)`,
          ['ghost'],
        );
        assert.equal(missing.rows.length, 0);

        // Session-refresh lookup by canonical id resolves the same credential.
        const byId = await client.query(
          `SELECT user_id::text, username, password_record
             FROM public.lookup_account_by_id($1::uuid)`,
          [aliceId],
        );
        assert.equal(byId.rows.length, 1);
        assert.equal(byId.rows[0].username, 'alice');
        assert.equal(byId.rows[0].password_record, VALID_RECORD);
      } finally {
        await client.end();
      }
    },
  );

  it(
    'admits exactly one winner when two clients consume a single-use invite concurrently',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const setup = new pg.Client({ connectionString: databaseUrl });
      await setup.connect();
      const code = `invite-${randomUUID()}`;
      try {
        await freshSchema(setup);
        await setup.query(
          `INSERT INTO public.app_invitations (code_digest, max_uses, expires_at)
           VALUES ($1, 1, now() + interval '1 hour')`,
          [digestOf(code)],
        );
      } finally {
        await setup.end();
      }

      const run = async (username: string): Promise<string> => {
        const c = new pg.Client({ connectionString: databaseUrl });
        await c.connect();
        try {
          const res = await c.query(
            `SELECT status FROM public.consume_invitation_and_create_account($1, $2, $3)`,
            [digestOf(code), username, VALID_RECORD],
          );
          return res.rows[0].status as string;
        } finally {
          await c.end();
        }
      };

      const [a, b] = await Promise.all([run('userone'), run('usertwo')]);
      const statuses = [a, b].sort();
      assert.deepEqual(statuses, ['created', 'exhausted']);

      const verify = new pg.Client({ connectionString: databaseUrl });
      await verify.connect();
      try {
        // app_local_accounts is FORCE-RLS; the invitation consumption ledger is
        // the owner-visible authoritative count of successful signups.
        const count = await verify.query(
          'SELECT count(*)::int AS c FROM public.app_invitation_consumptions',
        );
        assert.equal(count.rows[0].c, 1);
        const used = await verify.query(
          'SELECT used_count FROM public.app_invitations WHERE code_digest=$1',
          [digestOf(code)],
        );
        assert.equal(used.rows[0].used_count, 1);
      } finally {
        await verify.end();
      }
    },
  );
});
