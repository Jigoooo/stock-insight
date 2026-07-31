import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareRemoteDev, spawnRemoteDev, superviseChild } from './dev-remote.mjs';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('prepares a loopback-only read-only BFF against the protected remote brain', async (t) => {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-remote-dev-'));
  t.after(() => rm(homeDir, { recursive: true, force: true }));

  const secretDir = join(homeDir, '.hermes', 'secrets');
  await mkdir(secretDir, { recursive: true, mode: 0o700 });
  const accessFile = join(secretDir, 'insight-api-access.env');
  const internalSecretFile = join(secretDir, 'stock-insight-internal-context.secret');
  await writeFile(
    accessFile,
    'API_DEV_CLIENT_ID=test-client-id\nAPI_DEV_CLIENT_SECRET=test-client-secret\n',
    { mode: 0o600 },
  );
  await writeFile(internalSecretFile, 'i'.repeat(48), { mode: 0o600 });

  const result = await prepareRemoteDev({
    homeDir,
    env: {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      DATABASE_URL: 'postgresql://must-not-survive',
      DATABASE_READ_URL: 'postgresql://must-not-survive',
      DATABASE_WRITE_URL: 'postgresql://must-not-survive',
      PGPASSWORD: 'must-not-survive',
      STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET: 'stale-inline-secret-that-must-not-survive',
      UNRELATED_DEVELOPER_TOKEN: 'must-not-survive',
      VITE_PORT: '6117',
    },
    platform: 'linux',
  });

  const sessionSecretFile = join(secretDir, 'stock-insight-dev-session.secret');
  const sessionSecret = (await readFile(sessionSecretFile, 'utf8')).trim();
  assert.ok(sessionSecret.length >= 32);
  assert.equal((await stat(sessionSecretFile)).mode & 0o777, 0o600);

  assert.equal(result.childEnv.STOCK_INSIGHT_BRAIN_URL, 'https://insight-api.jigooo.com');
  assert.equal(result.childEnv.STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_ID, 'test-client-id');
  assert.equal(result.childEnv.STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_SECRET, 'test-client-secret');
  assert.equal(result.childEnv.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE, internalSecretFile);
  assert.equal(result.childEnv.STOCK_INSIGHT_SESSION_SECRET_FILE, sessionSecretFile);
  assert.equal(result.childEnv.STOCK_INSIGHT_APP_ORIGIN, 'http://127.0.0.1:6117');
  assert.equal(result.childEnv.STOCK_INSIGHT_SIGNUP_ENABLED, 'false');
  assert.equal(result.childEnv.STOCK_INSIGHT_MUTATIONS_ENABLED, 'false');
  assert.equal(result.childEnv.STOCK_INSIGHT_REMOTE_READ_ONLY, 'true');
  assert.equal(result.childEnv.DATABASE_URL, undefined);
  assert.equal(result.childEnv.DATABASE_READ_URL, undefined);
  assert.equal(result.childEnv.DATABASE_WRITE_URL, undefined);
  assert.equal(result.childEnv.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET, undefined);
  assert.equal(result.childEnv.PGPASSWORD, undefined);
  assert.equal(result.childEnv.UNRELATED_DEVELOPER_TOKEN, undefined);
  assert.equal(result.childEnv.PATH, '/usr/local/bin:/usr/bin:/bin');
  assert.deepEqual(result.command, {
    executable: process.execPath,
    cwd: join(root, 'apps', 'web'),
    args: [
      join(root, 'apps', 'web', 'node_modules', 'vite', 'bin', 'vite.js'),
      '--mode',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      '6117',
      '--strictPort',
    ],
  });

  const fakeChild = new EventEmitter();
  const spawnCalls = [];
  assert.equal(
    spawnRemoteDev(result, (...args) => {
      spawnCalls.push(args);
      return fakeChild;
    }),
    fakeChild,
  );
  assert.equal(spawnCalls.length, 1);
  const [executable, args, options] = spawnCalls[0];
  assert.equal(executable, result.command.executable);
  assert.deepEqual(args, result.command.args);
  assert.equal(options.cwd, result.command.cwd);
  assert.equal(options.detached, true);
  assert.equal(options.env, result.childEnv);
  assert.equal(options.stdio, 'inherit');
});

test('rejects group/world-readable reusable remote credentials', async (t) => {
  const cases = [
    {
      insecureFile: 'insight-api-access.env',
      expectedLabel: 'Cloudflare Access environment file',
    },
    {
      insecureFile: 'stock-insight-internal-context.secret',
      expectedLabel: 'Internal context secret',
    },
  ];

  for (const { insecureFile, expectedLabel } of cases) {
    const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-remote-dev-mode-'));
    t.after(() => rm(homeDir, { recursive: true, force: true }));

    const secretDir = join(homeDir, '.hermes', 'secrets');
    const accessFile = join(secretDir, 'insight-api-access.env');
    const internalSecretFile = join(secretDir, 'stock-insight-internal-context.secret');
    await mkdir(secretDir, { recursive: true, mode: 0o700 });
    await writeFile(
      accessFile,
      'API_DEV_CLIENT_ID=test-client-id\nAPI_DEV_CLIENT_SECRET=test-client-secret\n',
      { mode: 0o600 },
    );
    await writeFile(internalSecretFile, 'i'.repeat(48), { mode: 0o600 });
    await chmod(join(secretDir, insecureFile), 0o644);

    await assert.rejects(
      prepareRemoteDev({ homeDir, env: {}, platform: 'linux' }),
      new RegExp(`${expectedLabel} must have mode 0600 or stricter`),
    );
  }
});

test('publishes remote development commands and secret locations', async () => {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const readme = await readFile(join(root, 'README.md'), 'utf8');

  assert.equal(packageJson.scripts['dev:remote'], 'node scripts/dev-remote.mjs');
  assert.equal(packageJson.scripts['dev:remote:check'], 'node scripts/dev-remote.mjs --check');
  assert.equal(packageJson.scripts['test:dev:remote'], 'node --test scripts/dev-remote.test.mjs');
  assert.match(readme, /pnpm dev:remote/);
  assert.match(readme, /WSL\/Linux/);
  assert.match(readme, /~\/\.hermes\/secrets\/insight-api-access\.env/);
  assert.match(readme, /~\/\.hermes\/secrets\/stock-insight-internal-context\.secret/);
  assert.match(readme, /~\/\.hermes\/secrets\/stock-insight-dev-session\.secret/);
});

test('rejects a brain origin that could receive the protected credentials', async (t) => {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-remote-dev-origin-'));
  t.after(() => rm(homeDir, { recursive: true, force: true }));

  const secretDir = join(homeDir, '.hermes', 'secrets');
  await mkdir(secretDir, { recursive: true, mode: 0o700 });
  await writeFile(
    join(secretDir, 'insight-api-access.env'),
    'API_DEV_CLIENT_ID=test-client-id\nAPI_DEV_CLIENT_SECRET=test-client-secret\n',
    { mode: 0o600 },
  );
  await writeFile(join(secretDir, 'stock-insight-internal-context.secret'), 'i'.repeat(48), {
    mode: 0o600,
  });

  await assert.rejects(
    prepareRemoteDev({
      homeDir,
      env: { STOCK_INSIGHT_BRAIN_URL: 'https://credential-sink.example' },
      platform: 'linux',
    }),
    /must equal https:\/\/insight-api\.jigooo\.com/,
  );
});

test('terminates the child process group and preserves the signal exit status', () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.pid = 4321;
  child.kill = () => assert.fail('must terminate the POSIX process group, not only the pnpm child');
  const signals = [];
  let forceKill;
  const timer = { unref: () => undefined };

  superviseChild(child, parent, {
    platform: 'linux',
    killProcess: (pid, signal) => {
      signals.push([pid, signal]);
      return true;
    },
    schedule: (callback, delay) => {
      assert.equal(delay, 3_000);
      forceKill = callback;
      return timer;
    },
  });
  parent.emit('SIGTERM');
  assert.deepEqual(signals, [[-4321, 'SIGTERM']]);

  forceKill();
  assert.deepEqual(signals, [
    [-4321, 'SIGTERM'],
    [-4321, 'SIGKILL'],
  ]);

  child.emit('exit', null, 'SIGTERM');
  assert.equal(parent.exitCode, 143);
  assert.equal(parent.listenerCount('SIGTERM'), 0);
});

test('cancels the force-kill timer after the process group has exited', () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.pid = 8765;
  child.kill = () => assert.fail('must use the POSIX process group');
  const signals = [];
  const timer = {};
  let cancelledTimer;

  superviseChild(child, parent, {
    platform: 'linux',
    killProcess: (pid, signal) => {
      signals.push([pid, signal]);
      return true;
    },
    schedule: (_callback, delay) => {
      assert.equal(delay, 3_000);
      return timer;
    },
    cancelSchedule: (scheduledTimer) => {
      cancelledTimer = scheduledTimer;
    },
  });

  parent.emit('SIGTERM');
  child.emit('exit', null, 'SIGTERM');
  assert.deepEqual(signals, [[-8765, 'SIGTERM']]);
  assert.equal(cancelledTimer, timer);
  assert.equal(parent.exitCode, 143);
});

test('requires WSL instead of native Windows for permission and process guarantees', async () => {
  await assert.rejects(
    prepareRemoteDev({ homeDir: 'C:\\Users\\developer', env: {}, platform: 'win32' }),
    /Native Windows is not supported; run this command inside WSL/,
  );
});
