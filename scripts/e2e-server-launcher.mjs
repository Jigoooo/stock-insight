#!/usr/bin/env node

import { spawn } from 'node:child_process';
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

function main() {
  const mode = process.argv[2];
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
