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

async function privateStatus(page: Page): Promise<number> {
  return page.evaluate(async () => (await fetch('/api/status')).status);
}

test.describe('one-time enrollment presentation', () => {
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
      await expect(usernameField).toHaveAttribute('data-motion', 'field');
      await page.getByRole('button', { name: '계정 만들기' }).click();
      await expect(usernameField).toBeFocused();
    } else if (await unavailableHeading.isVisible()) {
      await expect(page.getByRole('link', { name: '로그인' })).toBeVisible();
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
