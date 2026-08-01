import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

let fixtureServer: ViteDevServer;
let fixtureUrl: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const root = fileURLToPath(new URL('./fixtures/dialog-system/', import.meta.url));

  fixtureServer = await createServer({
    configFile: false,
    root,
    resolve: {
      alias: {
        '@': `${repoRoot}apps/web/src`,
        react: `${repoRoot}apps/web/node_modules/react`,
        'react-dom': `${repoRoot}apps/web/node_modules/react-dom`,
      },
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
      host: '127.0.0.1',
      port: 24_000 + (process.pid % 10_000),
      strictPort: true,
    },
  });
  await fixtureServer.listen();
  fixtureUrl = fixtureServer.resolvedUrls?.local[0] ?? '';
});

test.afterAll(async () => {
  await fixtureServer.close();
});

test('form dialog traps focus, closes with Escape, and restores opener focus', async ({ page }) => {
  await page.goto(fixtureUrl);
  const opener = page.getByRole('button', { name: 'Form Dialog 열기' });

  await opener.click();
  const dialog = page.getByRole('dialog', { name: '리서치 설정' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#research-name')).toBeFocused();

  const focusableCount = await dialog
    .locator('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')
    .count();
  for (let index = 0; index < focusableCount + 1; index += 1) await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('alert ignores outside interaction and Escape until an explicit action', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.getByRole('button', { name: 'Alert 열기' }).click();

  const alert = page.getByRole('alertdialog', { name: '기록을 삭제할까요?' });
  await expect(alert).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(alert).toBeVisible();

  await page.mouse.click(4, 4);
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: '취소' }).click();
  await expect(alert).toBeHidden();
});
