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
    }),
    /wrong database identity/,
  );

  assert.deepEqual(calls, ['close']);
});

test('bootstrap listens only after the live database guard succeeds', async () => {
  const { app, calls } = createAppFixture();

  await bootstrap({
    createApplication: async () => app,
    verifyDatabase: async () => calls.push('verify'),
  });

  assert.deepEqual(calls, ['verify', 'listen']);
});
