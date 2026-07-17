import assert from 'node:assert/strict';
import test from 'node:test';

import { parseApiServerEnv } from '../dist/index.js';

test('defaults: host 127.0.0.1, port 6200, no db', () => {
  const env = parseApiServerEnv({});
  assert.equal(env.host, '127.0.0.1');
  assert.equal(env.port, 6200);
  assert.equal(env.databaseReadUrl, undefined);
  assert.equal(env.userId, undefined);
});

test('DATABASE_READ_URL falls back to DATABASE_URL', () => {
  const env = parseApiServerEnv({
    DATABASE_URL: 'postgresql://research_app@127.0.0.1:55432/research_app',
  });
  assert.equal(env.databaseReadUrl, 'postgresql://research_app@127.0.0.1:55432/research_app');
});

test('DATABASE_READ_URL wins over DATABASE_URL when both set', () => {
  const env = parseApiServerEnv({
    DATABASE_URL: 'postgresql://write@127.0.0.1:55432/research_app',
    DATABASE_READ_URL: 'postgresql://read@127.0.0.1:55432/research_app',
  });
  assert.equal(env.databaseReadUrl, 'postgresql://read@127.0.0.1:55432/research_app');
});

test('empty-string url is treated as unset', () => {
  const env = parseApiServerEnv({ DATABASE_URL: '   ' });
  assert.equal(env.databaseReadUrl, undefined);
});

test('invalid PORT rejects', () => {
  assert.throws(() => parseApiServerEnv({ PORT: 'not-a-port' }), /Invalid api-server environment/);
});

test('invalid STOCK_INSIGHT_USER_ID rejects', () => {
  assert.throws(
    () => parseApiServerEnv({ STOCK_INSIGHT_USER_ID: 'not-a-uuid' }),
    /Invalid api-server environment/,
  );
});
