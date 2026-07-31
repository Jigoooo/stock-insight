#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { constants, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_BRAIN_URL = 'https://insight-api.jigooo.com';
const DEFAULT_PORT = 6100;
const CHILD_ENV_PASSTHROUGH_KEYS = [
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
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
];

function selectChildEnvironment(env) {
  return Object.fromEntries(
    CHILD_ENV_PASSTHROUGH_KEYS.flatMap((key) =>
      typeof env[key] === 'string' ? [[key, env[key]]] : [],
    ),
  );
}

function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function parsePort(value) {
  const raw = value?.trim() || String(DEFAULT_PORT);
  if (!/^\d+$/.test(raw)) throw new Error('VITE_PORT must be an integer from 1 to 65535');
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('VITE_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function parseBrainUrl(value) {
  const raw = value?.trim() || DEFAULT_BRAIN_URL;
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.origin !== DEFAULT_BRAIN_URL ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`STOCK_INSIGHT_BRAIN_URL must equal ${DEFAULT_BRAIN_URL}`);
  }
  return url.origin;
}

async function requirePrivateFile(path, platform, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    throw new Error(`${label} is missing: ${path}`);
  }
  if (!metadata.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  if (platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must have mode 0600 or stricter: ${path}`);
  }
}

async function ensureSessionSecret(path, platform) {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, `${randomBytes(48).toString('base64url')}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  if (platform !== 'win32') await chmod(path, 0o600);
  await requirePrivateFile(path, platform, 'Development session secret');
  const secret = (await readFile(path, 'utf8')).trim();
  if (secret.length < 32) throw new Error(`Development session secret is too short: ${path}`);
}

export async function prepareRemoteDev({
  homeDir = homedir(),
  env = process.env,
  platform = process.platform,
} = {}) {
  if (platform === 'win32') {
    throw new Error('Native Windows is not supported; run this command inside WSL');
  }
  const secretDir = join(homeDir, '.hermes', 'secrets');
  const accessFile =
    env.STOCK_INSIGHT_DEV_ACCESS_ENV_FILE || join(secretDir, 'insight-api-access.env');
  const internalSecretFile =
    env.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE ||
    join(secretDir, 'stock-insight-internal-context.secret');
  const sessionSecretFile =
    env.STOCK_INSIGHT_SESSION_SECRET_FILE || join(secretDir, 'stock-insight-dev-session.secret');

  await requirePrivateFile(accessFile, platform, 'Cloudflare Access environment file');
  await requirePrivateFile(internalSecretFile, platform, 'Internal context secret');

  const access = parseEnvText(await readFile(accessFile, 'utf8'));
  const clientId = access.API_DEV_CLIENT_ID?.trim();
  const clientSecret = access.API_DEV_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      `Cloudflare Access environment file must define API_DEV_CLIENT_ID and API_DEV_CLIENT_SECRET: ${accessFile}`,
    );
  }

  const internalSecret = (await readFile(internalSecretFile, 'utf8')).trim();
  if (internalSecret.length < 32) {
    throw new Error(`Internal context secret is too short: ${internalSecretFile}`);
  }
  await ensureSessionSecret(sessionSecretFile, platform);

  const port = parsePort(env.VITE_PORT);
  const brainUrl = parseBrainUrl(env.STOCK_INSIGHT_BRAIN_URL);
  const childEnv = selectChildEnvironment(env);
  Object.assign(childEnv, {
    NODE_ENV: 'development',
    BROWSER: 'none',
    HOST: '127.0.0.1',
    VITE_PORT: String(port),
    STOCK_INSIGHT_BRAIN_URL: brainUrl,
    STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_ID: clientId,
    STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_SECRET: clientSecret,
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: internalSecretFile,
    STOCK_INSIGHT_SESSION_SECRET_FILE: sessionSecretFile,
    STOCK_INSIGHT_APP_ORIGIN: `http://127.0.0.1:${port}`,
    STOCK_INSIGHT_SIGNUP_ENABLED: 'false',
    STOCK_INSIGHT_MUTATIONS_ENABLED: 'false',
    STOCK_INSIGHT_REMOTE_READ_ONLY: 'true',
  });

  return {
    accessFile,
    internalSecretFile,
    sessionSecretFile,
    childEnv,
    command: {
      executable: process.execPath,
      cwd: fileURLToPath(new URL('../apps/web', import.meta.url)),
      args: [
        fileURLToPath(new URL('../apps/web/node_modules/vite/bin/vite.js', import.meta.url)),
        '--mode',
        'dev',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
    },
  };
}

export function spawnRemoteDev(prepared, spawnProcess = spawn) {
  return spawnProcess(prepared.command.executable, prepared.command.args, {
    cwd: prepared.command.cwd,
    detached: true,
    env: prepared.childEnv,
    stdio: 'inherit',
  });
}

export function superviseChild(
  child,
  parent = process,
  {
    platform = process.platform,
    killProcess = (pid, signal) => process.kill(pid, signal),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer),
  } = {},
) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  let forwardedSignal;
  let forceTimer;
  const handlers = new Map();
  const useProcessGroup = platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0;

  const terminate = (signal) => {
    try {
      if (useProcessGroup) killProcess(-child.pid, signal);
      else if (child.exitCode === null && !child.killed) child.kill(signal);
      else return false;
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };

  const scheduleForceKill = () => {
    if (forceTimer !== undefined) return;
    forceTimer = schedule(() => {
      forceTimer = undefined;
      terminate('SIGKILL');
    }, 3_000);
  };

  const cancelForceKill = () => {
    if (forceTimer === undefined) return;
    cancelSchedule(forceTimer);
    forceTimer = undefined;
  };

  const cleanup = () => {
    for (const [signal, handler] of handlers) parent.off(signal, handler);
    handlers.clear();
  };

  for (const signal of signals) {
    const handler = () => {
      if (forwardedSignal) return;
      forwardedSignal = signal;
      if (terminate(signal)) scheduleForceKill();
    };
    handlers.set(signal, handler);
    parent.on(signal, handler);
  }

  child.once('error', () => {
    cleanup();
    cancelForceKill();
    parent.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    cancelForceKill();
    const terminalSignal = forwardedSignal ?? signal;
    parent.exitCode = terminalSignal ? 128 + (constants.signals[terminalSignal] ?? 0) : (code ?? 1);
  });

  return cleanup;
}

async function main() {
  const prepared = await prepareRemoteDev();
  console.log('Remote development configuration: OK');
  console.log(`  Access credentials: ${prepared.accessFile}`);
  console.log(`  Internal context:   ${prepared.internalSecretFile}`);
  console.log(`  Session secret:     ${prepared.sessionSecretFile}`);
  console.log(`  App origin:         ${prepared.childEnv.STOCK_INSIGHT_APP_ORIGIN}`);
  console.log(`  Brain:              ${prepared.childEnv.STOCK_INSIGHT_BRAIN_URL}`);
  console.log('  Mutations/signup:   disabled');

  if (process.argv.includes('--check')) return;

  const child = spawnRemoteDev(prepared);
  superviseChild(child);
  child.on('error', (error) => {
    console.error(`Failed to start remote development server: ${error.message}`);
  });
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
