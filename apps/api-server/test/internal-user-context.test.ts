import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InternalContextError,
  signInternalUserContext,
  verifyInternalUserContext,
} from '../src/read/internal-user-context.ts';

const SECRET = Buffer.alloc(32, 0x51);
const USER_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('api-server internal user context', () => {
  it('round-trips a signed context bound to method + path', () => {
    const now = 1_000_000;
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/workspace',
      now,
      ttlSeconds: 30,
    });
    const scope = verifyInternalUserContext(SECRET, token, {
      method: 'GET',
      path: '/v1/workspace',
      now: now + 5,
    });
    assert.equal(scope.userId, USER_ID);
  });

  it('rejects a tampered subject (mac mismatch)', () => {
    const now = 1_000_000;
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/workspace',
      now,
      ttlSeconds: 30,
    });
    const forged = token.replace(USER_ID, '99999999-9999-4999-8999-999999999999');
    assert.throws(
      () =>
        verifyInternalUserContext(SECRET, forged, {
          method: 'GET',
          path: '/v1/workspace',
          now: now + 1,
        }),
      InternalContextError,
    );
  });

  it('rejects a context replayed on a different method or path', () => {
    const now = 1_000_000;
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/workspace',
      now,
      ttlSeconds: 30,
    });
    assert.throws(
      () =>
        verifyInternalUserContext(SECRET, token, {
          method: 'GET',
          path: '/v1/history',
          now: now + 1,
        }),
      InternalContextError,
    );
    assert.throws(
      () =>
        verifyInternalUserContext(SECRET, token, {
          method: 'POST',
          path: '/v1/workspace',
          now: now + 1,
        }),
      InternalContextError,
    );
  });

  it('rejects an expired or not-yet-valid context (TTL window)', () => {
    const now = 1_000_000;
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/workspace',
      now,
      ttlSeconds: 30,
    });
    assert.throws(
      () =>
        verifyInternalUserContext(SECRET, token, {
          method: 'GET',
          path: '/v1/workspace',
          now: now + 31,
        }),
      InternalContextError,
    );
    assert.throws(
      () =>
        verifyInternalUserContext(SECRET, token, {
          method: 'GET',
          path: '/v1/workspace',
          now: now - 1,
        }),
      InternalContextError,
    );
  });

  it('rejects a wrong signing secret', () => {
    const now = 1_000_000;
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/workspace',
      now,
      ttlSeconds: 30,
    });
    assert.throws(
      () =>
        verifyInternalUserContext(Buffer.alloc(32, 0x99), token, {
          method: 'GET',
          path: '/v1/workspace',
          now: now + 1,
        }),
      InternalContextError,
    );
  });

  it('rejects malformed tokens fail-closed', () => {
    for (const bad of ['', 'a.b', 'x.y.z.w', 'not-a-token']) {
      assert.throws(
        () =>
          verifyInternalUserContext(SECRET, bad, { method: 'GET', path: '/v1/workspace', now: 1 }),
        InternalContextError,
      );
    }
  });
});
