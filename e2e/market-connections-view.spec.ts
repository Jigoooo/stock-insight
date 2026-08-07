import { expect, test } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

let fixtureServer: ViteDevServer;
let fixtureUrl: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const fixtureRoot = fileURLToPath(
    new URL('./fixtures/market-connections-view/', import.meta.url),
  );

  fixtureServer = await createServer({
    cacheDir: `${repositoryRoot}node_modules/.vite/market-connections-view/${process.pid}`,
    configFile: false,
    root: fixtureRoot,
    resolve: {
      alias: {
        '@': `${repositoryRoot}apps/web/src`,
        react: `${repositoryRoot}apps/web/node_modules/react`,
        'react-dom': `${repositoryRoot}apps/web/node_modules/react-dom`,
      },
    },
    server: {
      fs: { allow: [repositoryRoot] },
      host: '127.0.0.1',
      port: 25_000 + (process.pid % 10_000),
      strictPort: true,
    },
  });
  await fixtureServer.listen();
  fixtureUrl = fixtureServer.resolvedUrls?.local[0] ?? '';
});

test.afterAll(async () => {
  await fixtureServer.close();
});

test.beforeEach(async ({ page }) => {
  await page.goto(fixtureUrl);
});

test('stacks priority cards at the 1240px layout boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const cards = page.getByRole('button', { name: /시장 변화 상세 열기/ });
  await expect(cards).toHaveCount(3);
  const desktopBoxes = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  );
  assert.equal(Math.round(desktopBoxes[0]!.y), Math.round(desktopBoxes[1]!.y));
  assert.equal(Math.round(desktopBoxes[1]!.y), Math.round(desktopBoxes[2]!.y));

  await page.setViewportSize({ width: 1180, height: 900 });
  const compactBoxes = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  );
  assert(compactBoxes[0]!.y < compactBoxes[1]!.y);
  assert(compactBoxes[1]!.y < compactBoxes[2]!.y);
});

test('ignores stale detail completion and closes back to the latest opener', async ({ page }) => {
  const openerA = page.getByRole('button', { name: '변화 A 시장 변화 상세 열기' });
  const openerB = page.locator('button[aria-label="변화 B 시장 변화 상세 열기"]');
  await openerA.click();
  await openerB.evaluate((element) => element.click());

  await page.evaluate(() => window.__marketConnectionsFixture.resolve('B'));
  const detail = page.getByTestId('market-connection-inspector');
  await expect(detail.getByText('변화 B', { exact: true })).toBeVisible();

  await page.evaluate(() => window.__marketConnectionsFixture.resolve('A'));
  await expect(detail.getByText('변화 B', { exact: true })).toBeVisible();
  await expect(detail.getByText('변화 A', { exact: true })).toHaveCount(0);

  await detail.getByRole('button', { name: '시장 연결 상세 인스펙터 닫기' }).click();
  await expect(detail).toHaveCount(0);
  await expect(openerB).toBeFocused();
});

test('retains failed selection, retries the same key, and restores its opener', async ({
  page,
}) => {
  const openerA = page.locator('button[aria-label="변화 A 시장 변화 상세 열기"]');
  await openerA.click();
  await page.evaluate(() => window.__marketConnectionsFixture.reject('A'));

  await expect(openerA).toHaveAttribute('aria-current', 'true');
  const detail = page.getByTestId('market-connection-inspector');
  await expect(detail.getByText('시장 변화 상세를 불러오지 못했습니다')).toBeVisible();
  await detail.getByRole('button', { name: '다시 불러오기' }).click();
  await page.evaluate(() => window.__marketConnectionsFixture.resolve('A'));
  await expect(detail.getByText('변화 A', { exact: true })).toBeVisible();

  await detail.getByRole('button', { name: '시장 연결 상세 인스펙터 닫기' }).click();
  await expect(detail).toHaveCount(0);
  await expect(openerA).toBeFocused();
});
