import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

import { resolveDevServerPort } from './apps/web/config/dev-server';

const webRoot = new URL('./apps/web/', import.meta.url).pathname;
const env = loadEnv('dev', webRoot, '');
const serverPort = resolveDevServerPort(process.env.PLAYWRIGHT_PORT ?? env.VITE_PORT);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${serverPort}`;
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
const generatedWorkspaceStorageState = new URL(
  './test-results/workspace-visual-auth/storage-state.json',
  import.meta.url,
).pathname;
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
      : {
          command: useProductionBuild
            ? `cd apps/web && env NODE_ENV=production HOST=127.0.0.1 PORT=${serverPort} DATABASE_URL="\${DATABASE_URL:-postgresql://research_app@127.0.0.1:55432/research_app}" STOCK_INSIGHT_APP_ORIGIN=${baseURL} STOCK_INSIGHT_SESSION_SECRET_FILE="$STOCK_INSIGHT_E2E_SESSION_SECRET_PATH" node .output/server/index.mjs`
            : `env PLAYWRIGHT_E2E=1 pnpm --filter @stock-insight/web exec vite --mode dev --host 127.0.0.1 --port ${serverPort} --strictPort`,
          reuseExistingServer: useProductionBuild ? false : !process.env.CI,
          timeout: 120_000,
          url: baseURL,
        },
});
