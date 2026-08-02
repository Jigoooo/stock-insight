import assert from 'node:assert/strict';
import test from 'node:test';

import { buildServerProcess, selectServerEnvironment } from './e2e-server-launcher.mjs';

test('server launcher strips ambient database credentials from the web child', () => {
  const selected = selectServerEnvironment('web-dev', {
    HOME: '/home/test',
    PATH: '/usr/bin',
    PORT: '18302',
    PLAYWRIGHT_E2E: '1',
    VITE_ENABLE_UI_LAB: '1',
    STOCK_INSIGHT_BRAIN_URL: 'http://127.0.0.1:18301',
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET: 'ephemeral-secret',
    DATABASE_READ_URL: 'postgresql://must-not-pass',
    DATABASE_WRITE_URL: 'postgresql://must-not-pass',
    PGPASSFILE: '/must/not/pass',
    NODE_OPTIONS: '--require=/tmp/evil.cjs',
  });

  assert.equal(selected.DATABASE_READ_URL, undefined);
  assert.equal(selected.DATABASE_WRITE_URL, undefined);
  assert.equal(selected.PGPASSFILE, undefined);
  assert.equal(selected.NODE_OPTIONS, undefined);
  assert.equal(selected.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET, 'ephemeral-secret');
  assert.equal(selected.VITE_ENABLE_UI_LAB, '1');
});

test('server launcher keeps the UI Lab flag out of the production web child', () => {
  const selected = selectServerEnvironment('web-production', {
    PATH: '/usr/bin',
    NODE_ENV: 'production',
    PORT: '18302',
    VITE_ENABLE_UI_LAB: '1',
  });

  assert.equal(selected.NODE_ENV, 'production');
  assert.equal(selected.VITE_ENABLE_UI_LAB, undefined);
});

test('server launcher keeps secrets out of child argv', () => {
  const secret = "qa-secret'; touch /tmp/e2e-argv-injected";
  const spec = buildServerProcess('api', {
    PATH: '/usr/bin',
    DATABASE_READ_URL: `postgresql://qa:${secret}@127.0.0.1/stock_insight_e2e_deadbeef`,
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: '/home/test/internal-context.secret',
    PORT: '18301',
  });

  assert.equal(spec.command, process.execPath);
  assert.deepEqual(spec.args, ['apps/api-server/dist/main.js']);
  assert.doesNotMatch(spec.args.join(' '), /qa-secret|postgresql|internal-context/);
  assert.match(spec.env.DATABASE_READ_URL, /qa-secret/);
  assert.equal(spec.env.HOME, undefined);
  assert.equal(spec.env.USER, undefined);
  assert.equal(spec.env.LOGNAME, undefined);
});

test('web launcher passes port as a fixed argv element, not a shell fragment', () => {
  const spec = buildServerProcess('web-dev', {
    PATH: '/usr/bin',
    PORT: '18302',
    PLAYWRIGHT_E2E: '1',
  });
  assert.equal(spec.command, 'pnpm');
  assert.equal(spec.args[spec.args.indexOf('--port') + 1], '18302');
});
