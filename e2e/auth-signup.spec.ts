import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const oldUsername = process.env.PLAYWRIGHT_AUTH_OLD_USERNAME;
const oldPassword = process.env.PLAYWRIGHT_AUTH_OLD_PASSWORD;
const newUsername = process.env.PLAYWRIGHT_AUTH_NEW_USERNAME;
const newPassword = process.env.PLAYWRIGHT_AUTH_NEW_PASSWORD;
const enrollmentCode = process.env.PLAYWRIGHT_AUTH_ENROLLMENT_CODE;
const lifecycleConfigured = Boolean(
  oldUsername && oldPassword && newUsername && newPassword && enrollmentCode,
);

const enrollmentStatusResponse = (available: boolean) => ({
  i: 0,
  o: 0,
  p: {
    k: ['result', 'error', 'context'],
    v: [
      { i: 1, o: 0, p: { k: ['available'], v: [{ s: available ? 2 : 0, t: 2 }] }, t: 10 },
      { s: 1, t: 2 },
      { i: 2, o: 0, p: { k: [], v: [] }, t: 10 },
    ],
  },
  t: 10,
});

async function privateStatus(page: Page): Promise<number> {
  return page.evaluate(async () => (await fetch('/api/status')).status);
}

async function installHeadingReferenceProbe(page: Page) {
  await page.addInitScript(() => {
    const samples: Array<{ count: number; id: string }> = [];
    const capture = () => {
      const main = document.querySelector('main[aria-labelledby]');
      const id = main?.getAttribute('aria-labelledby');
      if (!id) return;
      samples.push({
        count: document.querySelectorAll(`#${CSS.escape(id)}`).length,
        id,
      });
    };

    new MutationObserver(capture).observe(document, {
      attributes: true,
      attributeFilter: ['aria-labelledby'],
      childList: true,
      subtree: true,
    });
    window.addEventListener('DOMContentLoaded', capture);
    Object.assign(window, { __authHeadingReferenceSamples: samples });
  });
}

async function expectUniqueHeadingReference(page: Page) {
  const samples = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __authHeadingReferenceSamples?: Array<{ count: number; id: string }>;
        }
      ).__authHeadingReferenceSamples ?? [],
  );

  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every(({ count }) => count === 1)).toBe(true);
  const main = page.locator('main[aria-labelledby]');
  const headingId = await main.getAttribute('aria-labelledby');
  expect(headingId).not.toBeNull();
  await expect(page.locator(`#${headingId}`)).toHaveCount(1);
}

test.describe('one-time enrollment presentation', () => {
  for (const target of ['available', 'unavailable', 'error'] as const) {
    test(`keeps the checking to ${target} heading reference unique`, async ({ page }) => {
      await installHeadingReferenceProbe(page);
      await page.route('**/_serverFn/**', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (target === 'error') {
          await route.fulfill({ body: 'status unavailable', status: 503 });
          return;
        }
        await route.fulfill({
          body: JSON.stringify(enrollmentStatusResponse(target === 'available')),
          headers: {
            'content-type': 'application/json',
            'x-tss-serialized': 'true',
          },
          status: 200,
        });
      });

      await page.goto('/signup');
      const targetHeading =
        target === 'available'
          ? '계정을 설정하세요.'
          : target === 'unavailable'
            ? '가입 완료'
            : '가입 상태를 확인하지 못했습니다.';
      await expect(page.getByRole('heading', { name: targetHeading, exact: true })).toBeVisible();
      await expectUniqueHeadingReference(page);
    });
  }

  test('uses the same centered auth shell at desktop and mobile widths', async ({ page }) => {
    await page.goto('/signup');

    const card = page.locator('[data-auth-card]');
    await expect(page.locator('[data-auth-shell]')).toBeVisible();
    await expect(card).toBeVisible();
    await expect(page.getByText('Futur Insight', { exact: true })).toBeVisible();
    await expect(page.getByText('One-time workspace setup', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /테마/ })).toHaveCount(0);

    const geometry = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        leftGap: rect.left,
        rightGap: innerWidth - rect.right,
        width: rect.width,
      };
    });
    expect(geometry.width).toBeLessThanOrEqual(420);
    expect(geometry.width).toBeGreaterThanOrEqual(340);
    expect(Math.abs(geometry.leftGap - geometry.rightGap)).toBeLessThanOrEqual(2);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('renders an accessible terminal state or the shared account form', async ({ page }) => {
    await page.goto('/signup');
    const availableHeading = page.getByRole('heading', { name: '계정을 설정하세요.' });
    const unavailableHeading = page.getByRole('heading', { name: '가입 완료', exact: true });
    const errorHeading = page.getByRole('heading', {
      name: '가입 상태를 확인하지 못했습니다.',
    });
    await expect(availableHeading.or(unavailableHeading).or(errorHeading)).toBeVisible();

    if (await availableHeading.isVisible()) {
      const usernameField = page.getByLabel('사용자 이름');
      await expect(usernameField).toBeVisible();
      await expect(
        page.locator('[data-motion="field-shell"]').filter({ has: usernameField }),
      ).toBeVisible();
      await page.getByRole('button', { name: '계정 만들기' }).click();
      await expect(usernameField).toBeFocused();
    } else if (await unavailableHeading.isVisible()) {
      await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: '다시 확인' })).toBeVisible();
    }

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe('one-time local account enrollment lifecycle', () => {
  test.skip(!lifecycleConfigured, 'candidate enrollment credentials are required');

  test('retires static auth, binds the DB account, and blocks re-enrollment', async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'single-use enrollment runs once');

    const staticContext = await browser.newContext();
    const staticPage = await staticContext.newPage();
    await staticPage.goto('/login');
    await staticPage.getByLabel('사용자 이름').fill(oldUsername!);
    await staticPage.locator('#login-password').fill(oldPassword!);
    await staticPage.getByRole('button', { name: '로그인' }).click();
    await expect(staticPage).toHaveURL(/\/workspace(?:\?|$)/);
    expect(await privateStatus(staticPage)).toBe(200);

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: '계정을 설정하세요.' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: '계정 만들기' }).click();
    await expect(page.locator('#signup-username')).toBeFocused();
    await page.getByLabel('사용자 이름').fill(newUsername!);
    await page.getByLabel('비밀번호', { exact: true }).fill(newPassword!);
    await page.getByLabel('비밀번호 확인').fill(newPassword!);
    await page.getByLabel('가입 코드').fill(enrollmentCode!);
    await page.getByRole('button', { name: '계정 만들기' }).click();

    await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
    expect(await privateStatus(page)).toBe(200);
    expect(await privateStatus(staticPage)).toBe(401);

    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    expect(await privateStatus(page)).toBe(401);

    await page.getByLabel('사용자 이름').fill(newUsername!);
    await page.locator('#login-password').fill(newPassword!);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
    expect(await privateStatus(page)).toBe(200);

    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: '가입 완료', exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await context.close();
    await staticContext.close();
  });
});
