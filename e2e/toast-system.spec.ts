import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

let fixtureServer: ViteDevServer;
let fixtureUrl: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const root = fileURLToPath(new URL('./fixtures/toast-system/', import.meta.url));

  fixtureServer = await createServer({
    configFile: `${root}vite.config.ts`,
    root,
    server: {
      host: '127.0.0.1',
      port: 34_000 + (process.pid % 10_000),
      strictPort: true,
    },
  });
  await fixtureServer.listen();
  fixtureUrl = fixtureServer.resolvedUrls?.local[0] ?? '';
});

test.afterAll(async () => {
  await fixtureServer.close();
});

test('renders four layouts, updates progress in place, and resolves critical retry', async ({
  page,
}) => {
  await page.goto(fixtureUrl);
  await page.getByRole('button', { name: '네 가지 Toast 열기' }).click();

  const toasts = page.locator('[data-sonner-toast]');
  await expect(toasts).toHaveCount(4);
  for (const kind of ['status', 'action', 'progress', 'critical']) {
    await expect(page.locator(`[data-kind="${kind}"]`)).toHaveCount(1);
  }

  const progressToast = page
    .locator('[data-sonner-toast]')
    .filter({ has: page.locator('[data-kind="progress"]') });
  await progressToast.evaluate((element) => {
    element.setAttribute('data-progress-identity', 'original');
  });
  await page.getByRole('button', { name: 'Progress 완료' }).click();
  const updatedProgressToast = page.locator('[data-progress-identity="original"]');
  await expect(updatedProgressToast.getByText('리서치 데이터를 불러왔습니다.')).toBeVisible();
  await expect(updatedProgressToast).toHaveCount(1);

  const critical = page.locator('[data-kind="critical"]');
  await critical.getByRole('button', { name: '다시 시도' }).click();
  await expect(critical).toHaveAttribute('data-retry-state', 'pending');
  await expect(critical.getByText('다시 시도 중')).toBeVisible();
  await expect(critical).toHaveAttribute('data-retry-state', 'success');
  await expect(critical.getByText('연결을 복구했습니다.')).toBeVisible();

  await page.bringToFront();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(12, viewport.height - 12);
  await expect(page.getByText('관심 후보를 저장했습니다.')).toHaveCount(0, {
    timeout: 10_000,
  });
});

test('dismisses an action toast with Sonner swipe handling', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.getByRole('button', { name: 'Action Toast 열기' }).click();

  const actionToast = page
    .locator('[data-sonner-toast]')
    .filter({ has: page.locator('[data-kind="action"]') });
  await expect(actionToast).toBeVisible();
  const actionSurface = actionToast.locator('[data-kind="action"]');
  const box = await actionSurface.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await actionSurface.hover({ position: { x: 8, y: box.height - 8 } });
  await page.mouse.down();
  await page.mouse.move(box.x + 48, box.y + box.height - 8, { steps: 3 });
  await expect(actionToast).toHaveAttribute('data-swiping', 'true');
  await page.mouse.move(box.x + box.width - 3, box.y + 3, { steps: 12 });
  await page.mouse.up();
  await expect(actionToast).toHaveCount(0);
});
