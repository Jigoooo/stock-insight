import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const visualDirectory = process.env.AUTH_VISUAL_DIR;
const availableServerFnResponse = {
  i: 0,
  o: 0,
  p: {
    k: ['result', 'error', 'context'],
    v: [
      { i: 1, o: 0, p: { k: ['available'], v: [{ s: 2, t: 2 }] }, t: 10 },
      { s: 1, t: 2 },
      { i: 2, o: 0, p: { k: [], v: [] }, t: 10 },
    ],
  },
  t: 10,
};

test.describe('authentication visual review captures', () => {
  test.skip(!visualDirectory, 'AUTH_VISUAL_DIR is required for explicit visual capture');

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const route of ['login', 'signup'] as const) {
      test(`${route} ${colorScheme} reduced-motion capture`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto(`/${route}`);

        const card = page.locator('[data-auth-card]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-auth-shell]')).toBeVisible();
        await expect(page.getByText('Futur Insight', { exact: true })).toBeVisible();
        if (route === 'login') {
          await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
        } else {
          await expect(
            page
              .getByRole('heading', { name: '계정을 설정하세요.' })
              .or(page.getByRole('heading', { name: '가입 완료', exact: true }))
              .or(page.getByRole('heading', { name: '가입 상태를 확인하지 못했습니다.' })),
          ).toBeVisible();
        }

        const cardTransform = await card.evaluate((element) => getComputedStyle(element).transform);
        expect(cardTransform).toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

        await page.screenshot({
          animations: 'disabled',
          fullPage: true,
          path: resolve(
            visualDirectory!,
            `${route}-${testInfo.project.name}-${colorScheme}-reduced.png`,
          ),
        });
      });
    }
  }

  test('signup available form capture', async ({ page }, testInfo) => {
    const colorScheme = testInfo.project.name === 'mobile' ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.route('**/_serverFn/**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify(availableServerFnResponse),
        headers: {
          'content-type': 'application/json',
          'x-tss-serialized': 'true',
        },
        status: 200,
      });
    });
    await page.goto('/signup');

    await expect(page.getByRole('heading', { name: '계정을 설정하세요.' })).toBeVisible();
    await expect(page.getByLabel('사용자 이름')).toBeVisible();
    await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
    await expect(page.getByLabel('비밀번호 확인')).toBeVisible();
    await expect(page.getByLabel('가입 코드')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: resolve(
        visualDirectory!,
        `signup-available-${testInfo.project.name}-${colorScheme}-reduced.png`,
      ),
    });
  });
});
