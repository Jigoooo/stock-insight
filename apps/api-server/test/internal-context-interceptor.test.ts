import type { ExecutionContext } from '@nestjs/common';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { requireRequestUserScope } from '../src/read/internal-context-store.ts';
import {
  INTERNAL_CONTEXT_HEADER,
  createInternalContextInterceptor,
} from '../src/read/internal-context.interceptor.ts';
import { signInternalUserContext } from '../src/read/internal-user-context.ts';

const SECRET = Buffer.alloc(32, 0x51);
const USER_ID = '123e4567-e89b-42d3-a456-426614174000';

type FakeRequest = { method: string; url: string; headers: Record<string, string | undefined> };

function fakeExecutionContext(request: FakeRequest) {
  return {
    switchToHttp: () => ({
      getRequest: <T>() => request as unknown as T,
    }),
  } as unknown as ExecutionContext;
}

function callHandler(fn: () => unknown) {
  // Minimal Observable-like: our interceptor wraps next.handle() inside the
  // async-scope run, so we only need handle() to invoke the controller work.
  return { handle: () => ({ subscribe: (obs: { next: (v: unknown) => void }) => obs.next(fn()) }) };
}

describe('api-server internal-context interceptor', () => {
  const nowSeconds = 1_000_000;
  const clock = () => nowSeconds * 1000;

  it('binds the verified scope for a correctly signed context', async () => {
    const interceptor = createInternalContextInterceptor({ secret: SECRET, clock });
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/workspace',
      now: nowSeconds,
      ttlSeconds: 30,
    });
    const request: FakeRequest = {
      method: 'GET',
      url: '/v1/workspace',
      headers: { [INTERNAL_CONTEXT_HEADER]: token },
    };
    let seen: string | undefined;
    const observable = interceptor.intercept(
      fakeExecutionContext(request),
      callHandler(() => {
        seen = requireRequestUserScope().userId;
        return 'ok';
      }),
    );
    await new Promise<void>((resolve) => {
      observable.subscribe({ next: () => resolve() });
    });
    assert.equal(seen, USER_ID);
  });

  it('rejects a request with no context header (401 fail-closed)', () => {
    const interceptor = createInternalContextInterceptor({ secret: SECRET, clock });
    const request: FakeRequest = { method: 'GET', url: '/v1/workspace', headers: {} };
    assert.throws(
      () =>
        interceptor.intercept(
          fakeExecutionContext(request),
          callHandler(() => 'x'),
        ),
      (error: unknown) => {
        const status = (error as { getStatus?: () => number }).getStatus?.();
        assert.equal(status, 401);
        return true;
      },
    );
  });

  it('rejects a context replayed on a different path', () => {
    const interceptor = createInternalContextInterceptor({ secret: SECRET, clock });
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/workspace',
      now: nowSeconds,
      ttlSeconds: 30,
    });
    const request: FakeRequest = {
      method: 'GET',
      url: '/v1/history',
      headers: { [INTERNAL_CONTEXT_HEADER]: token },
    };
    assert.throws(
      () =>
        interceptor.intercept(
          fakeExecutionContext(request),
          callHandler(() => 'x'),
        ),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 401);
        return true;
      },
    );
  });

  it('strips the query string before binding the signed path', async () => {
    const interceptor = createInternalContextInterceptor({ secret: SECRET, clock });
    const token = signInternalUserContext(SECRET, {
      userId: USER_ID,
      method: 'GET',
      path: '/v1/feed',
      now: nowSeconds,
      ttlSeconds: 30,
    });
    const request: FakeRequest = {
      method: 'GET',
      url: '/v1/feed?lane=for_you&limit=24',
      headers: { [INTERNAL_CONTEXT_HEADER]: token },
    };
    let seen: string | undefined;
    const observable = interceptor.intercept(
      fakeExecutionContext(request),
      callHandler(() => {
        seen = requireRequestUserScope().userId;
        return 'ok';
      }),
    );
    await new Promise<void>((resolve) => {
      observable.subscribe({ next: () => resolve() });
    });
    assert.equal(seen, USER_ID);
  });
});
