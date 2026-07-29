// Regression guard for the internal-context scope binding.
//
// HISTORY (why this file exists):
// The scope used to be bound inside a Nest INTERCEPTOR. Two defects stacked:
//   1. the interceptor returned a bare `{ subscribe }` object cast to Observable,
//      which rxjs rejects with "invalid object where a stream was expected";
//   2. more fundamentally, Nest's InterceptorsConsumer wraps the handler with
//      AsyncResource.bind BEFORE interceptors run, so an AsyncLocalStorage scope
//      opened in an interceptor is NOT visible in the controller body.
// Together these made every controller-backed route answer HTTP 500, while
// /health and /v1/meta (which bypass enforcement) kept returning 200 — hiding
// the breakage from any liveness check.
//
// The fix moves enforcement to a GUARD, which runs early enough in the async
// chain that enterWith() is captured by Nest's later context snapshot.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  requireRequestUserScope,
  runWithRequestUserScope,
} from '../src/read/internal-context-store.ts';
import { createInternalContextGuard } from '../src/read/internal-context.guard.ts';
import { signInternalUserContext } from '../src/read/internal-user-context.ts';

const SECRET = Buffer.alloc(32, 5);
const USER_ID = '11111111-2222-4333-8444-555555555555';

function contextFor(method: string, url: string, token?: string) {
  const path = url.split('?')[0] ?? url;
  const headers: Record<string, string> = {};
  const resolved =
    token ??
    signInternalUserContext(SECRET, {
      userId: USER_ID,
      method,
      path,
      now: Math.floor(Date.now() / 1000),
      ttlSeconds: 60,
    });
  if (resolved !== '') headers['x-internal-user-context'] = resolved;
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, url, headers }) }),
  } as never;
}

describe('internal context guard', () => {
  const guard = createInternalContextGuard({ secret: SECRET });

  // THE regression: the scope must be readable from the async continuation that
  // Nest resumes the controller on, not just synchronously inside the guard.
  it('binds a scope that survives across async boundaries', async () => {
    await runWithRequestUserScope({ userId: 'placeholder' }, async () => {
      assert.equal(guard.canActivate(contextFor('GET', '/v1/stocks')), true);
      await new Promise((resolve) => setImmediate(resolve));
      await Promise.resolve();
      assert.equal(requireRequestUserScope().userId, USER_ID);
    });
  });

  it('accepts a query string without breaking path binding', () => {
    assert.equal(guard.canActivate(contextFor('GET', '/v1/stocks?market=KR')), true);
  });

  it('rejects a missing context with 401', () => {
    assert.throws(
      () => guard.canActivate(contextFor('GET', '/v1/stocks', '')),
      (error: { getStatus?: () => number }) => error.getStatus?.() === 401,
    );
  });

  it('rejects a context replayed on another path with 401', () => {
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/stocks',
      now: Math.floor(Date.now() / 1000),
      ttlSeconds: 60,
    });
    assert.throws(
      () => guard.canActivate(contextFor('GET', '/v1/dashboard/today', token)),
      (error: { getStatus?: () => number }) => error.getStatus?.() === 401,
    );
  });

  it('rejects a wrong signing secret with 401', () => {
    const foreign = signInternalUserContext(Buffer.alloc(32, 9), {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/stocks',
      now: Math.floor(Date.now() / 1000),
      ttlSeconds: 60,
    });
    assert.throws(
      () => guard.canActivate(contextFor('GET', '/v1/stocks', foreign)),
      (error: { getStatus?: () => number }) => error.getStatus?.() === 401,
    );
  });

  it('lets public paths through without a context', () => {
    const publicGuard = createInternalContextGuard({
      secret: SECRET,
      publicPaths: ['/health', '/v1/meta'],
    });
    assert.equal(publicGuard.canActivate(contextFor('GET', '/health', '')), true);
    assert.equal(publicGuard.canActivate(contextFor('GET', '/v1/meta', '')), true);
    // ...but a non-public path still needs one.
    assert.throws(() => publicGuard.canActivate(contextFor('GET', '/v1/stocks', '')));
  });
});
