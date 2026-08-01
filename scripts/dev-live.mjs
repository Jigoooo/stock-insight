#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  rm,
} from 'node:fs/promises';
import { createConnection } from 'node:net';
import { constants, homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIVE_DB_HOSTNAME = 'insight-db.jigooo.com';
const DATABASE_NAME = 'research_app';
const READ_ROLE = 'stock_insight_app_reader';
const WRITE_ROLE = 'stock_insight_app_writer';
const DEFAULT_TUNNEL_PORT = 55_432;
const DEFAULT_WEB_PORT = 6_100;
const DEFAULT_API_PORT = 6_200;
const CHILD_ENV_PASSTHROUGH_KEYS = [
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'CI',
  'PNPM_HOME',
  'COREPACK_HOME',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'WSL_DISTRO_NAME',
  'WSL_INTEROP',
];

function selectChildEnvironment(env) {
  return Object.fromEntries(
    CHILD_ENV_PASSTHROUGH_KEYS.flatMap((key) =>
      typeof env[key] === 'string' ? [[key, env[key]]] : [],
    ),
  );
}

function parsePort(value, name, fallback) {
  const raw = value?.trim() || String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer from 1 to 65535`);
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 to 65535`);
  }
  return port;
}

async function requirePrivateFile(path, platform, label) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error(`${label} must not be a symbolic link: ${path}`);
    throw new Error(`${label} is missing: ${path}`);
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
    if (platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
      throw new Error(`${label} must have mode 0600 or stricter: ${path}`);
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

async function requirePrivateDirectory(path, platform, label, { strict = false } = {}) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new Error(`${label} is missing: ${path}`);
  }
  if (metadata.isSymbolicLink()) {
    throw new Error(`${label} must not contain a symbolic link: ${path}`);
  }
  if (!metadata.isDirectory()) throw new Error(`${label} must be a directory: ${path}`);
  if (platform === 'win32') return;
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the current user: ${path}`);
  }
  if ((metadata.mode & 0o022) !== 0) {
    throw new Error(`${label} must not be group- or world-writable: ${path}`);
  }
  if (strict && (metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must have mode 0700 or stricter: ${path}`);
  }
}

async function defaultResolveCommand(name, env = process.env) {
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue searching the bounded PATH.
    }
  }
  return undefined;
}

function buildDatabaseUrl(role, port, applicationName) {
  const url = new URL(`postgresql://${role}@127.0.0.1:${port}/${DATABASE_NAME}`);
  url.searchParams.set('application_name', applicationName);
  if (role === READ_ROLE) {
    url.searchParams.set('options', '-c default_transaction_read_only=on');
  }
  return url.toString();
}

export async function prepareLiveDev({
  homeDir = homedir(),
  env = process.env,
  platform = process.platform,
  nodeExecutable = process.execPath,
  resolveCommand = (name) => defaultResolveCommand(name, env),
} = {}) {
  if (platform === 'win32') throw new Error('Native Windows is not supported; run this inside WSL');
  const hostname = env.STOCK_INSIGHT_DB_TUNNEL_HOSTNAME?.trim() || LIVE_DB_HOSTNAME;
  if (hostname !== LIVE_DB_HOSTNAME) {
    throw new Error(`STOCK_INSIGHT_DB_TUNNEL_HOSTNAME must equal ${LIVE_DB_HOSTNAME}`);
  }
  const tunnelPort = parsePort(
    env.STOCK_INSIGHT_DB_TUNNEL_PORT,
    'STOCK_INSIGHT_DB_TUNNEL_PORT',
    DEFAULT_TUNNEL_PORT,
  );
  const webPort = parsePort(env.VITE_PORT, 'VITE_PORT', DEFAULT_WEB_PORT);
  const apiPort = parsePort(env.STOCK_INSIGHT_API_PORT, 'STOCK_INSIGHT_API_PORT', DEFAULT_API_PORT);
  if (new Set([tunnelPort, webPort, apiPort]).size !== 3) {
    throw new Error('tunnel, web, and API ports must be distinct');
  }

  const secretDir = join(homeDir, '.hermes', 'secrets', 'stock-insight-live-dev');
  const fixedPgpassFile = join(secretDir, 'pgpass');
  if (env.PGPASSFILE && resolve(env.PGPASSFILE) !== resolve(fixedPgpassFile)) {
    throw new Error(`PGPASSFILE must equal the fixed live secret path: ${fixedPgpassFile}`);
  }
  const pgpassFile = fixedPgpassFile;
  const internalContextFile =
    env.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE ||
    join(secretDir, 'stock-insight-internal-context.secret');
  const sessionSecretFile =
    env.STOCK_INSIGHT_SESSION_SECRET_FILE || join(secretDir, 'stock-insight-session.secret');
  const [pgpass, internalContext, sessionSecret] = await Promise.all([
    requirePrivateFile(pgpassFile, platform, 'pgpass'),
    requirePrivateFile(internalContextFile, platform, 'internal context secret'),
    requirePrivateFile(sessionSecretFile, platform, 'session secret'),
  ]);
  const pgpassLines = pgpass.trimEnd().split('\n');
  if (
    pgpassLines.length !== 2 ||
    !pgpassLines[0].startsWith(`127.0.0.1:*:${DATABASE_NAME}:${READ_ROLE}:`) ||
    !pgpassLines[1].startsWith(`127.0.0.1:*:${DATABASE_NAME}:${WRITE_ROLE}:`)
  ) {
    throw new Error(`pgpass does not match the expected live database roles: ${pgpassFile}`);
  }
  if (internalContext.trim().length < 32) {
    throw new Error(`internal context secret is too short: ${internalContextFile}`);
  }
  if (sessionSecret.trim().length < 32) {
    throw new Error(`session secret is too short: ${sessionSecretFile}`);
  }

  const cloudflared = await resolveCommand('cloudflared');
  if (!cloudflared)
    throw new Error('cloudflared is required; install it before running live development');
  const pnpm = await resolveCommand('pnpm');
  if (!pnpm) throw new Error('pnpm is required; install it before running live development');
  const bubblewrap = await resolveCommand('bwrap');
  if (!bubblewrap) {
    throw new Error('bubblewrap is required to isolate the web process from database credentials');
  }

  // NEVER os.tmpdir(): it honours TMPDIR, and on WSL drvfs (/mnt/c) chmod is a
  // no-op, so the production passwords would land in a world-readable file — or
  // inside the repo, where the web sandbox could read them. Pin the runtime
  // directory under the same private home that already holds the secrets.
  const runtimeRoot = join(homeDir, '.hermes', 'run', 'stock-insight-live-dev');
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  if (platform !== 'win32') await chmod(runtimeRoot, 0o700);
  const runtimeChain = [
    homeDir,
    join(homeDir, '.hermes'),
    join(homeDir, '.hermes', 'run'),
    runtimeRoot,
  ];
  for (const path of runtimeChain) {
    await requirePrivateDirectory(path, platform, 'runtime directory chain', {
      strict: path === runtimeRoot,
    });
  }
  const runtimeDir = await mkdtemp(join(runtimeRoot, 'api-'));
  const runtimePgpassFile = join(runtimeDir, 'pgpass');
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(runtimeDir, { recursive: true, force: true });
  };
  try {
    if (platform !== 'win32') await chmod(runtimeDir, 0o700);
    await requirePrivateDirectory(runtimeDir, platform, 'runtime directory', { strict: true });
    const exactPortPgpass = `${pgpassLines
      .map((line) => line.replace('127.0.0.1:*:', `127.0.0.1:${tunnelPort}:`))
      .join('\n')}\n`;
    const runtimeHandle = await open(
      runtimePgpassFile,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      await runtimeHandle.writeFile(exactPortPgpass, 'utf8');
      if (platform !== 'win32') await runtimeHandle.chmod(0o600);
      // Verify the exact inode we wrote, not a path that could be replaced
      // between write and stat.
      if (platform !== 'win32') {
        const runtimeStat = await runtimeHandle.stat();
        if ((runtimeStat.mode & 0o077) !== 0) {
          throw new Error('runtime pgpass must not be group- or world-accessible');
        }
        if (typeof process.getuid === 'function' && runtimeStat.uid !== process.getuid()) {
          throw new Error('runtime pgpass must be owned by the current user');
        }
      }
    } finally {
      await runtimeHandle.close();
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  const baseEnv = selectChildEnvironment(env);
  const tunnelSandboxHome = '/tmp/stock-insight-live-tunnel-home';
  const tunnelEnv = { ...baseEnv, HOME: tunnelSandboxHome };
  delete tunnelEnv.XDG_CONFIG_HOME;
  delete tunnelEnv.XDG_DATA_HOME;
  const apiEnv = {
    ...baseEnv,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    STOCK_INSIGHT_API_PORT: String(apiPort),
    DATABASE_READ_URL: buildDatabaseUrl(READ_ROLE, tunnelPort, 'stock-insight-live-dev-reader'),
    DATABASE_WRITE_URL: buildDatabaseUrl(WRITE_ROLE, tunnelPort, 'stock-insight-live-dev-writer'),
    PGPASSFILE: runtimePgpassFile,
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: internalContextFile,
    STOCK_INSIGHT_SIGNUP_ENABLED: 'true',
    STOCK_INSIGHT_MUTATIONS_ENABLED: 'true',
    STOCK_INSIGHT_REMOTE_READ_ONLY: 'false',
    STOCK_INSIGHT_LIVE_DATABASE_EXPECTED: 'true',
  };
  const sandboxSecretDir = '/run/stock-insight-live-web';
  const sandboxHome = '/tmp/stock-insight-live-web-home';
  const webEnv = {
    ...baseEnv,
    HOME: sandboxHome,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    VITE_PORT: String(webPort),
    STOCK_INSIGHT_BRAIN_URL: `http://127.0.0.1:${apiPort}`,
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: `${sandboxSecretDir}/internal-context.secret`,
    STOCK_INSIGHT_SESSION_SECRET_FILE: `${sandboxSecretDir}/session.secret`,
    STOCK_INSIGHT_APP_ORIGIN: `http://127.0.0.1:${webPort}`,
    STOCK_INSIGHT_SIGNUP_ENABLED: 'true',
    STOCK_INSIGHT_MUTATIONS_ENABLED: 'true',
    STOCK_INSIGHT_REMOTE_READ_ONLY: 'false',
    VITE_STOCK_INSIGHT_DATA_ENV: 'production-live',
  };
  delete webEnv.XDG_CONFIG_HOME;
  delete webEnv.XDG_DATA_HOME;

  const workspaceRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
  const webRoot = join(workspaceRoot, 'apps', 'web');
  const viteCli = join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const createDirectoryChain = (directory) => {
    const args = [];
    let current = '';
    for (const segment of resolve(directory).split('/').filter(Boolean)) {
      current += `/${segment}`;
      args.push('--dir', current);
    }
    return args;
  };
  const sandboxReadOnlyMounts = [];
  const sandboxMountedRoots = [];
  for (const candidate of [
    '/usr',
    '/bin',
    '/lib',
    '/lib64',
    '/etc/ssl',
    '/etc/ca-certificates',
    '/etc/resolv.conf',
    '/etc/hosts',
    '/etc/nsswitch.conf',
    '/etc/gai.conf',
    '/etc/localtime',
    '/etc/passwd',
    '/etc/group',
  ]) {
    try {
      await access(candidate, fsConstants.R_OK);
      sandboxReadOnlyMounts.push('--ro-bind', candidate, candidate);
      sandboxMountedRoots.push(candidate);
    } catch {
      // Optional runtime paths vary between Linux distributions.
    }
  }
  // Every executable the launcher execs must exist inside the sandbox mount
  // namespace. node/cloudflared routinely live outside the allowlist above
  // (nvm, ~/.local, /opt), and an unbound path makes bwrap die with
  // "execvp ...: No such file or directory" instead of starting the child.
  const exposeSandboxExecutable = (executable) => {
    const target = resolve(executable);
    const alreadyMounted = sandboxMountedRoots.some(
      (root) => target === root || target.startsWith(`${root}/`),
    );
    if (alreadyMounted) return [];
    return [...createDirectoryChain(dirname(target)), '--ro-bind', target, target];
  };
  // The workspace is mounted read-only, but Vite/Turbo still need writable
  // caches. bwrap cannot mkdir a tmpfs target inside a read-only mount, so only
  // overlay directories that already exist on the host.
  const sandboxWritableCaches = [];
  for (const candidate of [
    join(webRoot, 'node_modules', '.vite'),
    join(workspaceRoot, 'node_modules', '.cache'),
    join(workspaceRoot, '.turbo'),
  ]) {
    try {
      await access(candidate, fsConstants.R_OK);
      sandboxWritableCaches.push('--tmpfs', candidate);
    } catch {
      // Cache directories are created lazily; nothing to shadow yet.
    }
  }
  return {
    hostname,
    tunnelPort,
    webPort,
    apiPort,
    pgpassFile,
    runtimePgpassFile,
    internalContextFile,
    sessionSecretFile,
    cleanup,
    tunnelEnv,
    apiEnv,
    webEnv,
    tunnelCommand: {
      executable: bubblewrap,
      args: [
        '--die-with-parent',
        '--new-session',
        '--unshare-all',
        '--share-net',
        ...sandboxReadOnlyMounts,
        '--tmpfs',
        '/tmp',
        ...exposeSandboxExecutable(cloudflared),
        '--proc',
        '/proc',
        '--dev-bind',
        '/dev',
        '/dev',
        '--dir',
        tunnelSandboxHome,
        cloudflared,
        'access',
        'tcp',
        '--hostname',
        hostname,
        '--url',
        `127.0.0.1:${tunnelPort}`,
      ],
    },
    apiCommand: {
      executable: pnpm,
      cwd: workspaceRoot,
      args: ['--filter', '@stock-insight/api-server', 'dev'],
    },
    webCommand: {
      executable: bubblewrap,
      cwd: workspaceRoot,
      args: [
        '--die-with-parent',
        '--new-session',
        '--unshare-all',
        '--share-net',
        ...sandboxReadOnlyMounts,
        '--tmpfs',
        '/tmp',
        '--tmpfs',
        '/run',
        ...exposeSandboxExecutable(nodeExecutable),
        '--dir',
        workspaceRoot,
        // Read-only: a sandbox that can rewrite its own source tree is not a
        // boundary — a compromised dependency could patch the API server or the
        // launcher and reach the production credentials on the next run.
        '--ro-bind',
        workspaceRoot,
        workspaceRoot,
        // Vite still needs a writable cache; give it throwaway tmpfs instead.
        ...sandboxWritableCaches,
        '--proc',
        '/proc',
        '--dev-bind',
        '/dev',
        '/dev',
        '--dir',
        sandboxSecretDir,
        '--ro-bind',
        internalContextFile,
        `${sandboxSecretDir}/internal-context.secret`,
        '--ro-bind',
        sessionSecretFile,
        `${sandboxSecretDir}/session.secret`,
        '--dir',
        sandboxHome,
        '--chdir',
        webRoot,
        nodeExecutable,
        viteCli,
        '--mode',
        'dev',
      ],
    },
  };
}

function spawnCommand(command, childEnv, spawnProcess) {
  return spawnProcess(command.executable, command.args, {
    cwd: command.cwd,
    detached: true,
    env: childEnv,
    stdio: 'inherit',
  });
}

export function spawnLiveTunnel(prepared, spawnProcess = spawn) {
  return spawnCommand(prepared.tunnelCommand, prepared.tunnelEnv, spawnProcess);
}

export function spawnLiveApi(prepared, spawnProcess = spawn) {
  return spawnCommand(prepared.apiCommand, prepared.apiEnv, spawnProcess);
}

export function spawnLiveWeb(prepared, spawnProcess = spawn) {
  return spawnCommand(prepared.webCommand, prepared.webEnv, spawnProcess);
}

function defaultTcpProbe(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function parseProcStat(text) {
  if (typeof text !== 'string') return undefined;
  const closing = text.lastIndexOf(')');
  if (closing < 0) return undefined;
  const pid = Number(text.slice(0, text.indexOf(' ')));
  const fields = text
    .slice(closing + 2)
    .trim()
    .split(/\s+/);
  const parentPid = Number(fields[1]);
  const processGroupId = Number(fields[2]);
  const sessionId = Number(fields[3]);
  if (![pid, parentPid, processGroupId, sessionId].every(Number.isInteger)) return undefined;
  return { pid, parentPid, processGroupId, sessionId, startTime: fields[19] };
}

async function listProcessStats({
  readText = (path) => readFile(path, 'utf8'),
  readDirectory = readdir,
} = {}) {
  const stats = [];
  for (const name of await readDirectory('/proc')) {
    if (!/^\d+$/.test(String(name))) continue;
    try {
      const parsed = parseProcStat(await readText(`/proc/${name}/stat`));
      if (parsed) stats.push(parsed);
    } catch {
      // Processes may exit while /proc is being traversed.
    }
  }
  return stats;
}

async function captureProcessIdentity(pid) {
  try {
    return parseProcStat(await readFile(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return undefined;
  }
}

async function processGroupStillOwned(identity) {
  if (!identity) return false;
  const members = (await listProcessStats()).filter(
    (candidate) => candidate.processGroupId === identity.processGroupId,
  );
  if (!members.length) return false;
  const leader = members.find((candidate) => candidate.pid === identity.pid);
  if (leader) return leader.startTime === identity.startTime;
  return members.every((candidate) => candidate.sessionId === identity.sessionId);
}

export async function verifyTcpListenerOwnedByProcessGroup({
  host,
  port,
  processGroupId,
  rootProcessIdentity,
  readText = (path) => readFile(path, 'utf8'),
  readdir: readDirectory = readdir,
  readLink = readlink,
}) {
  if (host !== '127.0.0.1' || !Number.isInteger(processGroupId) || processGroupId <= 0) {
    return false;
  }
  const expectedAddress = `0100007F:${port.toString(16).toUpperCase().padStart(4, '0')}`;
  let tcpTable;
  try {
    tcpTable = await readText('/proc/net/tcp');
  } catch {
    return false;
  }
  const listenerInodes = new Set();
  for (const line of tcpTable.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields[1] === expectedAddress && fields[3] === '0A' && fields[9]) {
      listenerInodes.add(fields[9]);
    }
  }
  if (!listenerInodes.size) return false;

  const processStats = await listProcessStats({ readText, readDirectory });
  const processByPid = new Map(processStats.map((candidate) => [candidate.pid, candidate]));
  if (rootProcessIdentity) {
    const currentRoot = processByPid.get(rootProcessIdentity.pid);
    if (
      !currentRoot ||
      currentRoot.startTime !== rootProcessIdentity.startTime ||
      currentRoot.processGroupId !== processGroupId
    ) {
      return false;
    }
  }
  const isRootDescendant = (candidate) => {
    if (!rootProcessIdentity) return false;
    const visited = new Set();
    let current = candidate;
    while (current && !visited.has(current.pid)) {
      if (current.pid === rootProcessIdentity.pid) return true;
      visited.add(current.pid);
      current = processByPid.get(current.parentPid);
    }
    return false;
  };
  const members = processStats.filter(
    (candidate) => candidate.processGroupId === processGroupId || isRootDescendant(candidate),
  );
  for (const member of members) {
    let descriptors;
    try {
      descriptors = await readDirectory(`/proc/${member.pid}/fd`);
    } catch {
      continue;
    }
    for (const descriptor of descriptors) {
      try {
        const target = await readLink(`/proc/${member.pid}/fd/${descriptor}`);
        const match = /^socket:\[(\d+)\]$/.exec(target);
        if (match && listenerInodes.has(match[1])) return true;
      } catch {
        // File descriptors may close while ownership is checked.
      }
    }
  }
  return false;
}

export async function waitForTcpPort({
  host,
  port,
  timeoutMs = 90_000,
  probe = () => defaultTcpProbe(host, port),
  now = Date.now,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (await probe()) return;
    await delay(100);
  }
  throw new Error(`Cloudflare Access TCP listener was not ready on ${host}:${port}`);
}

function exitCodeFor(code, signal) {
  return signal ? 128 + (constants.signals[signal] ?? 0) : (code ?? 1);
}

function terminateProcess(
  child,
  signal,
  {
    platform = process.platform,
    killProcess = (pid, childSignal) => process.kill(pid, childSignal),
  } = {},
) {
  if (!child || child.exitCode !== null || child.killed) return false;
  try {
    if (platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
      killProcess(-child.pid, signal);
    } else {
      child.kill(signal);
    }
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

function terminateOwnedProcessGroup(
  identity,
  signal,
  {
    platform = process.platform,
    killProcess = (pid, childSignal) => process.kill(pid, childSignal),
  } = {},
) {
  if (
    platform === 'win32' ||
    !identity ||
    !Number.isInteger(identity.processGroupId) ||
    identity.processGroupId <= 0
  ) {
    return false;
  }
  try {
    killProcess(-identity.processGroupId, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForManagedChild(child, waitUntilReady, label) {
  if (child.exitCode !== null || child.signalCode != null) {
    throw new Error(
      `${label} exited before readiness (${String(child.exitCode)}, ${String(child.signalCode)})`,
    );
  }
  let onError;
  let onExit;
  const earlyFailure = new Promise((_, reject) => {
    onError = (error) => reject(error);
    onExit = (code, signal) =>
      reject(new Error(`${label} exited before readiness (${String(code)}, ${String(signal)})`));
    child.once('error', onError);
    child.once('exit', onExit);
  });
  try {
    await Promise.race([waitUntilReady(), earlyFailure]);
  } finally {
    child.off('error', onError);
    child.off('exit', onExit);
  }
}

export async function startLiveDev(
  prepared,
  {
    parent = process,
    spawnTunnel = spawnLiveTunnel,
    waitUntilReady = () => waitForTcpPort({ host: '127.0.0.1', port: prepared.tunnelPort }),
    verifyTunnelListener = ({ tunnel, identity }) =>
      verifyTcpListenerOwnedByProcessGroup({
        host: '127.0.0.1',
        port: prepared.tunnelPort,
        processGroupId: identity?.processGroupId ?? tunnel.pid,
        rootProcessIdentity: identity,
      }),
    spawnApi = spawnLiveApi,
    waitUntilApiReady = () => waitForTcpPort({ host: '127.0.0.1', port: prepared.apiPort }),
    verifyApiListener = ({ api, identity }) =>
      verifyTcpListenerOwnedByProcessGroup({
        host: '127.0.0.1',
        port: prepared.apiPort,
        processGroupId: identity?.processGroupId ?? api.pid,
        rootProcessIdentity: identity,
      }),
    spawnWeb = spawnLiveWeb,
    supervise = superviseLiveDev,
    platform = process.platform,
    killProcess = (pid, signal) => process.kill(pid, signal),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer),
    ownsProcessGroup = processGroupStillOwned,
    captureIdentity = captureProcessIdentity,
  } = {},
) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = new Map();
  const children = [];
  const identities = new Map();
  const settled = new Set();
  const startupSettlements = new Map();
  let startupInterrupted = false;
  let forceTimer;
  let teardownPromise;
  let resolveInterruption;
  const interrupted = new Promise((resolve) => {
    resolveInterruption = resolve;
  });

  const register = async (child, label) => {
    let registrationError;
    child.once('error', (error) => {
      registrationError = error;
    });
    children.push(child);
    child.once('exit', (code, signal) => {
      settled.add(child);
      startupSettlements.set(child, { code, signal });
      child.exitCode = code;
      child.signalCode = signal;
    });
    identities.set(child, await captureIdentity(child.pid));
    if (registrationError) throw registrationError;
    if (startupSettlements.has(child) || child.exitCode !== null || child.signalCode != null) {
      throw new Error(`${label} exited during startup registration`);
    }
    return child;
  };
  const terminateRegistered = async (signal) => {
    let terminated = false;
    for (const child of children) {
      const identity = identities.get(child);
      if (settled.has(child)) {
        if (await ownsProcessGroup(identity)) {
          terminated =
            terminateOwnedProcessGroup(identity, signal, { platform, killProcess }) || terminated;
        }
      } else {
        terminated = terminateProcess(child, signal, { platform, killProcess }) || terminated;
      }
    }
    return terminated;
  };
  const scheduleForceKill = () => {
    if (forceTimer !== undefined) return;
    forceTimer = schedule(async () => {
      forceTimer = undefined;
      for (const child of children) {
        const identity = identities.get(child);
        if (await ownsProcessGroup(identity)) {
          terminateOwnedProcessGroup(identity, 'SIGKILL', { platform, killProcess });
        }
      }
    }, 3_000);
  };
  const beginTeardown = () => {
    teardownPromise ??= terminateRegistered('SIGTERM').then((terminated) => {
      if (terminated || identities.size > 0) scheduleForceKill();
    });
    return teardownPromise;
  };
  const removeStartupHandlers = () => {
    for (const [signal, handler] of handlers) parent.off(signal, handler);
    handlers.clear();
  };
  for (const signal of signals) {
    const handler = () => {
      if (startupInterrupted) return;
      startupInterrupted = true;
      parent.exitCode = exitCodeFor(null, signal);
      void beginTeardown();
      resolveInterruption(new Error(`live development startup interrupted by ${signal}`));
    };
    handlers.set(signal, handler);
    parent.on(signal, handler);
  }

  let tunnel;
  let api;
  let web;

  try {
    tunnel = await register(spawnTunnel(prepared), 'cloudflared');
    const tunnelReadiness = await Promise.race([
      waitForManagedChild(tunnel, () => waitUntilReady(prepared), 'cloudflared'),
      interrupted,
    ]);
    if (tunnelReadiness instanceof Error) throw tunnelReadiness;
    if (!(await verifyTunnelListener({ tunnel, identity: identities.get(tunnel), prepared }))) {
      throw new Error('local database listener is not owned by spawned cloudflared');
    }
    api = await register(spawnApi(prepared), 'API server');
    const apiReadiness = await Promise.race([
      waitForManagedChild(api, () => waitUntilApiReady(prepared), 'API server'),
      interrupted,
    ]);
    if (apiReadiness instanceof Error) throw apiReadiness;
    if (!(await verifyApiListener({ api, identity: identities.get(api), prepared }))) {
      throw new Error('local API listener is not owned by spawned API server');
    }
    web = await register(spawnWeb(prepared), 'Web server');
    removeStartupHandlers();
    supervise({ tunnel, api, web }, parent, {
      platform,
      killProcess,
      schedule,
      cancelSchedule,
      identities,
      ownsProcessGroup,
      onCleanup: prepared.cleanup,
    });
    return { tunnel, api, web };
  } catch (error) {
    removeStartupHandlers();
    await beginTeardown();
    await prepared.cleanup?.();
    throw error;
  }
}

export function superviseLiveDev(
  { tunnel, api, web },
  parent = process,
  {
    platform = process.platform,
    killProcess = (pid, signal) => process.kill(pid, signal),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer),
    identities = new Map(),
    ownsProcessGroup = processGroupStillOwned,
    onCleanup = () => {},
  } = {},
) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const children = [web, api, tunnel];
  const handlers = new Map();
  const settled = new Set();
  let stopping = false;
  let forceTimer;
  let cleaned = false;

  const terminateAllExcept = (excluded, signal) => {
    let terminated = false;
    for (const child of children) {
      if (child !== excluded && !settled.has(child)) {
        terminated = terminateProcess(child, signal, { platform, killProcess }) || terminated;
      }
    }
    return terminated;
  };
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    for (const [signal, handler] of handlers) parent.off(signal, handler);
    handlers.clear();
    if (forceTimer !== undefined) {
      cancelSchedule(forceTimer);
      forceTimer = undefined;
    }
    void Promise.resolve(onCleanup());
  };
  const maybeCleanup = () => {
    if (settled.size === children.length && forceTimer === undefined) cleanup();
  };
  const scheduleForceKill = () => {
    if (forceTimer !== undefined) return;
    forceTimer = schedule(async () => {
      forceTimer = undefined;
      for (const child of children) {
        const identity = identities.get(child);
        if (await ownsProcessGroup(identity)) {
          terminateOwnedProcessGroup(identity, 'SIGKILL', { platform, killProcess });
        }
      }
      maybeCleanup();
    }, 3_000);
  };

  for (const signal of signals) {
    const handler = () => {
      if (stopping) return;
      stopping = true;
      parent.exitCode = exitCodeFor(null, signal);
      if (terminateAllExcept(undefined, signal)) scheduleForceKill();
    };
    handlers.set(signal, handler);
    parent.on(signal, handler);
  }

  for (const child of children) {
    child.once('error', () => {
      if (settled.has(child)) return;
      settled.add(child);
      if (!stopping) {
        stopping = true;
        parent.exitCode = 1;
        if (terminateAllExcept(child, 'SIGTERM')) scheduleForceKill();
      }
      maybeCleanup();
    });
    child.once('exit', (code, signal) => {
      if (settled.has(child)) return;
      settled.add(child);
      child.exitCode = code;
      child.signalCode = signal;
      if (!stopping) {
        stopping = true;
        parent.exitCode = exitCodeFor(code, signal);
        if (terminateAllExcept(child, 'SIGTERM')) scheduleForceKill();
      }
      maybeCleanup();
    });
  }
  return cleanup;
}

async function main() {
  const prepared = await prepareLiveDev();
  process.stdout.write('Live production database development configuration: OK\n');
  process.stdout.write(`  Access hostname: ${prepared.hostname}\n`);
  process.stdout.write(`  Local DB port:   ${prepared.tunnelPort}\n`);
  process.stdout.write(`  Runtime pgpass:  ${prepared.runtimePgpassFile}\n`);
  process.stdout.write(`  App origin:      ${prepared.webEnv.STOCK_INSIGHT_APP_ORIGIN}\n`);
  process.stdout.write('  Web sandbox:     DB credentials hidden by bubblewrap\n');
  process.stdout.write('  Mutations:       enabled (real production data)\n');
  if (process.argv.includes('--check')) {
    await prepared.cleanup();
    return;
  }

  try {
    for (const [label, port] of [
      ['tunnel', prepared.tunnelPort],
      ['API', prepared.apiPort],
      ['web', prepared.webPort],
    ]) {
      if (await defaultTcpProbe('127.0.0.1', port)) {
        throw new Error(`local ${label} port is already in use: 127.0.0.1:${port}`);
      }
    }
    await startLiveDev(prepared);
  } catch (error) {
    await prepared.cleanup();
    throw error;
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entry === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
