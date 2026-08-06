import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrap } from '../dist/main.js';

function createAppFixture() {
  const calls: string[] = [];
  const app = {
    get: () => ({ host: '127.0.0.1', port: 6200, liveDatabaseExpected: true }),
    listen: async () => calls.push('listen'),
    close: async () => calls.push('close'),
  };
  return { app, calls };
}

test('bootstrap closes the Nest application when the live database guard fails', async () => {
  const { app, calls } = createAppFixture();

  await assert.rejects(
    bootstrap({
      createApplication: async () => app,
      verifyDatabase: async () => {
        throw new Error('wrong database identity');
      },
      primeDatabase: async () => calls.push('prime'),
    }),
    /wrong database identity/,
  );

  assert.deepEqual(calls, ['close']);
});

test('bootstrap primes the read pool after the live database guard and before listening', async () => {
  const { app, calls } = createAppFixture();

  await bootstrap({
    createApplication: async () => app,
    verifyDatabase: async () => calls.push('verify'),
    primeDatabase: async () => calls.push('prime'),
  });

  assert.deepEqual(calls, ['verify', 'prime', 'listen']);
});

test('bootstrap closes the Nest application when read pool priming fails', async () => {
  const { app, calls } = createAppFixture();

  await assert.rejects(
    bootstrap({
      createApplication: async () => app,
      verifyDatabase: async () => calls.push('verify'),
      primeDatabase: async () => {
        calls.push('prime');
        throw new Error('read pool unavailable');
      },
    }),
    /read pool unavailable/,
  );

  assert.deepEqual(calls, ['verify', 'prime', 'close']);
});
