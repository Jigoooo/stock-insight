import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootConfigUrl = new URL('../../../playwright.config.ts', import.meta.url);
const performanceConfigUrl = new URL('../../../playwright.performance.config.ts', import.meta.url);
const packageUrl = new URL('../../../package.json', import.meta.url);

describe('Playwright performance isolation', () => {
  it('runs functional projects before a worker-one performance config', async () => {
    const [rootConfig, performanceConfig, packageText] = await Promise.all([
      readFile(rootConfigUrl, 'utf8'),
      readFile(performanceConfigUrl, 'utf8'),
      readFile(packageUrl, 'utf8'),
    ]);
    const scripts = JSON.parse(packageText).scripts as Record<string, string>;

    assert.doesNotMatch(rootConfig, /name:\s*'desktop-performance'/);
    assert.doesNotMatch(rootConfig, /name:\s*'mobile-performance'/);
    assert.match(performanceConfig, /fullyParallel:\s*false/);
    assert.match(performanceConfig, /workers:\s*1/);
    assert.match(performanceConfig, /if \(!storageStatePath\)/);
    assert.match(performanceConfig, /PLAYWRIGHT_STORAGE_STATE is required/);
    assert.match(performanceConfig, /name:\s*'desktop-performance'/);
    assert.match(performanceConfig, /name:\s*'mobile-performance'/);
    assert.match(
      scripts['test:e2e'],
      /--project=desktop --project=mobile.*--config=playwright\.performance\.config\.ts/,
    );
  });
});
