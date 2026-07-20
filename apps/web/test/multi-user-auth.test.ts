import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  authenticateAccount,
  issueSessionForAccount,
  resolveSessionFromAccount,
} from '../src/server/auth/multi-user-auth.ts';
import { createScryptPasswordRecordAsync } from '../src/server/auth/session-core.ts';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-42d3-a456-426614174999';
const BASE_SECRET = Buffer.alloc(32, 0x44);
const TTL = 3_600;

async function accountFor(username: string, password: string) {
  return {
    userId: USER_ID,
    username,
    passwordRecord: await createScryptPasswordRecordAsync(password),
  };
}

describe('multi-user authentication orchestration', () => {
  it('issues a credential-bound session for an account', async () => {
    const account = await accountFor('alice', 'correct horse battery');
    const issued = issueSessionForAccount(BASE_SECRET, TTL, account);
    assert.equal(issued.session.sub, USER_ID);
    assert.equal(issued.session.username, 'alice');
    assert.equal(issued.maxAgeSeconds, TTL);
    // The issued token round-trips only under the same account binding.
    assert.ok(resolveSessionFromAccount(BASE_SECRET, issued.token, account));
  });

  it('authenticates a matching username + password', async () => {
    const account = await accountFor('alice', 'correct horse battery');
    const issued = await authenticateAccount(
      BASE_SECRET,
      TTL,
      account,
      'alice',
      'correct horse battery',
    );
    assert.ok(issued);
    assert.equal(issued.session.sub, USER_ID);
  });

  it('rejects a wrong password without leaking which field failed', async () => {
    const account = await accountFor('alice', 'correct horse battery');
    const issued = await authenticateAccount(BASE_SECRET, TTL, account, 'alice', 'wrong password');
    assert.equal(issued, undefined);
  });

  it('rejects a mismatched username even with the right password', async () => {
    const account = await accountFor('alice', 'correct horse battery');
    const issued = await authenticateAccount(
      BASE_SECRET,
      TTL,
      account,
      'bob',
      'correct horse battery',
    );
    assert.equal(issued, undefined);
  });

  it('spends dummy work and fails closed when the account is absent (no user enumeration)', async () => {
    const issued = await authenticateAccount(BASE_SECRET, TTL, undefined, 'ghost', 'whatever');
    assert.equal(issued, undefined);
  });

  it('resolves a session only when the account still binds the token', async () => {
    const account = await accountFor('alice', 'correct horse battery');
    const issued = issueSessionForAccount(BASE_SECRET, TTL, account);
    // Same id, rotated password → the credential-derived secret changes → reject.
    const rotated = {
      ...account,
      passwordRecord: await createScryptPasswordRecordAsync('new password here'),
    };
    assert.equal(resolveSessionFromAccount(BASE_SECRET, issued.token, rotated), undefined);
    // A different user's account never validates another user's token.
    const foreign = { ...account, userId: OTHER_ID };
    assert.equal(resolveSessionFromAccount(BASE_SECRET, issued.token, foreign), undefined);
    // Missing account fails closed.
    assert.equal(resolveSessionFromAccount(BASE_SECRET, issued.token, undefined), undefined);
  });
});
