import { defineConfig, devices } from '@playwright/test';

import baseConfig from './playwright.config';

const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
if (!storageStatePath) {
  throw new Error('PLAYWRIGHT_STORAGE_STATE is required for the release performance gate');
}

export default defineConfig({
  ...baseConfig,
  fullyParallel: false,
  workers: 1,
  projects: [
    {
      name: 'desktop-performance',
      testMatch: /motion-performance\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: 'mobile-performance',
      testMatch: /motion-performance\.spec\.ts$/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
