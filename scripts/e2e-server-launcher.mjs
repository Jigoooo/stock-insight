#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_BASE_ENV_KEYS = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'CI'];
const WEB_BASE_ENV_KEYS = ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ', 'CI'];
const MODE_ENV_KEYS = {
  api: [
    'NODE_ENV',
    'HOST',
    'PORT',
    'STOCK_INSIGHT_API_PORT',
    'DATABASE_READ_URL',
    'STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE',
    'STOCK_INSIGHT_LIVE_DATABASE_EXPECTED',
  ],
  'web-dev': [
    'PORT',
    'PLAYWRIGHT_E2E',
    'VITE_ENABLE_UI_LAB',
    'STOCK_INSIGHT_BRAIN_URL',
    'STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET',
    'STOCK_INSIGHT_APP_ORIGIN',
    'STOCK_INSIGHT_SESSION_SECRET_FILE',
  ],
  'web-production': [
    'NODE_ENV',
    'HOST',
    'PORT',
    'STOCK_INSIGHT_BRAIN_URL',
    'STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET',
    'STOCK_INSIGHT_APP_ORIGIN',
    'STOCK_INSIGHT_SESSION_SECRET_FILE',
  ],
};

export function selectServerEnvironment(mode, env = process.env) {
  const modeKeys = MODE_ENV_KEYS[mode];
  if (!modeKeys) throw new Error(`unknown E2E server mode: ${mode}`);
  const baseKeys = mode === 'api' ? API_BASE_ENV_KEYS : WEB_BASE_ENV_KEYS;
  return Object.fromEntries(
    [...baseKeys, ...modeKeys].flatMap((key) =>
      typeof env[key] === 'string' ? [[key, env[key]]] : [],
    ),
  );
}

export function buildServerProcess(mode, env = process.env) {
  const childEnv = selectServerEnvironment(mode, env);
  if (mode === 'api') {
    return { command: process.execPath, args: ['apps/api-server/dist/main.js'], env: childEnv };
  }
  if (mode === 'web-production') {
    return {
      command: process.execPath,
      args: ['apps/web/.output/server/index.mjs'],
      env: childEnv,
    };
  }
  const port = childEnv.PORT;
  if (!port || !/^\d+$/.test(port)) throw new Error('web-dev requires an integer PORT');
  return {
    command: 'pnpm',
    args: [
      '--filter',
      '@stock-insight/web',
      'exec',
      'vite',
      '--mode',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      port,
      '--strictPort',
    ],
    env: childEnv,
  };
}

// `web-production` runs a PREBUILT bundle; it does not build one. Without the
// check below it silently serves whatever `.output` happens to be on disk.
//
// This is not hypothetical. On 2026-08-05 a contrast fix was verified three
// times against an `.output` dated 08-04 00:55 — every one of those "24 passed"
// runs measured the previous day's CSS, and the only reason it surfaced was an
// Axe detail still naming the pre-fix colour. A gate that cannot fail cannot
// verify anything, so a stale build is a hard error here rather than a warning.
export const WEB_BUILD_ENTRY = 'apps/web/.output/server/index.mjs';

// Everything the web bundle is built FROM. `public` is in the list because the
// stale run that motivated this check was a stylesheet under
// `apps/web/public/styles/profiles/`, not a source module.
export const WEB_BUILD_INPUTS = [
  'apps/web/src',
  'apps/web/public',
  'apps/web/vite.config.ts',
  'apps/web/components.json',
  'apps/web/package.json',
  'packages/api-client/src',
  'packages/contracts/src',
];

/**
 * Pure decision, kept apart from the filesystem walk so the failure and success
 * branches are both directly testable.
 *
 * Equal timestamps count as fresh: a source touched DURING a build lands before
 * the bundle is written and cannot be distinguished from one included in it.
 * That narrow hole is left open on purpose — the failure this guards against is
 * a build that is hours or days behind, not one racing an edit.
 */
export function describeBuildFreshness({ buildMtimeMs, newestInput }) {
  const stamp = (ms) => new Date(ms).toISOString();
  const rebuild = 'pnpm --filter @stock-insight/web build';
  if (buildMtimeMs === null) {
    return {
      fresh: false,
      message: `${WEB_BUILD_ENTRY} does not exist. Run: ${rebuild}`,
    };
  }
  if (newestInput !== null && newestInput.mtimeMs > buildMtimeMs) {
    return {
      fresh: false,
      message:
        `${WEB_BUILD_ENTRY} is older than its sources, so this run would measure a stale build.\n` +
        `  build  ${stamp(buildMtimeMs)}  ${WEB_BUILD_ENTRY}\n` +
        `  source ${stamp(newestInput.mtimeMs)}  ${newestInput.path}\n` +
        `Run: ${rebuild}`,
    };
  }
  return { fresh: true, message: null };
}

/** Newest mtime across the given files and directory trees, or null if none exist. */
export function newestInputMtime(paths, cwd = process.cwd()) {
  let newest = null;
  const consider = (path, mtimeMs) => {
    if (newest === null || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs };
  };
  const visit = (relative) => {
    const absolute = join(cwd, relative);
    let entry;
    try {
      entry = statSync(absolute);
    } catch {
      return; // A missing input cannot make the build stale.
    }
    if (entry.isFile()) {
      consider(relative, entry.mtimeMs);
      return;
    }
    if (!entry.isDirectory()) return;
    for (const child of readdirSync(absolute, { withFileTypes: true })) {
      // Nothing generated or vendored can tell us whether OUR sources moved.
      if (child.name === 'node_modules' || child.name.startsWith('.')) continue;
      visit(join(relative, child.name));
    }
  };
  for (const path of paths) visit(path);
  return newest;
}

export function checkWebProductionBuildFreshness(cwd = process.cwd()) {
  let buildMtimeMs = null;
  try {
    buildMtimeMs = statSync(join(cwd, WEB_BUILD_ENTRY)).mtimeMs;
  } catch {
    buildMtimeMs = null;
  }
  return describeBuildFreshness({
    buildMtimeMs,
    newestInput: newestInputMtime(WEB_BUILD_INPUTS, cwd),
  });
}

function main() {
  const mode = process.argv[2];
  if (mode === 'web-production') {
    const freshness = checkWebProductionBuildFreshness();
    if (!freshness.fresh) {
      console.error(`stale web production build: ${freshness.message}`);
      process.exitCode = 1;
      return;
    }
  }
  const spec = buildServerProcess(mode);
  const child = spawn(spec.command, spec.args, {
    cwd: process.cwd(),
    env: spec.env,
    shell: false,
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }
  child.once('error', (error) => {
    console.error(`failed to start ${mode}: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

// argv[1] is absent under `node -e` / `node --import`, and this module is now
// imported as a library (the freshness check). Guard the lookup so importing it
// cannot crash the importer.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) main();
