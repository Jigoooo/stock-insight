import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

import { resolveDevServerPort } from './apps/web/config/dev-server';
import { assertSafeE2eConfiguration, resolvePlaywrightBaseUrl } from './scripts/e2e-safety.mjs';
import { buildE2eStack } from './scripts/e2e-stack.mjs';

const webRoot = new URL('./apps/web/', import.meta.url).pathname;
const env = loadEnv('dev', webRoot, '');
const serverPort = resolveDevServerPort(process.env.PLAYWRIGHT_PORT ?? env.VITE_PORT);
const baseURL = resolvePlaywrightBaseUrl(process.env, serverPort);
const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === '1';
const excludeMotionPerformance = process.env.PLAYWRIGHT_EXCLUDE_MOTION_PERFORMANCE === '1';
const configuredWorkers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? '', 10);
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 4;
const configuredWorkspaceStorageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const workspaceCredentialsConfigured = Boolean(
  process.env.STOCK_INSIGHT_E2E_USERNAME && process.env.STOCK_INSIGHT_E2E_PASSWORD,
);
const shouldGenerateWorkspaceStorageState =
  !configuredWorkspaceStorageState && workspaceCredentialsConfigured;
const generatedWorkspaceStorageState = fileURLToPath(
  new URL('./test-results/workspace-visual-auth/storage-state.json', import.meta.url),
);
const workspaceStorageState =
  configuredWorkspaceStorageState ??
  (shouldGenerateWorkspaceStorageState ? generatedWorkspaceStorageState : undefined);
const workspaceAuthDependencies = shouldGenerateWorkspaceStorageState
  ? ['workspace-auth-setup']
  : [];

if (shouldGenerateWorkspaceStorageState) {
  process.env.WORKSPACE_VISUAL_STORAGE_STATE = generatedWorkspaceStorageState;
}

function workspaceVisualProject(
  name: string,
  viewport: { width: number; height: number },
  deviceName: 'Desktop Chrome' | 'Pixel 7' = 'Desktop Chrome',
) {
  return {
    name,
    testMatch: /workspace-visual\.spec\.ts$/,
    dependencies: workspaceAuthDependencies,
    use: {
      ...devices[deviceName],
      viewport,
      ...(workspaceStorageState ? { storageState: workspaceStorageState } : {}),
    },
  };
}

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
  ...(useProductionBuild
    ? { NODE_ENV: 'production', HOST: '127.0.0.1' }
    : { PLAYWRIGHT_E2E: '1', VITE_ENABLE_UI_LAB: '1' }),
});

const webServerConfig = {
  command: useProductionBuild
    ? 'node scripts/e2e-server-launcher.mjs web-production'
    : `pnpm --filter @stock-insight/web exec vite --mode dev --host 127.0.0.1 --port ${serverPort} --strictPort`,
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
  testIgnore: excludeMotionPerformance ? /motion-performance\.spec\.ts$/ : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  workers,
  globalTeardown: shouldGenerateWorkspaceStorageState
    ? './e2e/workspace-auth.teardown.ts'
    : undefined,
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /\.spec\.ts$/,
      testIgnore: excludeMotionPerformance
        ? [/workspace-visual\.spec\.ts$/, /motion-performance\.spec\.ts$/]
        : /workspace-visual\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: 'mobile',
      testMatch: /\.spec\.ts$/,
      testIgnore: excludeMotionPerformance
        ? [/workspace-visual\.spec\.ts$/, /motion-performance\.spec\.ts$/]
        : /workspace-visual\.spec\.ts$/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
    ...(shouldGenerateWorkspaceStorageState
      ? [
          {
            name: 'workspace-auth-setup',
            testMatch: /workspace-auth\.setup\.ts$/,
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
    workspaceVisualProject('workspace-expanded', { width: 1440, height: 960 }),
    workspaceVisualProject('workspace-compact', { width: 1180, height: 900 }),
    workspaceVisualProject('workspace-boundary', { width: 768, height: 900 }),
    workspaceVisualProject('workspace-mobile', { width: 390, height: 844 }, 'Pixel 7'),
  ],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1'
      ? undefined
      : brainServerConfig
        ? [brainServerConfig, webServerConfig]
        : webServerConfig,
});
