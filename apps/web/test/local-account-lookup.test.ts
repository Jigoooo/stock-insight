import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  loadLocalAccountByUsername,
  loadLocalAccountById,
} from '../src/server/auth/local-account-repository.ts';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const RECORD =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

type Call = { sql: string; params: readonly unknown[] };

function stubExecutor(rows: Record<string, unknown>[], sink: Call[]) {
  return async (sql: string, params: readonly unknown[] = []) => {
    sink.push({ sql, params });
    return rows as never;
  };
}

describe('multi-user local account lookups', () => {
  it('resolves a login account by username via the SECURITY DEFINER function', async () => {
    const calls: Call[] = [];
    const account = await loadLocalAccountByUsername(
      stubExecutor([{ user_id: USER_ID, username: 'alice', password_record: RECORD }], calls),
      'ALICE',
    );
    assert.deepEqual(account, { userId: USER_ID, username: 'alice', passwordRecord: RECORD });
    assert.match(calls[0]!.sql, /public\.lookup_login_account/);
    assert.deepEqual(calls[0]!.params, ['ALICE']);
  });

  it('returns undefined when the username is unknown (fail-closed)', async () => {
    const account = await loadLocalAccountByUsername(stubExecutor([], []), 'ghost');
    assert.equal(account, undefined);
  });

  it('rejects a malformed username before touching the database', async () => {
    const calls: Call[] = [];
    const account = await loadLocalAccountByUsername(stubExecutor([], calls), 'a');
    assert.equal(account, undefined);
    assert.equal(calls.length, 0);
  });

  it('rejects a row whose returned username fails the account pattern', async () => {
    await assert.rejects(
      loadLocalAccountByUsername(
        stubExecutor([{ user_id: USER_ID, username: 'has space', password_record: RECORD }], []),
        'alice',
      ),
      /Invalid local account state/,
    );
  });

  it('resolves a login account by canonical id via the SECURITY DEFINER function', async () => {
    const calls: Call[] = [];
    const account = await loadLocalAccountById(
      stubExecutor([{ user_id: USER_ID, username: 'alice', password_record: RECORD }], calls),
      USER_ID,
    );
    assert.deepEqual(account, { userId: USER_ID, username: 'alice', passwordRecord: RECORD });
    assert.match(calls[0]!.sql, /public\.lookup_account_by_id/);
    assert.deepEqual(calls[0]!.params, [USER_ID]);
  });

  it('rejects a non-uuid id before touching the database', async () => {
    const calls: Call[] = [];
    await assert.rejects(
      loadLocalAccountById(stubExecutor([], calls), 'not-a-uuid'),
      /Invalid local account state/,
    );
    assert.equal(calls.length, 0);
  });
});
