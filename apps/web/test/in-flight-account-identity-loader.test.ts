import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createInFlightAccountIdentityLoader } from '../src/server/auth/in-flight-account-identity-loader.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('in-flight account identity loader', () => {
  it('shares concurrent reads for one user without caching the settled identity', async () => {
    const first = deferred<{ userId: string; username: string } | undefined>();
    let sourceCalls = 0;
    const load = createInFlightAccountIdentityLoader(async (userId) => {
      sourceCalls += 1;
      if (sourceCalls === 1) return first.promise;
      return { userId, username: 'owner' };
    });

    const firstLoad = load('11111111-1111-4111-8111-111111111111');
    const concurrentLoad = load('11111111-1111-4111-8111-111111111111');
    assert.equal(sourceCalls, 1);

    first.resolve({ userId: '11111111-1111-4111-8111-111111111111', username: 'owner' });
    assert.deepEqual(await Promise.all([firstLoad, concurrentLoad]), [
      { userId: '11111111-1111-4111-8111-111111111111', username: 'owner' },
      { userId: '11111111-1111-4111-8111-111111111111', username: 'owner' },
    ]);

    await load('11111111-1111-4111-8111-111111111111');
    assert.equal(sourceCalls, 2);
  });
});
