import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('authenticated session cache', () => {
  it('coalesces concurrent checks and reuses one authenticated session', async () => {
    const sessionCacheModule =
      await import('../src/pages/auth/model/authenticated-session-cache.ts').catch(() => null);

    assert.ok(sessionCacheModule, 'authenticated session cache module should exist');

    const cache = new sessionCacheModule.AuthenticatedSessionCache<{ userId: string }>();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { userId: 'user-1' };
    };

    const [first, second] = await Promise.all([cache.load(load), cache.load(load)]);
    const third = await cache.load(load);

    assert.deepEqual(first, { userId: 'user-1' });
    assert.strictEqual(second, first);
    assert.strictEqual(third, first);
    assert.equal(calls, 1);
  });

  it('does not retain an anonymous result and clears an authenticated result', async () => {
    const sessionCacheModule =
      await import('../src/pages/auth/model/authenticated-session-cache.ts').catch(() => null);

    assert.ok(sessionCacheModule, 'authenticated session cache module should exist');

    const cache = new sessionCacheModule.AuthenticatedSessionCache<{ userId: string }>();
    let session: { userId: string } | null = null;
    let calls = 0;
    const load = async () => {
      calls += 1;
      return session;
    };

    assert.equal(await cache.load(load), null);
    session = { userId: 'user-2' };
    assert.deepEqual(await cache.load(load), { userId: 'user-2' });
    assert.equal(calls, 2);

    cache.clear();
    session = { userId: 'user-3' };
    assert.deepEqual(await cache.load(load), { userId: 'user-3' });
    assert.equal(calls, 3);
  });

  it('rejects a session result superseded while its check is still in flight', async () => {
    const sessionCacheModule =
      await import('../src/pages/auth/model/authenticated-session-cache.ts');
    const cache = new sessionCacheModule.AuthenticatedSessionCache<{ userId: string }>();
    let resolveSession: ((value: { userId: string }) => void) | undefined;
    const staleLoad = cache.load(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }),
    );

    cache.clear();
    resolveSession?.({ userId: 'stale-user' });

    await assert.rejects(staleLoad, { name: 'AbortError' });
    assert.deepEqual(await cache.load(async () => ({ userId: 'fresh-user' })), {
      userId: 'fresh-user',
    });
  });

  it('adopts a freshly authenticated session without loading it again', async () => {
    const { AuthenticatedSessionCache } =
      await import('../src/pages/auth/model/authenticated-session-cache.ts');
    const cache = new AuthenticatedSessionCache<{ userId: string }>();
    let loadCalls = 0;

    cache.set({ userId: 'fresh-login' });
    const session = await cache.load(async () => {
      loadCalls += 1;
      return { userId: 'unexpected-reload' };
    });

    assert.deepEqual(session, { userId: 'fresh-login' });
    assert.equal(loadCalls, 0);
  });
});
