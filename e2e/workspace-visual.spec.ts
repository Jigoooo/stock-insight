import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

const routes = [
  '/workspace/today',
  '/workspace/radar',
  '/workspace/stocks',
  '/workspace/crypto',
  '/workspace/themes',
  '/workspace/research',
  '/workspace/history',
  '/workspace/status',
  '/admin/invitations',
] as const;

const workspaceViewports = {
  expanded: { width: 1440, height: 960 },
  compact: { width: 1180, height: 900 },
  boundary: { width: 768, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const projectModes = {
  desktop: { viewport: 'expanded', shell: 'expanded' },
  'workspace-compact': { viewport: 'compact', shell: 'compact' },
  'workspace-boundary': { viewport: 'boundary', shell: 'compact' },
  mobile: { viewport: 'mobile', shell: 'mobile' },
} as const;

const rejectedLoginResponse = {
  i: 0,
  o: 0,
  p: {
    k: ['result', 'error', 'context'],
    v: [
      {
        i: 1,
        o: 0,
        p: {
          k: ['ok', 'error'],
          v: [
            { s: 3, t: 2 },
            { s: '아이디 또는 비밀번호를 확인해 주세요.', t: 1 },
          ],
        },
        t: 10,
      },
      { s: 1, t: 2 },
      { i: 2, o: 0, p: { k: [], v: [] }, t: 10 },
    ],
  },
  t: 10,
};

async function waitForFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

async function capture(page: Page, testInfo: TestInfo, name: string, mask: Locator[] = []) {
  await page.addStyleTag({
    content: '*, *::before, *::after { caret-color: transparent !important; }',
  });
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    mask,
    path: testInfo.outputPath(`${name}.png`),
  });
}

test('public login pending-to-error capture remains credential-free', async ({
  page,
}, testInfo) => {
  let releaseLogin!: () => void;
  const loginCanFinish = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await loginCanFinish;
    await route.fulfill({
      body: JSON.stringify(rejectedLoginResponse),
      headers: { 'content-type': 'application/json', 'x-tss-serialized': 'true' },
      status: 401,
    });
  });
  await page.goto('/login');
  await waitForFonts(page);
  await page.getByLabel('사용자 이름').fill('visual-review-user');
  await page.getByRole('textbox', { name: '비밀번호', exact: true }).fill('visual-review-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('계정 정보를 확인하고 있습니다.');
  await capture(page, testInfo, `login-${testInfo.project.name}-pending`);
  releaseLogin();
  await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호를 확인해 주세요.');
  await capture(page, testInfo, `login-${testInfo.project.name}-error`);
});

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;
const hasAuthorizedAuth = Boolean(storageState || (username && password));
let authenticatedCookies: Parameters<BrowserContext['addCookies']>[0] = [];

function currentProjectMode(projectName: string) {
  const mode = projectModes[projectName as keyof typeof projectModes];
  if (!mode) throw new Error(`Unexpected workspace visual project: ${projectName}`);
  return mode;
}

async function gotoAuthenticatedRoute(page: Page, route: (typeof routes)[number]) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
  const viewRegion = page.locator('[data-workspace-view-region]');
  if (await viewRegion.count()) await expect(viewRegion).not.toHaveAttribute('aria-busy', 'true');
  await waitForFonts(page);

  const url = new URL(page.url());
  expect(url.pathname, 'requested route redirected to login').not.toBe('/login');
  expect(url.pathname, 'requested route must remain active').toBe(route);
}

async function assertShellMode(page: Page, shell: 'expanded' | 'compact' | 'mobile') {
  const workspace = page.getByTestId('research-workspace-v3');
  await expect(workspace).toHaveAttribute('data-navigation-mode', shell);
  if (shell === 'mobile') {
    await expect(page.getByTestId('workspace-sidebar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeVisible();
    return;
  }
  await expect(page.getByTestId('workspace-sidebar')).toHaveAttribute(
    'data-navigation-mode',
    shell,
  );
  await expect(page.getByRole('button', { name: '메뉴 열기' })).toHaveCount(0);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function assertNoTransformAnimation(page: Page) {
  const forbiddenTransformAnimations = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === 'running')
        .filter((animation) => {
          const effect = animation.effect;
          return effect instanceof KeyframeEffect
            ? effect.getKeyframes().some((frame) => typeof frame.transform === 'string')
            : false;
        }).length,
  );
  expect(forbiddenTransformAnimations).toBe(0);
}

test.describe('authenticated workspace visual matrix', () => {
  if (storageState) test.use({ storageState });
  test.skip(
    !hasAuthorizedAuth,
    'authenticated matrix skipped: authorized storage state or credentials are absent',
  );

  test.beforeAll(async ({ browser }, testInfo) => {
    if (storageState) return;
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
    const page = await context.newPage();
    await page.goto('/login?redirect=%2Fworkspace%2Ftoday');
    await page.getByLabel('사용자 이름').fill(username!);
    await page.locator('#login-password').fill(password!);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/today$/);
    authenticatedCookies = (await context.storageState()).cookies;
    await context.close();
  });

  test.beforeEach(async ({ context }) => {
    if (!storageState) await context.addCookies(authenticatedCookies);
  });

  for (const route of routes) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${route} ${colorScheme} shell, Axe, overflow, and screenshot`, async ({
        page,
      }, testInfo) => {
        const mode = currentProjectMode(testInfo.project.name);
        expect(testInfo.project.use.viewport).toEqual(workspaceViewports[mode.viewport]);
        await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
        await gotoAuthenticatedRoute(page, route);
        await assertNoHorizontalOverflow(page);
        await assertShellMode(page, mode.shell);
        const accessibility = await new AxeBuilder({ page }).analyze();
        expect(accessibility.violations).toEqual([]);
        await capture(
          page,
          testInfo,
          `${route.slice(1).replaceAll('/', '-')}-${mode.viewport}-${colorScheme}`,
          [page.locator('time'), page.getByTestId('admin-invitation-status').locator('code')],
        );
      });
    }
  }

  for (const route of [
    '/workspace/today',
    '/workspace/radar',
    '/workspace/stocks',
    '/workspace/themes',
  ] as const) {
    test(`${route} reduced-motion has no running transform animation`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await gotoAuthenticatedRoute(page, route);
      await assertNoTransformAnimation(page);
    });
  }

  test('captures mobile navigation Sheet open', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/today');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await expect(page.getByRole('dialog', { name: '리서치 탐색 메뉴' })).toBeVisible();
    await capture(page, testInfo, 'workspace-mobile-navigation-open');
  });

  test('captures Today pending lane', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/today');
    const tab = page.getByRole('tablist', { name: '인사이트 분류' }).getByRole('tab').nth(1);
    await tab.evaluate((element: HTMLElement) => element.click());
    const pendingVisible = (await tab.getAttribute('data-pending')) === 'true';
    test.skip(!pendingVisible, 'current route settled before the pending lane could be captured');
    await capture(page, testInfo, 'workspace-today-pending-lane');
  });

  test('captures evidence inspector', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/today');
    const record = page.getByTestId('research-feed-record').first();
    test.skip((await record.count()) === 0, 'current authorized data has no evidence record');
    await record.click();
    await expect(page.getByTestId('evidence-inspector')).toBeVisible();
    await capture(page, testInfo, 'workspace-evidence-inspector', [page.locator('time')]);
  });

  test('captures Stocks selected row and deep dive', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/stocks');
    const stock = page.getByLabel('종목 커버리지 표 가로 스크롤 영역').getByRole('button').first();
    test.skip((await stock.count()) === 0, 'current authorized data has no selectable stock');
    await stock.click();
    await expect(stock).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('stock-deep-dive-region')).toBeVisible();
    await capture(page, testInfo, 'workspace-stocks-selected-deep-dive', [page.locator('time')]);
  });

  test('captures Themes relation graph and accessible text fallback', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/themes');
    test.skip(
      (await page.getByTestId('relation-graph').count()) === 0,
      'current data has no relation graph',
    );
    const fallback = page.getByRole('button', { name: '관계를 텍스트로 보기' });
    if ((await fallback.getAttribute('aria-expanded')) !== 'true') await fallback.click();
    await expect(page.getByRole('list', { name: '관계 근거 목록' })).toBeVisible();
    await capture(page, testInfo, 'workspace-themes-graph-text-fallback');
  });

  test('captures Radar map fallback when authorized data exposes it', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/radar');
    const mapTab = page.getByRole('tab', { name: /지도·글로브/ });
    test.skip(
      (await mapTab.count()) === 0 || (await mapTab.isDisabled()),
      'current data has no map mode',
    );
    await mapTab.click();
    const fallback = page.getByTestId('geo-fallback-row');
    test.skip(
      (await fallback.count()) === 0,
      'current data does not expose the Radar map fallback',
    );
    await capture(page, testInfo, 'workspace-radar-map-fallback', [page.locator('time')]);
  });

  test('captures administrator one-time invitation disclosure without retaining plaintext', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'isolated administrator mutation capture');
    await gotoAuthenticatedRoute(page, '/admin/invitations');
    const issueButton = page.getByRole('button', { name: '코드 발급', exact: true });
    test.skip((await issueButton.count()) === 0, 'authorized account cannot manage invitations');
    const label = `visual-matrix-${Date.now()}`;
    await page.getByLabel('메모').fill(label);
    await issueButton.click();
    const status = page.getByTestId('admin-invitation-status');
    const code = status.locator('code');
    await expect(code).toHaveText(/^[A-Za-z0-9_-]{40,}$/);
    const plaintext = (await code.textContent())!.trim();
    await capture(page, testInfo, 'admin-invitation-one-time-disclosure', [code]);
    await page.reload();
    await expect(page.getByText('이 코드는 지금 한 번만 표시됩니다.')).toHaveCount(0);
    expect(
      await page.evaluate((value) => {
        const controls = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            'input, textarea, select',
          ),
        );
        return {
          controlValue: controls.some((control) => control.value.includes(value)),
          html: document.documentElement.outerHTML.includes(value),
          localStorage: Object.values(localStorage).some((entry) => entry.includes(value)),
          sessionStorage: Object.values(sessionStorage).some((entry) => entry.includes(value)),
        };
      }, plaintext),
    ).toEqual({
      controlValue: false,
      html: false,
      localStorage: false,
      sessionStorage: false,
    });
    await capture(page, testInfo, 'admin-invitation-after-disclosure');
    const row = page.getByRole('row').filter({ hasText: label });
    await row.getByRole('button', { name: `${label} 코드 폐기` }).click();
    await expect(row).toContainText('폐기됨');
  });
});
