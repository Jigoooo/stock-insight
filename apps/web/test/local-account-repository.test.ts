import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  insertLocalAccount,
  isEnrollmentConsumed,
  loadLocalAccount,
  type LocalAccountQueryExecutor,
} from '../src/server/auth/local-account-repository.ts';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const PASSWORD_RECORD =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('local account repository', () => {
  it('reads the durable enrollment-consumed tombstone for the configured scope', async () => {
    assert.equal(
      await isEnrollmentConsumed(async () => [{ enrollment_consumed: true }], USER_ID),
      true,
    );
    assert.equal(
      await isEnrollmentConsumed(async () => [{ enrollment_consumed: false }], USER_ID),
      false,
    );
    await assert.rejects(
      isEnrollmentConsumed(async () => [{ enrollment_consumed: 'true' }], USER_ID),
      /Invalid local account state/,
    );
  });

  it('loads at most one validated account for the configured user scope', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: LocalAccountQueryExecutor = async (sql, params = []) => {
      calls.push({ sql, params });
      return [{ user_id: USER_ID, username: 'new.user', password_record: PASSWORD_RECORD }];
    };

    assert.deepEqual(await loadLocalAccount(executor, USER_ID), {
      userId: USER_ID,
      username: 'new.user',
      passwordRecord: PASSWORD_RECORD,
    });
    assert.match(calls[0]!.sql, /from public\.app_local_accounts/i);
    assert.match(calls[0]!.sql, /where user_id = \$1/i);
    assert.deepEqual(calls[0]!.params, [USER_ID]);
  });

  it('returns undefined for an unenrolled user and fails closed for duplicate or malformed rows', async () => {
    assert.equal(await loadLocalAccount(async () => [], USER_ID), undefined);
    await assert.rejects(
      loadLocalAccount(
        async () => [
          { user_id: USER_ID, username: 'first', password_record: PASSWORD_RECORD },
          { user_id: USER_ID, username: 'second', password_record: PASSWORD_RECORD },
        ],
        USER_ID,
      ),
      /Invalid local account state/,
    );
    await assert.rejects(
      loadLocalAccount(
        async () => [{ user_id: USER_ID, username: 'bad user', password_record: PASSWORD_RECORD }],
        USER_ID,
      ),
      /Invalid local account state/,
    );
  });

  it('inserts once and classifies a unique-conflict loser without updating credentials', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const inserted = await insertLocalAccount(
      async (sql, params = []) => {
        calls.push({ sql, params });
        return [{ user_id: USER_ID, username: 'new.user', password_record: PASSWORD_RECORD }];
      },
      { userId: USER_ID, username: 'new.user', passwordRecord: PASSWORD_RECORD },
    );

    assert.equal(inserted.status, 'created');
    assert.match(calls[0]!.sql, /insert into public\.app_auth_bootstrap_state/i);
    assert.match(calls[0]!.sql, /insert into public\.app_local_accounts/i);
    assert.match(calls[0]!.sql, /from consumed/i);
    assert.match(calls[0]!.sql, /on conflict \(user_id\) do nothing/i);
    assert.doesNotMatch(calls[0]!.sql, /do update/i);
    assert.deepEqual(calls[0]!.params, [USER_ID, 'new.user', PASSWORD_RECORD]);

    assert.deepEqual(
      await insertLocalAccount(async () => [], {
        userId: USER_ID,
        username: 'new.user',
        passwordRecord: PASSWORD_RECORD,
      }),
      { status: 'already_enrolled' },
    );
  });
});
