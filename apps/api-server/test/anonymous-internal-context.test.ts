import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  requireRequestScope,
  requireRequestUserScope,
  runWithRequestScope,
} from '../src/read/internal-context-store.ts';
import {
  ANONYMOUS_SUBJECT,
  InternalContextError,
  signAnonymousInternalContext,
  signInternalUserContext,
  verifyInternalContext,
  verifyInternalUserContext,
} from '@stock-insight/contracts/internal-context';

const SECRET = Buffer.alloc(32, 7);
const USER_ID = '11111111-2222-4333-8444-555555555555';
const NOW = 1_800_000_000;

describe('anonymous vs user internal context separation', () => {
  it('verifies an anonymous context and reports the anonymous kind', () => {
    const token = signAnonymousInternalContext(SECRET, {
      method: 'POST',
      path: '/v1/auth/authenticate',
      now: NOW,
      ttlSeconds: 30,
    });
    const scope = verifyInternalContext(SECRET, token, {
      method: 'POST',
      path: '/v1/auth/authenticate',
      now: NOW + 1,
    });
    assert.equal(scope.kind, 'anonymous');
    assert.equal(token.split('.')[0], ANONYMOUS_SUBJECT);
  });

  // The core containment property: holding an anonymous token must never grant
  // a user scope, even at the exact same method+path and inside the TTL window.
  it('refuses to resolve an anonymous context to a user scope', () => {
    const token = signAnonymousInternalContext(SECRET, {
      method: 'GET',
      path: '/v1/stocks',
      now: NOW,
      ttlSeconds: 30,
    });
    assert.throws(
      () =>
        verifyInternalUserContext(SECRET, token, {
          method: 'GET',
          path: '/v1/stocks',
          now: NOW + 1,
        }),
      InternalContextError,
    );
  });

  // MAC-domain separation: a user token's signature must not validate when it is
  // reinterpreted as an anonymous token, and vice versa.
  it('does not accept a user MAC under the anonymous subject', () => {
    const userToken = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'POST',
      path: '/v1/auth/authenticate',
      now: NOW,
      ttlSeconds: 30,
    });
    const [, iat, exp, mac] = userToken.split('.') as [string, string, string, string];
    const forged = `${ANONYMOUS_SUBJECT}.${iat}.${exp}.${mac}`;
    assert.throws(
      () =>
        verifyInternalContext(SECRET, forged, {
          method: 'POST',
          path: '/v1/auth/authenticate',
          now: NOW + 1,
        }),
      InternalContextError,
    );
  });

  it('does not accept an anonymous MAC under a uuid subject', () => {
    const anonToken = signAnonymousInternalContext(SECRET, {
      method: 'GET',
      path: '/v1/stocks',
      now: NOW,
      ttlSeconds: 30,
    });
    const [, iat, exp, mac] = anonToken.split('.') as [string, string, string, string];
    const forged = `${USER_ID}.${iat}.${exp}.${mac}`;
    assert.throws(
      () =>
        verifyInternalContext(SECRET, forged, { method: 'GET', path: '/v1/stocks', now: NOW + 1 }),
      InternalContextError,
    );
  });

  it('still binds anonymous contexts to method + path and the TTL window', () => {
    const token = signAnonymousInternalContext(SECRET, {
      method: 'POST',
      path: '/v1/auth/enroll',
      now: NOW,
      ttlSeconds: 30,
    });
    assert.throws(
      () =>
        verifyInternalContext(SECRET, token, {
          method: 'POST',
          path: '/v1/auth/authenticate',
          now: NOW + 1,
        }),
      InternalContextError,
    );
    assert.throws(
      () =>
        verifyInternalContext(SECRET, token, {
          method: 'GET',
          path: '/v1/auth/enroll',
          now: NOW + 1,
        }),
      InternalContextError,
    );
    assert.throws(
      () =>
        verifyInternalContext(SECRET, token, {
          method: 'POST',
          path: '/v1/auth/enroll',
          now: NOW + 31,
        }),
      InternalContextError,
    );
  });

  it('rejects an anonymous context signed with a different secret', () => {
    const token = signAnonymousInternalContext(SECRET, {
      method: 'POST',
      path: '/v1/auth/enroll',
      now: NOW,
      ttlSeconds: 30,
    });
    assert.throws(
      () =>
        verifyInternalContext(Buffer.alloc(32, 9), token, {
          method: 'POST',
          path: '/v1/auth/enroll',
          now: NOW + 1,
        }),
      InternalContextError,
    );
  });
});

describe('request scope store', () => {
  it('exposes the anonymous scope but denies a user scope', () => {
    runWithRequestScope({ kind: 'anonymous' }, () => {
      assert.equal(requireRequestScope().kind, 'anonymous');
      assert.throws(() => requireRequestUserScope(), InternalContextError);
    });
  });

  it('exposes both kinds for a user scope', () => {
    runWithRequestScope({ kind: 'user', userId: USER_ID }, () => {
      assert.equal(requireRequestScope().kind, 'user');
      assert.equal(requireRequestUserScope().userId, USER_ID);
    });
  });

  it('fails closed with no scope bound', () => {
    assert.throws(() => requireRequestScope(), InternalContextError);
    assert.throws(() => requireRequestUserScope(), InternalContextError);
  });
});
