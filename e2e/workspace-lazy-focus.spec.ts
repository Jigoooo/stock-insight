import { expect, test } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const e2eRoot = fileURLToPath(new URL('./', import.meta.url));
const fixtureConfig = resolve(e2eRoot, 'fixtures/workspace-lazy-focus/vite.config.ts');

test.describe('credential-free workspace lazy focus runtime', () => {
  test.describe.configure({ mode: 'serial' });
  let fixtureServer: ViteDevServer;
  let fixtureUrl: string;

  test.beforeAll(async () => {
    fixtureServer = await createServer({ configFile: fixtureConfig, logLevel: 'error' });
    await fixtureServer.listen();
    const address = fixtureServer.httpServer?.address();
    assert(address && typeof address === 'object');
    fixtureUrl = `http://127.0.0.1:${address.port}/`;
  });

  test.afterAll(async () => {
    await fixtureServer.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(fixtureUrl);
  });

  test('ignores duplicate readiness after the real lazy child resolves', async ({ page }) => {
    await page.getByTestId('workspace-nav-deferred').click();
    await expect(page.getByTestId('workspace-lazy-loading')).toBeVisible();
    await expect(page.getByTestId('workspace-deferred-heading')).toHaveCount(0);

    await page.evaluate(() => {
      (
        window as typeof window & { __resolveWorkspaceLazyView: () => void }
      ).__resolveWorkspaceLazyView();
    });

    const heading = page.getByTestId('workspace-deferred-heading');
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.getByTestId('workspace-heading-focus-count')).toHaveText('1');
    await expect(page.getByTestId('workspace-deferred-ready-count')).toHaveText('1');

    const externalTarget = page.getByTestId('workspace-external-focus');
    await externalTarget.focus();
    await expect(externalTarget).toBeFocused();

    await page.getByTestId('workspace-rerender-control').evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error('rerender control is missing');
      button.click();
    });
    await expect(page.getByTestId('workspace-deferred-ready-count')).toHaveText('2');
    await expect(externalTarget).toBeFocused();
    await expect(page.getByTestId('workspace-heading-focus-count')).toHaveText('1');
  });

  test('preserves newer external focus when the deferred child resolves', async ({ page }) => {
    await page.getByTestId('workspace-nav-deferred').click();
    await expect(page.getByTestId('workspace-lazy-loading')).toBeVisible();
    const externalTarget = page.getByTestId('workspace-external-focus');
    await externalTarget.focus();
    await expect(externalTarget).toBeFocused();

    await page.evaluate(() => {
      (
        window as typeof window & { __resolveWorkspaceLazyView: () => void }
      ).__resolveWorkspaceLazyView();
    });

    await expect(page.getByTestId('workspace-deferred-heading')).toBeVisible();
    await expect(externalTarget).toBeFocused();
    await expect(page.getByTestId('workspace-heading-focus-count')).toHaveText('0');
  });
});
