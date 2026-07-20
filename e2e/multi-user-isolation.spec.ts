import { expect, test, type Browser, type Page } from '@playwright/test';

// Multi-user A/B isolation. Requires two invitation codes and a signup-enabled
// candidate. Each user signs up through the real /signup UI, logs in, and we
// prove one user's watchlist mutation is invisible to the other. Skip-guarded so
// the suite is a no-op until the canary provides the credentials.
const inviteA = process.env.PLAYWRIGHT_MU_INVITE_A;
const inviteB = process.env.PLAYWRIGHT_MU_INVITE_B;
const usernameA = process.env.PLAYWRIGHT_MU_USERNAME_A;
const usernameB = process.env.PLAYWRIGHT_MU_USERNAME_B;
const passwordA = process.env.PLAYWRIGHT_MU_PASSWORD_A;
const passwordB = process.env.PLAYWRIGHT_MU_PASSWORD_B;
const entityKey = process.env.PLAYWRIGHT_MU_ENTITY_KEY ?? 'KR:005930';

const configured = Boolean(inviteA && inviteB && usernameA && usernameB && passwordA && passwordB);

async function signUp(
  page: Page,
  username: string,
  password: string,
  invite: string,
): Promise<void> {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: '계정을 설정하세요.' })).toBeVisible();
  await page.getByRole('button', { name: '계정 만들기' }).click();
  await page.getByLabel('사용자 이름').fill(username);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel('비밀번호 확인').fill(password);
  await page.getByLabel('가입 코드').fill(invite);
  await page.getByRole('button', { name: '계정 만들기' }).click();
  await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('사용자 이름').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
}

// Add a watchlist item via the authenticated JSON API (same origin as the page).
async function addWatchlist(page: Page, key: string): Promise<number> {
  return page.evaluate(async (k) => {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ entityKey: k, market: 'KR', displayName: 'ISO A' }),
    });
    return res.status;
  }, key);
}

async function watchlistKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const res = await fetch('/api/me/bootstrap');
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { watchlist?: Array<{ entityKey?: string }> } };
    return (body.data?.watchlist ?? []).map((w) => w.entityKey ?? '');
  });
}

test.describe('multi-user A/B data isolation', () => {
  test.skip(!configured, 'two invitation codes + credentials are required');

  test('a watchlist item created by user A is never visible to user B', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      // Both users self-register through the real signup UI.
      await signUp(pageA, usernameA!, passwordA!, inviteA!);
      await signUp(pageB, usernameB!, passwordB!, inviteB!);

      // Re-login to ensure independent authenticated sessions.
      await login(pageA, usernameA!, passwordA!);
      await login(pageB, usernameB!, passwordB!);

      // A adds a watchlist item.
      const addStatus = await addWatchlist(pageA, entityKey);
      expect(addStatus).toBe(200);

      // A sees it; B does not.
      expect(await watchlistKeys(pageA)).toContain(entityKey);
      expect(await watchlistKeys(pageB)).not.toContain(entityKey);

      // B's own private status stays authenticated and independent.
      const bStatus = await pageB.evaluate(async () => (await fetch('/api/status')).status);
      expect(bStatus).toBe(200);

      // After A logs out, A's private API fails closed while B stays valid.
      await pageA.getByRole('button', { name: '로그아웃' }).click();
      await expect(pageA).toHaveURL(/\/login(?:\?|$)/);
      const aAfterLogout = await pageA.evaluate(async () => (await fetch('/api/status')).status);
      expect(aAfterLogout).toBe(401);
      const bStillValid = await pageB.evaluate(async () => (await fetch('/api/status')).status);
      expect(bStillValid).toBe(200);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
