import assert from 'node:assert/strict';
import test from 'node:test';

import { parseApiServerEnv } from '../dist/index.js';

test('defaults: host 127.0.0.1, port 6200, no db', () => {
  const env = parseApiServerEnv({});
  assert.equal(env.host, '127.0.0.1');
  assert.equal(env.port, 6200);
  assert.equal(env.databaseReadUrl, undefined);
  assert.equal(env.userId, undefined);
  assert.equal(env.databaseWriteUrl, undefined);
  assert.equal(env.liveDatabaseExpected, false);
});

test('a dedicated writer URL always forces live database verification', () => {
  const env = parseApiServerEnv({
    DATABASE_READ_URL: 'postgresql://reader@127.0.0.1:55432/research_app',
    DATABASE_WRITE_URL: 'postgresql://writer@127.0.0.1:55432/research_app',
    STOCK_INSIGHT_LIVE_DATABASE_EXPECTED: 'false',
  });
  assert.equal(env.databaseWriteUrl, 'postgresql://writer@127.0.0.1:55432/research_app');
  assert.equal(env.liveDatabaseExpected, true);
  assert.equal(
    parseApiServerEnv({
      DATABASE_READ_URL: 'postgresql://reader@127.0.0.1:55432/research_app',
      DATABASE_WRITE_URL: 'postgresql://writer@127.0.0.1:55432/research_app',
    }).liveDatabaseExpected,
    true,
  );
  assert.throws(
    () => parseApiServerEnv({ STOCK_INSIGHT_LIVE_DATABASE_EXPECTED: 'TRUE' }),
    /Invalid api-server environment/,
  );
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

test('reads an absolute internal-context secret file path', () => {
  const env = parseApiServerEnv({
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: '/run/secrets/stock-insight-internal-context',
  });
  assert.equal(env.internalContextSecretFile, '/run/secrets/stock-insight-internal-context');
});

test('rejects a relative internal-context secret file path', () => {
  assert.throws(
    () => parseApiServerEnv({ STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: 'relative/secret' }),
    /Invalid api-server environment/,
  );
});

test('treats a blank internal-context secret file path as unset', () => {
  const env = parseApiServerEnv({ STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: '   ' });
  assert.equal(env.internalContextSecretFile, undefined);
});
