import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  prepareLiveDev,
  probePostgresServer,
  captureDarwinProcessIdentity,
  spawnLiveApi,
  spawnLiveTunnel,
  spawnLiveWeb,
  startLiveDev,
  superviseLiveDev,
  verifyDarwinTcpListenerOwnedByProcessGroup,
  verifyTcpListenerOwnedByProcessGroup,
  waitForPostgresTunnel,
  waitForTcpPort,
} from './dev-live.mjs';

async function createSecretFixture() {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-dev-live-'));
  const secretDir = join(homeDir, '.hermes', 'secrets', 'stock-insight-live-dev');
  await import('node:fs/promises').then(({ mkdir }) =>
    mkdir(secretDir, { recursive: true, mode: 0o700 }),
  );
  await writeFile(
    join(secretDir, 'pgpass'),
    [
      '127.0.0.1:*:research_app:stock_insight_app_reader:read',
      '127.0.0.1:*:research_app:stock_insight_app_writer:write',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  await writeFile(join(secretDir, 'stock-insight-internal-context.secret'), `${'i'.repeat(48)}\n`, {
    mode: 0o600,
  });
  await writeFile(join(secretDir, 'stock-insight-session.secret'), `${'s'.repeat(48)}\n`, {
    mode: 0o600,
  });
  return { homeDir, secretDir };
}

test('prepareLiveDev builds a password-free local tunnel environment for the existing production roles', async () => {
  const { homeDir, secretDir } = await createSecretFixture();
  const nodeExecutable = join(homeDir, '.nvm', 'versions', 'node', 'test', 'bin', 'node');
  const prepared = await prepareLiveDev({
    homeDir,
    nodeExecutable,
    platform: 'linux',
    env: {
      HOME: homeDir,
      PATH: '/usr/bin',
      DATABASE_READ_URL: 'postgresql://must-not-pass:secret@elsewhere/db',
      DATABASE_WRITE_URL: 'postgresql://must-not-pass:secret@elsewhere/db',
      CLOUDFLARE_TUNNEL_TOKEN: 'must-not-pass',
      STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_SECRET: 'must-not-pass',
    },
    resolveCommand: (name) => `/usr/bin/${name}`,
  });

  assert.equal(prepared.tunnelCommand.executable, '/usr/bin/bwrap');
  assert.ok(prepared.tunnelCommand.args.includes('/usr/bin/cloudflared'));
  assert.ok(prepared.tunnelCommand.args.includes('insight-db.jigooo.com'));
  assert.ok(prepared.tunnelCommand.args.includes('127.0.0.1:55432'));
  assert.ok(!prepared.tunnelCommand.args.includes(join(homeDir, '.hermes', 'secrets')));
  assert.equal(prepared.tunnelEnv.HOME, '/tmp/stock-insight-live-tunnel-home');
  assert.equal(
    prepared.apiEnv.DATABASE_READ_URL,
    'postgresql://stock_insight_app_reader@127.0.0.1:55432/research_app?application_name=stock-insight-live-dev-reader&options=-c+default_transaction_read_only%3Don',
  );
  assert.equal(
    prepared.apiEnv.DATABASE_WRITE_URL,
    'postgresql://stock_insight_app_writer@127.0.0.1:55432/research_app?application_name=stock-insight-live-dev-writer',
  );
  assert.notEqual(prepared.apiEnv.PGPASSFILE, join(secretDir, 'pgpass'));
  const runtimePgpass = await readFile(prepared.apiEnv.PGPASSFILE, 'utf8');
  assert.match(runtimePgpass, /^127\.0\.0\.1:55432:research_app:stock_insight_app_reader:/m);
  assert.match(runtimePgpass, /^127\.0\.0\.1:55432:research_app:stock_insight_app_writer:/m);
  assert.doesNotMatch(runtimePgpass, /^127\.0\.0\.1:\*:/m);
  assert.equal(
    prepared.apiEnv.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE,
    join(secretDir, 'stock-insight-internal-context.secret'),
  );
  assert.equal(
    prepared.webEnv.STOCK_INSIGHT_SESSION_SECRET_FILE,
    '/run/stock-insight-live-web/session.secret',
  );
  assert.equal(prepared.webEnv.STOCK_INSIGHT_BRAIN_URL, 'http://127.0.0.1:6200');
  assert.equal(prepared.webEnv.STOCK_INSIGHT_MUTATIONS_ENABLED, 'true');
  assert.equal(prepared.webEnv.STOCK_INSIGHT_REMOTE_READ_ONLY, 'false');
  assert.equal(prepared.apiEnv.STOCK_INSIGHT_LIVE_DATABASE_EXPECTED, 'true');
  assert.equal(prepared.webEnv.VITE_STOCK_INSIGHT_DATA_ENV, 'production-live');
  for (const childEnv of [prepared.tunnelEnv, prepared.apiEnv, prepared.webEnv]) {
    assert.equal(childEnv.CLOUDFLARE_TUNNEL_TOKEN, undefined);
    assert.equal(childEnv.STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_SECRET, undefined);
    assert.doesNotMatch(JSON.stringify(childEnv), /must-not-pass|:secret@|:read@|:write@/);
  }
  assert.equal(prepared.tunnelEnv.PGPASSFILE, undefined);
  assert.equal(prepared.webEnv.PGPASSFILE, undefined);
  assert.equal(prepared.webEnv.DATABASE_READ_URL, undefined);
  assert.equal(prepared.webEnv.DATABASE_WRITE_URL, undefined);
  assert.equal(prepared.apiEnv.STOCK_INSIGHT_SESSION_SECRET_FILE, undefined);
  assert.deepEqual(prepared.apiCommand.args, ['--filter', '@stock-insight/api-server', 'dev']);
  assert.equal(prepared.webCommand.executable, '/usr/bin/bwrap');
  for (const command of [prepared.tunnelCommand, prepared.webCommand]) {
    assert.equal(
      command.args.findIndex(
        (value, index) =>
          value === '/' &&
          command.args[index - 1] === '/' &&
          command.args[index - 2] === '--ro-bind',
      ),
      -1,
      'sandbox must not expose the host root filesystem',
    );
    assert.ok(command.args.includes('/usr'));
    assert.ok(command.args.includes('/lib'));
    assert.ok(!command.args.some((value) => String(value).startsWith('/mnt/')));
  }
  assert.ok(prepared.webCommand.args.includes(nodeExecutable));
  assert.ok(
    prepared.webCommand.args.some(
      (value) =>
        typeof value === 'string' && value.endsWith('/apps/web/node_modules/vite/bin/vite.js'),
    ),
  );
  assert.ok(!prepared.webCommand.args.includes('/usr/bin/pnpm'));
  const webRunMount = prepared.webCommand.args.findIndex(
    (value, index) => value === '/run' && prepared.webCommand.args[index - 1] === '--tmpfs',
  );
  assert.ok(webRunMount >= 0);
  assert.ok(!prepared.webCommand.args.includes(join(homeDir, '.hermes', 'secrets')));
  assert.ok(
    prepared.webCommand.args.includes('/run/stock-insight-live-web/internal-context.secret'),
  );
  assert.ok(prepared.webCommand.args.includes('/run/stock-insight-live-web/session.secret'));
  assert.ok(!prepared.webCommand.args.includes(join(secretDir, 'pgpass')));
  await prepared.cleanup();
});

test('prepareLiveDev builds Darwin-native tunnel, API, and web commands with child-specific secrets', async () => {
  const { homeDir, secretDir } = await createSecretFixture();
  const nodeExecutable = '/opt/homebrew/bin/node';
  const prepared = await prepareLiveDev({
    homeDir,
    nodeExecutable,
    platform: 'darwin',
    env: {
      HOME: homeDir,
      PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin',
      DATABASE_READ_URL: 'postgresql://must-not-pass:secret@elsewhere/db',
      DATABASE_WRITE_URL: 'postgresql://must-not-pass:secret@elsewhere/db',
    },
    resolveCommand: (name) =>
      ({
        cloudflared: '/opt/homebrew/bin/cloudflared',
        pnpm: '/opt/homebrew/bin/pnpm',
        lsof: '/usr/sbin/lsof',
        ps: '/bin/ps',
      })[name],
  });

  assert.equal(prepared.backend, 'darwin-native');
  assert.deepEqual(prepared.tunnelCommand, {
    executable: '/opt/homebrew/bin/cloudflared',
    args: ['access', 'tcp', '--hostname', 'insight-db.jigooo.com', '--url', '127.0.0.1:55432'],
  });
  assert.equal(prepared.webCommand.executable, nodeExecutable);
  assert.ok(prepared.webCommand.cwd.endsWith('/apps/web'));
  assert.ok(prepared.webCommand.args[0].endsWith('/apps/web/node_modules/vite/bin/vite.js'));
  assert.equal(
    prepared.webEnv.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE,
    join(secretDir, 'stock-insight-internal-context.secret'),
  );
  assert.equal(
    prepared.webEnv.STOCK_INSIGHT_SESSION_SECRET_FILE,
    join(secretDir, 'stock-insight-session.secret'),
  );
  for (const childEnv of [prepared.tunnelEnv, prepared.webEnv]) {
    assert.equal(childEnv.PGPASSFILE, undefined);
    assert.equal(childEnv.DATABASE_READ_URL, undefined);
    assert.equal(childEnv.DATABASE_WRITE_URL, undefined);
    assert.doesNotMatch(JSON.stringify(childEnv), /must-not-pass|:secret@/);
  }
  assert.equal(prepared.listenerTools.lsof, '/usr/sbin/lsof');
  assert.equal(prepared.listenerTools.ps, '/bin/ps');
  await prepared.cleanup();
});

test('prepareLiveDev binds every executable it launches into the sandbox mount namespace', async () => {
  const { homeDir } = await createSecretFixture();
  // node/cloudflared frequently live outside /usr (nvm, ~/.local, /opt). If the
  // launcher only re-binds executables under $HOME, bwrap starts with an empty
  // root for those paths and dies with "execvp ...: No such file or directory".
  const nodeExecutable = '/opt/custom-node/bin/node';
  const cloudflared = '/opt/cloudflare/bin/cloudflared';
  const prepared = await prepareLiveDev({
    homeDir,
    nodeExecutable,
    platform: 'linux',
    env: {},
    resolveCommand: (name) =>
      ({ bwrap: '/usr/bin/bwrap', cloudflared, pnpm: '/usr/bin/pnpm' })[name],
  });

  const boundReadOnly = (args, target) =>
    args.some(
      (value, index) =>
        value === target && args[index - 1] === target && args[index - 2] === '--ro-bind',
    );
  const createsParentChain = (args, target) => {
    const segments = target.split('/').filter(Boolean).slice(0, -1);
    let current = '';
    return segments.every((segment) => {
      current += `/${segment}`;
      const path = current;
      return args.some(
        (value, index) =>
          (value === path && args[index - 1] === '--dir') ||
          (value === path && args[index - 1] === '--ro-bind' && args[index - 2] === path),
      );
    });
  };

  assert.ok(
    boundReadOnly(prepared.webCommand.args, nodeExecutable),
    'web sandbox must ro-bind the node executable it execs',
  );
  assert.ok(
    createsParentChain(prepared.webCommand.args, nodeExecutable),
    'web sandbox must create every parent directory of the node executable',
  );
  assert.ok(
    boundReadOnly(prepared.tunnelCommand.args, cloudflared),
    'tunnel sandbox must ro-bind the cloudflared executable it execs',
  );
  assert.ok(
    createsParentChain(prepared.tunnelCommand.args, cloudflared),
    'tunnel sandbox must create every parent directory of the cloudflared executable',
  );
  await prepared.cleanup();
});

test('prepareLiveDev mounts the workspace read-only except the writable dev-server caches', async () => {
  const { homeDir } = await createSecretFixture();
  const prepared = await prepareLiveDev({
    homeDir,
    nodeExecutable: '/usr/bin/node',
    platform: 'linux',
    env: {},
    resolveCommand: (name) =>
      ({ bwrap: '/usr/bin/bwrap', cloudflared: '/usr/bin/cloudflared', pnpm: '/usr/bin/pnpm' })[
        name
      ],
  });
  const args = prepared.webCommand.args;
  const workspaceRoot = prepared.webCommand.cwd;
  // A sandbox that can rewrite its own source tree is not a boundary: a
  // compromised Vite/dependency could patch the API server or the launcher and
  // reach the production credentials on the next run.
  const writableWorkspaceBind = args.some(
    (value, index) =>
      value === workspaceRoot && args[index - 1] === workspaceRoot && args[index - 2] === '--bind',
  );
  assert.ok(!writableWorkspaceBind, 'workspace must not be bind-mounted writable into the sandbox');
  assert.ok(
    args.some(
      (value, index) =>
        value === workspaceRoot &&
        args[index - 1] === workspaceRoot &&
        args[index - 2] === '--ro-bind',
    ),
    'workspace must be mounted read-only',
  );
  // Vite still needs somewhere to write its optimise cache.
  assert.ok(
    args.some(
      (value, index) =>
        args[index - 1] === '--tmpfs' && String(value).includes('node_modules/.vite'),
    ),
    'the sandbox must provide a writable tmpfs for the Vite cache',
  );
  assert.ok(
    args.some(
      (value, index) =>
        args[index - 1] === '--tmpfs' && String(value).endsWith('node_modules/.vite-temp'),
    ),
    'the sandbox must provide a writable tmpfs for Vite config bundles',
  );
  await prepared.cleanup();
});

test('prepareLiveDev keeps the runtime pgpass under the private home, ignoring TMPDIR', async () => {
  const { homeDir } = await createSecretFixture();
  // os.tmpdir() honours TMPDIR. On WSL drvfs (/mnt/c) chmod is a no-op, so a
  // hostile or careless TMPDIR would write the production passwords into a
  // world-readable file — or into the repo, where the web sandbox can read it.
  const hostileTmp = await mkdtemp(join(tmpdir(), 'stock-insight-hostile-tmp-'));
  const prepared = await prepareLiveDev({
    homeDir,
    platform: 'linux',
    env: { TMPDIR: hostileTmp, TMP: hostileTmp, TEMP: hostileTmp },
    resolveCommand: (name) =>
      ({ bwrap: '/usr/bin/bwrap', cloudflared: '/usr/bin/cloudflared', pnpm: '/usr/bin/pnpm' })[
        name
      ],
  });
  assert.ok(
    prepared.runtimePgpassFile.startsWith(`${join(homeDir, '.hermes')}/`),
    `runtime pgpass must live under the private home, got ${prepared.runtimePgpassFile}`,
  );
  assert.ok(!prepared.runtimePgpassFile.startsWith(hostileTmp));
  const runtimeStat = await stat(prepared.runtimePgpassFile);
  assert.equal(runtimeStat.mode & 0o777, 0o600, 'runtime pgpass must be 0600 after creation');
  assert.equal(runtimeStat.uid, process.getuid?.());
  // TMPDIR must not be handed to children either: they would inherit the same
  // unsafe temp root for their own scratch files.
  for (const childEnv of [prepared.tunnelEnv, prepared.apiEnv, prepared.webEnv]) {
    assert.notEqual(childEnv.TMPDIR, hostileTmp);
  }
  await prepared.cleanup();
  await rm(hostileTmp, { recursive: true, force: true });
});

test('prepareLiveDev rejects a symlinked runtime directory chain', async () => {
  const { homeDir } = await createSecretFixture();
  const externalRuntime = await mkdtemp(join(tmpdir(), 'stock-insight-external-runtime-'));
  await symlink(externalRuntime, join(homeDir, '.hermes', 'run'), 'dir');

  await assert.rejects(
    prepareLiveDev({
      homeDir,
      platform: 'linux',
      env: {},
      resolveCommand: (name) => `/usr/bin/${name}`,
    }),
    /runtime directory chain.*symbolic link/,
  );

  await rm(homeDir, { recursive: true, force: true });
  await rm(externalRuntime, { recursive: true, force: true });
});

test('prepareLiveDev enforces strict ports, fixed hostname, and private secret modes', async () => {
  const { homeDir, secretDir } = await createSecretFixture();
  await assert.rejects(
    prepareLiveDev({
      homeDir,
      platform: 'linux',
      env: { STOCK_INSIGHT_DB_TUNNEL_PORT: '0' },
      resolveCommand: (name) => name,
    }),
    /STOCK_INSIGHT_DB_TUNNEL_PORT/,
  );
  await assert.rejects(
    prepareLiveDev({
      homeDir,
      platform: 'linux',
      env: { STOCK_INSIGHT_DB_TUNNEL_HOSTNAME: 'evil.example.com' },
      resolveCommand: (name) => name,
    }),
    /must equal insight-db\.jigooo\.com/,
  );
  await chmod(join(secretDir, 'pgpass'), 0o644);
  await assert.rejects(
    prepareLiveDev({
      homeDir,
      platform: 'linux',
      env: {},
      resolveCommand: (name) => name,
    }),
    /pgpass must have mode 0600 or stricter/,
  );
});

test('prepareLiveDev rejects a pgpass override outside the fixed live secret directory', async () => {
  const { homeDir } = await createSecretFixture();
  const override = join(homeDir, 'external.pgpass');
  await writeFile(
    override,
    [
      '127.0.0.1:*:research_app:stock_insight_app_reader:read',
      '127.0.0.1:*:research_app:stock_insight_app_writer:write',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );

  await assert.rejects(
    prepareLiveDev({
      homeDir,
      platform: 'linux',
      env: { PGPASSFILE: override },
      resolveCommand: (name) => `/usr/bin/${name}`,
    }),
    /PGPASSFILE must equal the fixed live secret path/,
  );
});

test('prepareLiveDev fails closed when cloudflared or pnpm is unavailable', async () => {
  const { homeDir } = await createSecretFixture();
  await assert.rejects(
    prepareLiveDev({
      homeDir,
      platform: 'linux',
      env: {},
      resolveCommand: (name) => (name === 'cloudflared' ? undefined : name),
    }),
    /cloudflared is required/,
  );
});

test('prepareLiveDev rejects symlinked secret files', async () => {
  const { homeDir, secretDir } = await createSecretFixture();
  const sessionSecret = join(secretDir, 'stock-insight-session.secret');
  const redirected = join(homeDir, 'redirected-session.secret');
  await writeFile(redirected, `${'s'.repeat(48)}\n`, { mode: 0o600 });
  await unlink(sessionSecret);
  await symlink(redirected, sessionSecret);

  await assert.rejects(
    prepareLiveDev({
      homeDir,
      platform: 'linux',
      env: {},
      resolveCommand: (name) => name,
    }),
    /symbolic link/,
  );
});

test('waitForTcpPort retries until the readiness probe succeeds', async () => {
  let calls = 0;
  const delays = [];
  await waitForTcpPort({
    host: '127.0.0.1',
    port: 55432,
    timeoutMs: 1000,
    probe: async () => {
      calls += 1;
      return calls >= 3;
    },
    now: (() => {
      let value = 0;
      return () => (value += 100);
    })(),
    delay: async (milliseconds) => delays.push(milliseconds),
  });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 100]);
});

test('probePostgresServer waits for a PostgreSQL authentication frame', async () => {
  const server = createServer((socket) => {
    socket.once('data', (request) => {
      assert.equal(request.readInt32BE(4), 196608);
      assert.match(request.toString('utf8'), /stock_insight_app_reader/);
      const authenticationSasl = Buffer.alloc(9);
      authenticationSasl.write('R', 0, 'ascii');
      authenticationSasl.writeInt32BE(8, 1);
      authenticationSasl.writeInt32BE(10, 5);
      socket.end(authenticationSasl);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(
      await probePostgresServer({ host: '127.0.0.1', port: address.port, timeoutMs: 1000 }),
      true,
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('probePostgresServer rejects an incomplete PostgreSQL frame', async () => {
  const server = createServer((socket) => {
    socket.once('data', () => {
      const incomplete = Buffer.alloc(5);
      incomplete.write('R', 0, 'ascii');
      incomplete.writeInt32BE(8, 1);
      socket.write(incomplete);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  try {
    assert.equal(
      await probePostgresServer({
        host: '127.0.0.1',
        port: address.port,
        timeoutMs: 30,
      }),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('probePostgresServer enforces an absolute timeout against slow response fragments', async () => {
  const server = createServer((socket) => {
    socket.once('data', () => {
      const frame = Buffer.alloc(9);
      frame.write('R', 0, 'ascii');
      frame.writeInt32BE(8, 1);
      frame.writeInt32BE(10, 5);
      let offset = 0;
      const interval = setInterval(() => {
        if (offset < frame.length) socket.write(frame.subarray(offset, ++offset));
      }, 15);
      socket.once('close', () => clearInterval(interval));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  const startedAt = Date.now();
  try {
    assert.equal(
      await probePostgresServer({
        host: '127.0.0.1',
        port: address.port,
        timeoutMs: 40,
      }),
      false,
    );
    assert.ok(Date.now() - startedAt < 120, 'absolute timeout must not reset on socket activity');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('waitForPostgresTunnel retries until Cloudflare reaches PostgreSQL', async () => {
  let calls = 0;
  const delays = [];
  await waitForPostgresTunnel({
    host: '127.0.0.1',
    port: 55432,
    timeoutMs: 2000,
    probe: async () => {
      calls += 1;
      return calls >= 3;
    },
    now: (() => {
      let value = 0;
      return () => (value += 100);
    })(),
    delay: async (milliseconds) => delays.push(milliseconds),
  });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 500]);
});

test('waitForPostgresTunnel gives one PostgreSQL probe the remaining human login budget', async () => {
  let receivedTimeout;
  await waitForPostgresTunnel({
    host: '127.0.0.1',
    port: 55432,
    timeoutMs: 300_000,
    probe: async (timeoutMs) => {
      receivedTimeout = timeoutMs;
      return true;
    },
    now: () => 0,
  });
  assert.equal(receivedTimeout, 300_000);
});

test('verifyTcpListenerOwnedByProcessGroup binds readiness to the spawned PGID socket', async () => {
  const portHex = (55432).toString(16).toUpperCase().padStart(4, '0');
  const files = new Map([
    [
      '/proc/net/tcp',
      `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n   0: 0100007F:${portHex} 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 777`,
    ],
    ['/proc/5001/stat', '5001 (cloudflared) S 1 5001 5001 0'],
  ]);
  const readdir = async (path) => {
    if (path === '/proc') return ['5001'];
    if (path === '/proc/5001/fd') return ['3'];
    throw new Error(`unexpected readdir: ${path}`);
  };

  assert.equal(
    await verifyTcpListenerOwnedByProcessGroup({
      host: '127.0.0.1',
      port: 55432,
      processGroupId: 5001,
      readText: async (path) => files.get(path),
      readdir,
      readLink: async () => 'socket:[777]',
    }),
    true,
  );
  assert.equal(
    await verifyTcpListenerOwnedByProcessGroup({
      host: '127.0.0.1',
      port: 55432,
      processGroupId: 5001,
      readText: async (path) => files.get(path),
      readdir,
      readLink: async () => 'socket:[999]',
    }),
    false,
  );
});

test('verifyTcpListenerOwnedByProcessGroup follows a bubblewrap child process group', async () => {
  const portHex = (55432).toString(16).toUpperCase().padStart(4, '0');
  const procStat = ({ pid, name, parentPid, processGroupId, sessionId, startTime }) =>
    `${pid} (${name}) ${[
      'S',
      parentPid,
      processGroupId,
      sessionId,
      ...Array(15).fill(0),
      startTime,
    ].join(' ')}`;
  const files = new Map([
    [
      '/proc/net/tcp',
      `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n   0: 0100007F:${portHex} 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 778`,
    ],
    [
      '/proc/5001/stat',
      procStat({
        pid: 5001,
        name: 'bwrap',
        parentPid: 1,
        processGroupId: 5001,
        sessionId: 5001,
        startTime: 11,
      }),
    ],
    [
      '/proc/5002/stat',
      procStat({
        pid: 5002,
        name: 'bwrap',
        parentPid: 5001,
        processGroupId: 5002,
        sessionId: 5002,
        startTime: 12,
      }),
    ],
    [
      '/proc/5003/stat',
      procStat({
        pid: 5003,
        name: 'cloudflared',
        parentPid: 5002,
        processGroupId: 5002,
        sessionId: 5002,
        startTime: 13,
      }),
    ],
  ]);
  const readdir = async (path) => {
    if (path === '/proc') return ['5001', '5002', '5003'];
    if (path === '/proc/5001/fd' || path === '/proc/5002/fd') return [];
    if (path === '/proc/5003/fd') return ['4'];
    throw new Error(`unexpected readdir: ${path}`);
  };

  assert.equal(
    await verifyTcpListenerOwnedByProcessGroup({
      host: '127.0.0.1',
      port: 55432,
      processGroupId: 5001,
      rootProcessIdentity: {
        pid: 5001,
        processGroupId: 5001,
        sessionId: 5001,
        startTime: '11',
      },
      readText: async (path) => files.get(path),
      readdir,
      readLink: async () => 'socket:[778]',
    }),
    true,
  );
});

test('Darwin ps identity and lsof listener verification bind a port to the spawned process group', async () => {
  const calls = [];
  const runCommand = async (executable, args) => {
    calls.push([executable, args]);
    if (executable === '/bin/ps') {
      if (args.includes('5001')) return ' 5001 5001 Mon Aug  2 12:00:00 2026\n';
      if (args.includes('5002')) return ' 5002 5001 Mon Aug  2 12:00:01 2026\n';
    }
    if (executable === '/usr/sbin/lsof') return 'p5002\n';
    throw new Error(`unexpected command: ${executable}`);
  };
  const identity = await captureDarwinProcessIdentity(5001, {
    psExecutable: '/bin/ps',
    runCommand,
  });

  assert.deepEqual(identity, {
    pid: 5001,
    processGroupId: 5001,
    startTime: 'Mon Aug 2 12:00:00 2026',
  });
  assert.equal(
    await verifyDarwinTcpListenerOwnedByProcessGroup({
      host: '127.0.0.1',
      port: 55432,
      processGroupId: 5001,
      rootProcessIdentity: identity,
      lsofExecutable: '/usr/sbin/lsof',
      psExecutable: '/bin/ps',
      runCommand,
    }),
    true,
  );
  assert.ok(calls.some(([executable]) => executable === '/usr/sbin/lsof'));
});

test('Darwin listener verification rejects an unrelated process group', async () => {
  const runCommand = async (executable, args) => {
    if (executable === '/usr/sbin/lsof') return 'p6002\n';
    if (args.includes('6001')) return ' 6001 6001 Mon Aug  2 12:00:00 2026\n';
    if (args.includes('6002')) return ' 6002 9999 Mon Aug  2 12:00:01 2026\n';
    throw new Error('unexpected process');
  };
  assert.equal(
    await verifyDarwinTcpListenerOwnedByProcessGroup({
      host: '127.0.0.1',
      port: 6200,
      processGroupId: 6001,
      rootProcessIdentity: {
        pid: 6001,
        processGroupId: 6001,
        startTime: 'Mon Aug 2 12:00:00 2026',
      },
      lsofExecutable: '/usr/sbin/lsof',
      psExecutable: '/bin/ps',
      runCommand,
    }),
    false,
  );
});

test('spawn helpers isolate tunnel, API, and sandboxed web environments', () => {
  const calls = [];
  const children = [{ pid: 1001 }, { pid: 1002 }, { pid: 1003 }];
  const prepared = {
    tunnelCommand: { executable: 'cloudflared', args: ['access'], cwd: '/repo' },
    apiCommand: { executable: 'pnpm', args: ['--filter', 'api'], cwd: '/repo' },
    webCommand: { executable: 'bwrap', args: ['--ro-bind'], cwd: '/repo' },
    tunnelEnv: { PATH: '/tunnel' },
    apiEnv: { PATH: '/api', PGPASSFILE: '/private/pgpass' },
    webEnv: { PATH: '/web' },
  };
  const spawnProcess = (executable, args, options) => {
    calls.push({ executable, args, options });
    return children[calls.length - 1];
  };
  const tunnel = spawnLiveTunnel(prepared, spawnProcess);
  const api = spawnLiveApi(prepared, spawnProcess);
  const web = spawnLiveWeb(prepared, spawnProcess);

  assert.equal(tunnel, children[0]);
  assert.equal(api, children[1]);
  assert.equal(web, children[2]);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[1].options.detached, true);
  assert.equal(calls[2].options.detached, true);
  assert.equal(calls[0].options.env, prepared.tunnelEnv);
  assert.equal(calls[1].options.env, prepared.apiEnv);
  assert.equal(calls[2].options.env, prepared.webEnv);
});

class FakeProcess extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.killed = false;
  }
}

test('superviseLiveDev terminates all isolated process groups on a parent signal', async () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const tunnel = new FakeProcess(2001);
  const api = new FakeProcess(2002);
  const web = new FakeProcess(2003);
  const identities = new Map([
    [tunnel, { pid: 2001, processGroupId: 2001 }],
    [api, { pid: 2002, processGroupId: 2002 }],
    [web, { pid: 2003, processGroupId: 2003 }],
  ]);
  const kills = [];
  const timers = [];
  superviseLiveDev({ tunnel, api, web }, parent, {
    platform: 'linux',
    killProcess: (pid, signal) => kills.push([pid, signal]),
    schedule: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    cancelSchedule: () => {},
    identities,
    ownsProcessGroup: async () => true,
  });

  parent.emit('SIGTERM');

  assert.deepEqual(kills, [
    [-2003, 'SIGTERM'],
    [-2002, 'SIGTERM'],
    [-2001, 'SIGTERM'],
  ]);
  assert.equal(timers.length, 1);
  await timers[0]();
  assert.deepEqual(kills.slice(-3), [
    [-2003, 'SIGKILL'],
    [-2002, 'SIGKILL'],
    [-2001, 'SIGKILL'],
  ]);
});

test('superviseLiveDev re-kills a settled leader PGID while its original group remains owned', async () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const tunnel = new FakeProcess(2101);
  const api = new FakeProcess(2102);
  const web = new FakeProcess(2103);
  const identities = new Map([
    [tunnel, { pid: 2101, processGroupId: 2101 }],
    [api, { pid: 2102, processGroupId: 2102 }],
    [web, { pid: 2103, processGroupId: 2103 }],
  ]);
  const kills = [];
  const timers = [];
  superviseLiveDev({ tunnel, api, web }, parent, {
    platform: 'linux',
    killProcess: (pid, signal) => kills.push([pid, signal]),
    schedule: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    cancelSchedule: () => {},
    identities,
    ownsProcessGroup: async () => true,
  });

  parent.emit('SIGTERM');
  web.emit('exit', null, 'SIGTERM');
  await timers[0]();

  assert.deepEqual(kills.slice(-3), [
    [-2103, 'SIGKILL'],
    [-2102, 'SIGKILL'],
    [-2101, 'SIGKILL'],
  ]);
});

test('superviseLiveDev never force-kills a settled leader PGID after ownership is lost', async () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const tunnel = new FakeProcess(2201);
  const api = new FakeProcess(2202);
  const web = new FakeProcess(2203);
  const identities = new Map([
    [tunnel, { pid: 2201, processGroupId: 2201 }],
    [api, { pid: 2202, processGroupId: 2202 }],
    [web, { pid: 2203, processGroupId: 2203 }],
  ]);
  const kills = [];
  const timers = [];
  superviseLiveDev({ tunnel, api, web }, parent, {
    platform: 'linux',
    killProcess: (pid, signal) => kills.push([pid, signal]),
    schedule: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    cancelSchedule: () => {},
    identities,
    ownsProcessGroup: async (identity) => identity.pid !== 2203,
  });

  parent.emit('SIGTERM');
  web.emit('exit', null, 'SIGTERM');
  await timers[0]();

  assert.ok(!kills.some(([pid, signal]) => pid === -2203 && signal === 'SIGKILL'));
  assert.deepEqual(kills.slice(-2), [
    [-2202, 'SIGKILL'],
    [-2201, 'SIGKILL'],
  ]);
});

test('superviseLiveDev settles a spawn error and cleans up after bounded teardown', async () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const tunnel = new FakeProcess(2301);
  const api = new FakeProcess(2302);
  const web = new FakeProcess(2303);
  const kills = [];
  const timers = [];
  let cleanupCount = 0;
  superviseLiveDev({ tunnel, api, web }, parent, {
    platform: 'linux',
    killProcess: (pid, signal) => kills.push([pid, signal]),
    schedule: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    cancelSchedule: () => {},
    ownsProcessGroup: async () => false,
    onCleanup: () => {
      cleanupCount += 1;
    },
  });

  web.emit('error', new Error('spawn failed'));
  api.emit('exit', null, 'SIGTERM');
  tunnel.emit('exit', null, 'SIGTERM');
  assert.equal(cleanupCount, 0);
  await timers[0]();

  assert.equal(parent.exitCode, 1);
  assert.equal(cleanupCount, 1);
  assert.deepEqual(kills, [
    [-2302, 'SIGTERM'],
    [-2301, 'SIGTERM'],
  ]);
});

test('superviseLiveDev stops the API and web when the tunnel exits unexpectedly', () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const tunnel = new FakeProcess(3001);
  const api = new FakeProcess(3002);
  const web = new FakeProcess(3003);
  const kills = [];
  superviseLiveDev({ tunnel, api, web }, parent, {
    platform: 'linux',
    killProcess: (pid, signal) => kills.push([pid, signal]),
    schedule: () => 1,
    cancelSchedule: () => {},
  });

  tunnel.emit('exit', 1, null);

  assert.equal(parent.exitCode, 1);
  assert.deepEqual(kills, [
    [-3003, 'SIGTERM'],
    [-3002, 'SIGTERM'],
  ]);
});

test('startLiveDev tears down the tunnel when readiness fails before workspace startup', async () => {
  const tunnel = new FakeProcess(4001);
  const kills = [];
  let apiStarted = false;

  await assert.rejects(
    startLiveDev(
      { tunnelPort: 55432 },
      {
        spawnTunnel: () => tunnel,
        waitUntilReady: async () => {
          throw new Error('readiness failed');
        },
        spawnApi: () => {
          apiStarted = true;
          return new FakeProcess(4002);
        },
        platform: 'linux',
        killProcess: (pid, signal) => kills.push([pid, signal]),
      },
    ),
    /readiness failed/,
  );

  assert.equal(apiStarted, false);
  assert.deepEqual(kills, [[-4001, 'SIGTERM']]);
});

test('startLiveDev rejects a listener not owned by the spawned tunnel before API credentials load', async () => {
  const tunnel = new FakeProcess(4101);
  let apiStarted = false;
  const kills = [];

  await assert.rejects(
    startLiveDev(
      { tunnelPort: 55432 },
      {
        spawnTunnel: () => tunnel,
        waitUntilReady: async () => {},
        verifyTunnelListener: async () => false,
        spawnApi: () => {
          apiStarted = true;
          return new FakeProcess(4102);
        },
        platform: 'linux',
        killProcess: (pid, signal) => kills.push([pid, signal]),
      },
    ),
    /not owned by spawned cloudflared/,
  );

  assert.equal(apiStarted, false);
  assert.deepEqual(kills, [[-4101, 'SIGTERM']]);
});

test('startLiveDev waits for upstream PostgreSQL readiness before loading API credentials', async () => {
  const tunnel = new FakeProcess(4121);
  const api = new FakeProcess(4122);
  const web = new FakeProcess(4123);
  let releasePostgresReadiness;
  let apiStarted = false;
  const postgresReady = new Promise((resolve) => {
    releasePostgresReadiness = resolve;
  });

  const startup = startLiveDev(
    { tunnelPort: 55432, apiPort: 6200 },
    {
      spawnTunnel: () => tunnel,
      waitUntilReady: async () => {},
      verifyTunnelListener: async () => true,
      waitUntilPostgresReady: () => postgresReady,
      spawnApi: () => {
        apiStarted = true;
        return api;
      },
      waitUntilApiReady: async () => {},
      verifyApiListener: async () => true,
      spawnWeb: () => web,
      supervise: () => {},
      captureIdentity: async (pid) => ({ pid, processGroupId: pid, startTime: '1' }),
    },
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(apiStarted, false);

  releasePostgresReadiness();
  await startup;
  assert.equal(apiStarted, true);
});

test('startLiveDev revalidates tunnel ownership after upstream readiness before loading API credentials', async () => {
  const tunnel = new FakeProcess(4131);
  let ownershipChecks = 0;
  let apiStarted = false;

  await assert.rejects(
    startLiveDev(
      { tunnelPort: 55432, apiPort: 6200 },
      {
        spawnTunnel: () => tunnel,
        waitUntilReady: async () => {},
        verifyTunnelListener: async () => ++ownershipChecks === 1,
        waitUntilPostgresReady: async () => {},
        spawnApi: () => {
          apiStarted = true;
          return new FakeProcess(4132);
        },
        waitUntilApiReady: async () => {},
        verifyApiListener: async () => true,
        spawnWeb: () => new FakeProcess(4133),
        supervise: () => {},
        captureIdentity: async (pid) => ({ pid, processGroupId: pid, startTime: '1' }),
        platform: 'linux',
        killProcess: () => {},
      },
    ),
    /not owned by spawned cloudflared/,
  );

  assert.equal(ownershipChecks, 2);
  assert.equal(
    apiStarted,
    false,
    'API credentials must remain unloaded after tunnel ownership loss',
  );
});

test('startLiveDev rejects an API listener not owned by the spawned API process group', async () => {
  const tunnel = new FakeProcess(4151);
  const api = new FakeProcess(4152);
  let webStarted = false;
  const kills = [];

  await assert.rejects(
    startLiveDev(
      { tunnelPort: 55432, apiPort: 6200 },
      {
        spawnTunnel: () => tunnel,
        waitUntilReady: async () => {},
        verifyTunnelListener: async () => true,
        waitUntilPostgresReady: async () => {},
        spawnApi: () => api,
        waitUntilApiReady: async () => {},
        verifyApiListener: async () => false,
        spawnWeb: () => {
          webStarted = true;
          return new FakeProcess(4153);
        },
        captureIdentity: async (pid) => ({ pid, processGroupId: pid, startTime: '1' }),
        platform: 'linux',
        killProcess: (pid, signal) => kills.push([pid, signal]),
      },
    ),
    /not owned by spawned API server/,
  );

  assert.equal(webStarted, false);
  assert.ok(kills.some(([pid, signal]) => pid === -4152 && signal === 'SIGTERM'));
});

test('startLiveDev owns parent signals during tunnel readiness and escalates bounded cleanup', async () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const tunnel = new FakeProcess(4201);
  const kills = [];
  const timers = [];
  let readinessSignal;
  const startup = startLiveDev(
    { tunnelPort: 55432 },
    {
      parent,
      spawnTunnel: () => tunnel,
      waitUntilReady: (_prepared, { signal }) => {
        readinessSignal = signal;
        return new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      },
      platform: 'linux',
      killProcess: (pid, signal) => kills.push([pid, signal]),
      schedule: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      cancelSchedule: () => {},
      captureIdentity: async (pid) => ({ pid, processGroupId: pid }),
      ownsProcessGroup: async () => true,
    },
  );

  const rejection = assert.rejects(startup, /startup interrupted by SIGTERM/);
  parent.emit('SIGTERM');
  await rejection;
  assert.equal(readinessSignal.aborted, true);
  assert.equal(parent.exitCode, 143);
  assert.deepEqual(kills, [[-4201, 'SIGTERM']]);
  await timers[0]();
  assert.deepEqual(kills.at(-1), [-4201, 'SIGKILL']);
});

test('startLiveDev aborts PostgreSQL SSO readiness immediately on Ctrl+C', async () => {
  const parent = new EventEmitter();
  parent.exitCode = undefined;
  const tunnel = new FakeProcess(4251);
  let receivedSignal;
  let cleanupCount = 0;
  const startup = startLiveDev(
    {
      tunnelPort: 55432,
      cleanup: () => {
        cleanupCount += 1;
      },
    },
    {
      parent,
      spawnTunnel: () => tunnel,
      waitUntilReady: async () => {},
      verifyTunnelListener: async () => true,
      waitUntilPostgresReady: (_prepared, { signal }) => {
        receivedSignal = signal;
        return new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      },
      platform: 'darwin',
      killProcess: () => {},
      captureIdentity: async (pid) => ({ pid, processGroupId: pid, startTime: '1' }),
      schedule: () => 1,
    },
  );

  await new Promise((resolve) => setImmediate(resolve));
  parent.emit('SIGINT');
  await assert.rejects(startup, /startup interrupted by SIGINT/);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(cleanupCount, 1);
});

test('startLiveDev rejects a web spawn error emitted while process identity is captured', async () => {
  const tunnel = new FakeProcess(4301);
  const api = new FakeProcess(4302);
  const web = new FakeProcess(4303);
  let cleanupCount = 0;
  let supervised = false;
  web.once('error', () => {});

  await assert.rejects(
    startLiveDev(
      {
        tunnelPort: 55432,
        apiPort: 6200,
        cleanup: () => {
          cleanupCount += 1;
        },
      },
      {
        spawnTunnel: () => tunnel,
        waitUntilReady: async () => {},
        verifyTunnelListener: async () => true,
        waitUntilPostgresReady: async () => {},
        spawnApi: () => api,
        waitUntilApiReady: async () => {},
        verifyApiListener: async () => true,
        spawnWeb: () => web,
        captureIdentity: async (pid) => {
          if (pid === web.pid) web.emit('error', new Error('web spawn failed'));
          return { pid, processGroupId: pid };
        },
        supervise: () => {
          supervised = true;
        },
        killProcess: () => {},
        schedule: () => 1,
      },
    ),
    /web spawn failed/,
  );

  assert.equal(supervised, false);
  assert.equal(cleanupCount, 1);
});

test('startLiveDev tears down a settled startup leader process group before supervisor handoff', async () => {
  const tunnel = new FakeProcess(4401);
  const api = new FakeProcess(4402);
  const kills = [];
  const timers = [];
  let webStarted = false;

  await assert.rejects(
    startLiveDev(
      { tunnelPort: 55432, apiPort: 6200, cleanup: () => {} },
      {
        spawnTunnel: () => tunnel,
        waitUntilReady: async () => {},
        verifyTunnelListener: async () => true,
        waitUntilPostgresReady: async () => {},
        spawnApi: () => api,
        waitUntilApiReady: async () => {},
        verifyApiListener: async () => true,
        spawnWeb: () => {
          webStarted = true;
          return new FakeProcess(4403);
        },
        captureIdentity: async (pid) => {
          if (pid === api.pid) api.emit('exit', 1, null);
          return { pid, processGroupId: pid, sessionId: pid, startTime: '1' };
        },
        ownsProcessGroup: async () => true,
        platform: 'linux',
        killProcess: (pid, signal) => kills.push([pid, signal]),
        schedule: (callback) => {
          timers.push(callback);
          return timers.length;
        },
        cancelSchedule: () => {},
      },
    ),
    /API server exited during startup registration/,
  );

  assert.equal(webStarted, false);
  assert.ok(kills.some(([pid, signal]) => pid === -4402 && signal === 'SIGTERM'));
  assert.equal(timers.length, 1);
  await timers[0]();
  assert.ok(kills.some(([pid, signal]) => pid === -4402 && signal === 'SIGKILL'));
});

test('workspace scripts and Turbo explicitly carry the live-development file contract', async () => {
  const [packageText, turboText, readme] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../turbo.json', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageText);
  const turbo = JSON.parse(turboText);
  assert.equal(packageJson.scripts.dev, 'node scripts/dev-live.mjs');
  assert.equal(packageJson.scripts['dev:workspace'], 'turbo run dev');
  assert.match(packageJson.scripts.format, /\bscripts\b/);
  assert.match(packageJson.scripts['format:check'], /\bscripts\b/);
  assert.equal(packageJson.scripts['setup:live'], 'node scripts/live-dev-bundle.mjs setup');
  assert.equal(packageJson.scripts['live:recipient:init'], undefined);
  assert.equal(packageJson.scripts['live:bundle:inspect'], undefined);
  assert.equal(
    packageJson.scripts['live:bundle:export'],
    'node scripts/live-dev-bundle.mjs export',
  );
  for (const key of [
    'PORT',
    'PGPASSFILE',
    'DATABASE_URL',
    'DATABASE_READ_URL',
    'DATABASE_WRITE_URL',
    'STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET',
    'STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE',
    'STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_ID',
    'STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_SECRET',
    'STOCK_INSIGHT_SESSION_SECRET_FILE',
    'STOCK_INSIGHT_MUTATIONS_ENABLED',
    'STOCK_INSIGHT_LIVE_DATABASE_EXPECTED',
    'VITE_STOCK_INSIGHT_DATA_ENV',
  ]) {
    assert.ok(!turbo.tasks.dev.env.includes(key), `${key} must never pass through Turbo`);
  }
  assert.match(readme, /~\/\.hermes\/secrets\/stock-insight-live-dev\/pgpass/);
  assert.match(readme, /pnpm setup:live --bundle/);
  assert.match(readme, /pnpm dev:live:check/);
});
