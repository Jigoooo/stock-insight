import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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

async function waitForSettledAuthOpacity(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('[data-auth-card]');
        const heading = card?.querySelector<HTMLElement>('h1');
        if (!card || !heading) return false;

        let current: HTMLElement | null = heading;
        while (current) {
          if (Number.parseFloat(getComputedStyle(current).opacity) < 1) return false;
          if (current === card) return true;
          current = current.parentElement;
        }
        return false;
      }),
    )
    .toBe(true);
}

test.describe('authentication visual review captures', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const route of ['login', 'signup'] as const) {
      test(`${route} ${colorScheme} reduced-motion capture`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto(`/${route}`);

        const card = page.locator('[data-auth-card]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-auth-shell]')).toBeVisible();
        await expect(page.getByText('Stock Insight', { exact: true })).toBeVisible();
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

        await waitForSettledAuthOpacity(page);
        const cardTransform = await card.evaluate((element) => getComputedStyle(element).transform);
        expect(cardTransform).toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

        if (visualDirectory) {
          await page.screenshot({
            animations: 'disabled',
            fullPage: true,
            path: resolve(
              visualDirectory,
              `${route}-${testInfo.project.name}-${colorScheme}-reduced.png`,
            ),
          });
        }
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
    await waitForSettledAuthOpacity(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    if (visualDirectory) {
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: resolve(
          visualDirectory,
          `signup-available-${testInfo.project.name}-${colorScheme}-reduced.png`,
        ),
      });
    }
  });
});
