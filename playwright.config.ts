import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

import { resolveDevServerPort } from './apps/web/config/dev-server';
import { assertSafeE2eConfiguration, resolvePlaywrightBaseUrl } from './scripts/e2e-safety.mjs';
import { buildE2eStack } from './scripts/e2e-stack.mjs';

const webRoot = new URL('./apps/web/', import.meta.url).pathname;
const env = loadEnv('dev', webRoot, '');
const serverPort = resolveDevServerPort(process.env.PLAYWRIGHT_PORT ?? env.VITE_PORT);
const baseURL = resolvePlaywrightBaseUrl(process.env, serverPort);
const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === '1';
const configuredWorkers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? '', 10);
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 4;
assertSafeE2eConfiguration(process.env);
const serverEnv: Record<string, string> = {};
for (const key of ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ', 'CI'] as const) {
  const value = process.env[key];
  if (typeof value === 'string') serverEnv[key] = value;
}
if (process.env.STOCK_INSIGHT_E2E_SESSION_SECRET_PATH) {
  serverEnv.STOCK_INSIGHT_SESSION_SECRET_FILE = process.env.STOCK_INSIGHT_E2E_SESSION_SECRET_PATH;
}

// Authentication is served by the brain (apps/api-server), not by the BFF.
// When STOCK_INSIGHT_E2E_DATABASE_URL names a disposable QA database we bring
// the brain up alongside the web server so the authenticated specs exercise a
// real login instead of silently skipping.
const apiPort = Number.parseInt(process.env.PLAYWRIGHT_API_PORT ?? '', 10) || serverPort + 1;
const stack = process.env.STOCK_INSIGHT_E2E_DATABASE_URL
  ? buildE2eStack({ env: process.env, webPort: serverPort, apiPort })
  : undefined;
if (stack) {
  Object.assign(serverEnv, stack.webServer.env);
  // The signing secret must not outlive the run.
  for (const signal of ['exit', 'SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => stack.cleanup());
  }
}
Object.assign(serverEnv, {
  PORT: String(serverPort),
  STOCK_INSIGHT_APP_ORIGIN: baseURL,
  ...(useProductionBuild ? { NODE_ENV: 'production', HOST: '127.0.0.1' } : { PLAYWRIGHT_E2E: '1' }),
});

const webServerConfig = {
  command: useProductionBuild
    ? 'node scripts/e2e-server-launcher.mjs web-production'
    : 'node scripts/e2e-server-launcher.mjs web-dev',
  env: serverEnv,
  reuseExistingServer: false,
  timeout: 120_000,
  url: baseURL,
};

// The brain must be listening before the BFF answers a login, so it is listed
// first: Playwright starts webServer entries in order.
const brainServerConfig = stack
  ? {
      command: 'node scripts/e2e-server-launcher.mjs api',
      env: stack.apiServer.env,
      reuseExistingServer: false,
      timeout: 120_000,
      url: stack.apiServer.url,
    }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  workers,
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: 'mobile',
      testMatch: /\.spec\.ts$/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1'
      ? undefined
      : brainServerConfig
        ? [brainServerConfig, webServerConfig]
        : webServerConfig,
});
