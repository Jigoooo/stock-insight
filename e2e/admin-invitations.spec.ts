import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;

test.describe('administrator invitation console', () => {
  test.skip(!username || !password, 'Stock Insight E2E credentials are required');

  test('displays a code once, blocks a member, and persists revocation', async ({
    browser,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'single administrator mutation flow');
    const label = `e2e-owner-${Date.now()}`;
    const memberUsername = `e2e_member_${Date.now()}`;
    const memberPassword = `E2e!${Date.now()}Aa`;

    await page.goto('/login?redirect=%2Fadmin%2Finvitations');
    await page.getByLabel('사용자 이름').fill(username!);
    await page.locator('#login-password').fill(password!);
    await page.getByRole('button', { name: '로그인', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/invitations$/);
    const routeError = page.getByRole('button', { name: 'Show Error' });
    if (await routeError.isVisible()) {
      await routeError.click();
      throw new Error(`Admin route failed: ${await page.locator('body').innerText()}`);
    }
    await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
    await expect(page.getByText('Stock Insight', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '가입 코드 관리' })).toBeVisible();
    await expect(page.getByText('Owner', { exact: true })).toBeVisible();
    const outputRegion = page.getByTestId('admin-invitation-status');
    await expect(outputRegion).toBeAttached();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    await page.getByLabel('메모').fill(label);
    await page.getByRole('combobox', { name: '사용 가능 횟수' }).click();
    await page.getByRole('option', { name: '2회' }).click();
    await page.getByRole('combobox', { name: '유효 기간' }).click();
    await page.getByRole('option', { name: '24시간' }).click();
    await page.getByRole('button', { name: '코드 발급', exact: true }).click();

    await expect(page.getByText('이 코드는 지금 한 번만 표시됩니다.')).toHaveCount(1);
    await expect(outputRegion.locator('code')).toHaveText(/^[A-Za-z0-9_-]{40,}$/);
    await expect(page.locator('[data-toast-id]')).toContainText('가입 코드를 발급했습니다');
    const issuedCode = (await outputRegion.locator('code').textContent())?.trim();
    expect(issuedCode).toBeTruthy();
    await page.getByRole('button', { name: '복사', exact: true }).click();
    await expect(page.locator('[data-toast-id]')).toContainText('가입 코드를 복사했습니다');

    const issuedRow = page.getByRole('row').filter({ hasText: label });
    await expect(issuedRow).toContainText('사용 가능');

    const memberContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL as string,
    });
    try {
      const memberPage = await memberContext.newPage();
      await memberPage.goto('/signup');
      await expect(memberPage.getByRole('heading', { name: '계정을 설정하세요.' })).toBeVisible();
      await memberPage.getByLabel('사용자 이름').fill(memberUsername);
      await memberPage.getByLabel('비밀번호', { exact: true }).fill(memberPassword);
      await memberPage.getByLabel('비밀번호 확인').fill(memberPassword);
      await memberPage.getByLabel('가입 코드').fill(issuedCode!);
      await memberPage.getByRole('button', { name: '계정 만들기' }).click();
      await expect(memberPage).toHaveURL(/\/workspace(?:\?|$)/);

      await memberPage.goto('/admin/invitations');
      await expect(memberPage).toHaveURL(/\/workspace(?:\?|$)/);
      await expect(memberPage.getByRole('heading', { name: '가입 코드 관리' })).toHaveCount(0);
    } finally {
      await memberContext.close();
    }

    await page.reload();
    await expect(page.getByTestId('admin-invitation-status')).toBeAttached();
    await expect(page.getByText('이 코드는 지금 한 번만 표시됩니다.')).toHaveCount(0);
    const plaintextLeaks = await page.evaluate((code) => {
      const controls = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input, textarea, select',
        ),
      );
      return {
        html: document.documentElement.outerHTML.includes(code),
        value: controls.some((control) => control.value.includes(code)),
      };
    }, issuedCode!);
    expect(plaintextLeaks).toEqual({ html: false, value: false });

    const reloadedRow = page.getByRole('row').filter({ hasText: label });
    await reloadedRow.getByRole('button', { name: `${label} 코드 폐기` }).click();
    await expect(reloadedRow).toContainText('폐기됨');
    await expect(outputRegion).toHaveText(`${label} 코드를 폐기했습니다.`);
    await expect(page.locator('[data-toast-id]')).toContainText('가입 코드를 폐기했습니다');
    await expect(page.getByRole('heading', { name: '발급 이력' })).toBeFocused();

    await page.reload();
    const persistedRow = page.getByRole('row').filter({ hasText: label });
    await expect(persistedRow).toContainText('폐기됨');
    await expect(persistedRow.getByRole('button', { name: `${label} 코드 폐기` })).toHaveCount(0);

    await page.goto('/workspace');
    const workspaceRouteError = page.getByRole('button', { name: 'Show Error' });
    if (await workspaceRouteError.isVisible()) {
      await workspaceRouteError.click();
      throw new Error(`Workspace route failed: ${await page.locator('body').innerText()}`);
    }
    await expect(page.getByRole('heading', { name: '오늘 봐야 할 변화' })).toBeVisible();
    await expect(page.getByText('오늘의 신호', { exact: true })).toBeVisible();
  });
});
