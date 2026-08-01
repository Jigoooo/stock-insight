import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

import { assertSafeE2eConfiguration } from './e2e-safety.mjs';

// Login, session issuance and every workspace read live in the brain
// (apps/api-server). apps/web is a BFF that holds no database credentials and
// reaches the brain over STOCK_INSIGHT_BRAIN_URL. Playwright therefore has to
// run BOTH processes: with the brain missing, authenticated specs just sit on
// /login?redirect=... and skip, so auth is never actually covered.

const SAFE_PASSTHROUGH_KEYS = ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ', 'CI'];

function selectBaseEnv(env) {
  const selected = {};
  for (const key of SAFE_PASSTHROUGH_KEYS) {
    const value = env[key];
    if (typeof value === 'string') selected[key] = value;
  }
  return selected;
}

export function buildE2eStack({ env = process.env, webPort = 6100, apiPort = 6200 } = {}) {
  const databaseUrl = env.STOCK_INSIGHT_E2E_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('STOCK_INSIGHT_E2E_DATABASE_URL is required to run the E2E stack');
  }
  // Reuse the single safety gate so the brain can never be pointed at the live
  // research_app, whatever host/port/scheme spelling is used to reach it.
  assertSafeE2eConfiguration({ DATABASE_URL: databaseUrl });

  const baseEnv = selectBaseEnv(env);
  // A per-run secret: the BFF and the brain must agree, and nothing from the
  // developer's live-mode shell may influence it.
  const internalContextSecret = randomBytes(32).toString('hex');
  // The brain only reads this secret from a file, so materialise a private
  // 0600 one per run. It carries no production value — it is generated here and
  // discarded with the run.
  const accountHome = userInfo().homedir;
  const secretRoot = join(accountHome, '.hermes', 'run', 'stock-insight-e2e-stack');
  mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
  chmodSync(secretRoot, 0o700);
  for (const path of [
    accountHome,
    join(accountHome, '.hermes'),
    join(accountHome, '.hermes', 'run'),
    secretRoot,
  ]) {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`E2E secret directory chain must contain only directories: ${path}`);
    }
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
      throw new Error(`E2E secret directory chain must be owned by the current user: ${path}`);
    }
    if ((metadata.mode & 0o022) !== 0) {
      throw new Error(`E2E secret directory chain must not be group- or world-writable: ${path}`);
    }
  }
  const secretDir = mkdtempSync(join(secretRoot, 'run-'));
  chmodSync(secretDir, 0o700);
  const internalContextSecretFile = join(secretDir, 'internal-context.secret');
  try {
    const secretFd = openSync(
      internalContextSecretFile,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(secretFd, `${internalContextSecret}\n`, 'utf8');
      fchmodSync(secretFd, 0o600);
      const metadata = fstatSync(secretFd);
      if ((metadata.mode & 0o077) !== 0) throw new Error('E2E secret file must have mode 0600');
    } finally {
      closeSync(secretFd);
    }
  } catch (error) {
    rmSync(secretDir, { recursive: true, force: true });
    throw error;
  }
  // Without this every run leaves a live signing secret behind in the temp
  // root; they accumulate indefinitely and each one stays readable to the user.
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    rmSync(secretDir, { recursive: true, force: true });
  };
  const brainUrl = `http://127.0.0.1:${apiPort}`;

  const apiServer = {
    port: apiPort,
    command: `pnpm --filter @stock-insight/api-server exec node dist/main.js`,
    url: `${brainUrl}/health`,
    env: {
      ...baseEnv,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      // main.ts binds env.port, which parseApiServerEnv reads from PORT.
      PORT: String(apiPort),
      STOCK_INSIGHT_API_PORT: String(apiPort),
      DATABASE_READ_URL: databaseUrl,
      STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: internalContextSecretFile,
      // Explicitly OFF: the live-database guard must never engage for a
      // disposable QA database, and no live pgpass may follow us in.
      STOCK_INSIGHT_LIVE_DATABASE_EXPECTED: 'false',
    },
  };

  const webServer = {
    port: webPort,
    env: {
      ...baseEnv,
      STOCK_INSIGHT_BRAIN_URL: brainUrl,
      STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET: internalContextSecret,
      STOCK_INSIGHT_APP_ORIGIN: `http://127.0.0.1:${webPort}`,
    },
  };

  return {
    apiServer,
    webServer,
    internalContextSecret,
    internalContextSecretFile,
    brainUrl,
    cleanup,
  };
}
