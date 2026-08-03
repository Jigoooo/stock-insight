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
    cacheDir: `${repoRoot}node_modules/.vite/dialog-system/${process.pid}`,
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

test('removes Dialog and AlertDialog overlays promptly when closing', async ({ page }) => {
  await page.goto(fixtureUrl);

  await page.getByRole('button', { name: 'Form Dialog 열기' }).click();
  const dialogOverlay = page.locator('[data-slot="dialog-overlay"]');
  await expect(dialogOverlay).toBeVisible();
  await page
    .getByRole('dialog', { name: '리서치 설정' })
    .getByRole('button', { name: '취소' })
    .click();
  await expect(dialogOverlay).toHaveCount(0, { timeout: 500 });

  await page.getByRole('button', { name: 'Alert 열기' }).click();
  const alertOverlay = page.locator('[data-slot="dialog-overlay"]');
  await expect(alertOverlay).toBeVisible();
  await page
    .getByRole('alertdialog', { name: '기록을 삭제할까요?' })
    .getByRole('button', { name: '취소' })
    .click();
  await expect(alertOverlay).toHaveCount(0, { timeout: 500 });
});

test('releases page scrolling promptly after Dialog and AlertDialog close', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.addStyleTag({
    content: 'body { min-height: 220vh; place-items: start center; }',
  });

  for (const overlay of [
    {
      close: page
        .getByRole('dialog', { name: '리서치 설정' })
        .getByRole('button', { name: '취소' }),
      open: page.getByRole('button', { name: 'Form Dialog 열기' }),
    },
    {
      close: page
        .getByRole('alertdialog', { name: '기록을 삭제할까요?' })
        .getByRole('button', { name: '취소' }),
      open: page.getByRole('button', { name: 'Alert 열기' }),
    },
  ]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await overlay.open.click();
    await overlay.close.click();
    await page.waitForTimeout(120);

    const lockState = await page.evaluate(() => ({
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      scrollLocked: document.body.hasAttribute('data-scroll-locked'),
    }));
    expect(lockState).toEqual({ bodyPointerEvents: 'auto', scrollLocked: false });

    await page.mouse.wheel(0, 480);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  }
});

test('keeps Dialog action footers visually open without a dividing rule', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.getByRole('button', { name: 'Form Dialog 열기' }).click();

  const footer = page
    .getByRole('dialog', { name: '리서치 설정' })
    .locator('[data-slot="dialog-footer"]');
  await expect(footer).toHaveCSS('border-top-width', '0px');
  await expect(footer).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
