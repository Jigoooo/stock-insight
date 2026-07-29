import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  authenticateCredentials,
  createScryptPasswordRecordAsync,
  credentialFingerprint,
  enrollAccount,
  toAccountIdentity,
} from '../dist/index.js';

const SECRET = Buffer.alloc(32, 3);
const OTHER_SECRET = Buffer.alloc(32, 4);
const USER_ID = '11111111-2222-4333-8444-555555555555';

async function account(username = 'jigoo', password = 'correct horse battery') {
  return {
    userId: USER_ID,
    username,
    passwordRecord: await createScryptPasswordRecordAsync(password),
  };
}

function executorReturning(rows: Record<string, unknown>[]) {
  return async () => rows as never;
}

describe('credential fingerprint contract', () => {
  // The whole point of A-1: the web/BFF must never receive password material.
  it('never exposes the password record in the identity payload', async () => {
    const local = await account();
    const identity = toAccountIdentity(SECRET, local);
    const serialized = JSON.stringify(identity);
    assert.ok(!serialized.includes(local.passwordRecord));
    assert.ok(!serialized.includes('scrypt$'));
    assert.deepEqual(Object.keys(identity).sort(), ['credentialFingerprint', 'userId', 'username']);
  });

  // Preserves the legacy credential-binding property: a password rotation must
  // invalidate every previously issued session for that account.
  it('changes when the password record rotates', async () => {
    const before = await account();
    const after = { ...before, passwordRecord: await createScryptPasswordRecordAsync('new pw') };
    assert.notEqual(credentialFingerprint(SECRET, before), credentialFingerprint(SECRET, after));
  });

  it('changes when the username or user id changes', async () => {
    const base = await account();
    assert.notEqual(
      credentialFingerprint(SECRET, base),
      credentialFingerprint(SECRET, { ...base, username: 'other' }),
    );
    assert.notEqual(
      credentialFingerprint(SECRET, base),
      credentialFingerprint(SECRET, {
        ...base,
        userId: '99999999-2222-4333-8444-555555555555',
      }),
    );
  });

  it('is bound to the internal secret', async () => {
    const local = await account();
    assert.notEqual(
      credentialFingerprint(SECRET, local),
      credentialFingerprint(OTHER_SECRET, local),
    );
  });

  it('is stable for identical inputs', async () => {
    const local = await account();
    assert.equal(credentialFingerprint(SECRET, local), credentialFingerprint(SECRET, local));
  });
});

describe('authenticateCredentials', () => {
  it('authenticates a matching username + password', async () => {
    const local = await account();
    const result = await authenticateCredentials(
      executorReturning([
        {
          user_id: local.userId,
          username: local.username,
          password_record: local.passwordRecord,
        },
      ]),
      SECRET,
      { username: local.username, password: 'correct horse battery' },
    );
    assert.equal(result.status, 'authenticated');
    assert.equal(
      result.status === 'authenticated' ? result.identity.credentialFingerprint : undefined,
      credentialFingerprint(SECRET, local),
    );
  });

  it('rejects a wrong password without leaking which factor failed', async () => {
    const local = await account();
    const result = await authenticateCredentials(
      executorReturning([
        {
          user_id: local.userId,
          username: local.username,
          password_record: local.passwordRecord,
        },
      ]),
      SECRET,
      { username: local.username, password: 'wrong' },
    );
    assert.deepEqual(result, { status: 'rejected' });
  });

  it('rejects an unknown username and still spends a scrypt verification', async () => {
    const startedAt = performance.now();
    const result = await authenticateCredentials(executorReturning([]), SECRET, {
      username: 'ghost',
      password: 'whatever',
    });
    assert.deepEqual(result, { status: 'rejected' });
    // Dummy-record verification is a real scrypt run (N=16384); a short-circuit
    // return would finish in well under a millisecond.
    assert.ok(performance.now() - startedAt > 1);
  });

  it('rejects a structurally invalid username without touching the database', async () => {
    let queried = false;
    const result = await authenticateCredentials(
      (async () => {
        queried = true;
        return [] as never;
      }) as never,
      SECRET,
      { username: 'no', password: 'whatever' },
    );
    assert.deepEqual(result, { status: 'rejected' });
    assert.equal(queried, false);
  });
});

describe('enrollAccount', () => {
  const input = { username: 'newuser', password: 'pw12345678', enrollmentCode: 'code' };

  it('returns an identity on created without echoing the password record', async () => {
    const result = await enrollAccount(
      {
        hashCode: () => 'digest',
        consumeInvitation: async () => ({ status: 'created', user_id: USER_ID }),
      },
      SECRET,
      input,
    );
    assert.equal(result.status, 'created');
    if (result.status !== 'created') return;
    assert.equal(result.identity.userId, USER_ID);
    assert.ok(!JSON.stringify(result.identity).includes('scrypt$'));
  });

  it('maps conflict-like statuses to unavailable', async () => {
    for (const status of ['username_taken', 'exhausted', 'expired', 'revoked']) {
      const result = await enrollAccount(
        {
          hashCode: () => 'digest',
          consumeInvitation: async () => ({ status, user_id: null }),
        },
        SECRET,
        input,
      );
      assert.deepEqual(result, { status: 'unavailable' }, `status=${status}`);
    }
  });

  it('maps anything else to invalid_code', async () => {
    const result = await enrollAccount(
      {
        hashCode: () => 'digest',
        consumeInvitation: async () => ({ status: 'not_found', user_id: null }),
      },
      SECRET,
      input,
    );
    assert.deepEqual(result, { status: 'invalid_code' });
  });

  it('rejects a malformed username before hashing a password', async () => {
    let consumed = false;
    const result = await enrollAccount(
      {
        hashCode: () => 'digest',
        consumeInvitation: async () => {
          consumed = true;
          return { status: 'created', user_id: USER_ID };
        },
      },
      SECRET,
      { ...input, username: 'x' },
    );
    assert.deepEqual(result, { status: 'invalid_code' });
    assert.equal(consumed, false);
  });
});
