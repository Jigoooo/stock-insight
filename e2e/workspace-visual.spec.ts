import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * Asset Deep Dive 는 저장소에서 가장 큰 화면(above-the-fold 10항목 + 하위 탭
 * 11개)인데 이 매트릭스 밖에 있었다. 390/768/1180/1440 오버플로 · Axe ·
 * reduced-motion 이 한 번도 돌지 않은 화면이고, UX 헌법 4·1·5 는 릴리스를
 * 막는다. 그래서 부모(above-the-fold)와 자식 탭 하나를 둘 다 넣는다 — 탭
 * 본문은 자식 라우트가 그리므로 부모만 넣으면 절반만 재는 것이 된다.
 *
 * 키를 고정하는 이유. 이 스펙은 목록에서 종목을 찾아 들어가지 않는다.
 * 그러면 재는 대상이 데이터에 따라 달라지고, 실패했을 때 무엇이 깨졌는지
 * 알 수 없다. `KR:005930` 이 없는 데이터베이스에서는 화면이 "패킷이 아직
 * 없습니다" 를 그리며, 그것도 이 매트릭스가 재야 하는 정상 상태다.
 */
const assetRoute = '/workspace/assets/KR:005930';

const routes = [
  '/workspace/today',
  '/workspace/radar',
  '/workspace/stocks',
  '/workspace/history',
  '/workspace/status',
  assetRoute,
  `${assetRoute}/events`,
  '/admin/invitations',
] as const;

const retiredRoutes = [
  ['/workspace/market-topic-news', '/workspace/today'],
  ['/workspace/crypto', '/workspace/today'],
  ['/workspace/themes', '/workspace/radar'],
] as const;

const workspaceViewports = {
  expanded: { width: 1440, height: 960 },
  compact: { width: 1180, height: 900 },
  boundary: { width: 768, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const projectModes = {
  'workspace-expanded': { viewport: 'expanded', shell: 'expanded' },
  'workspace-compact': { viewport: 'compact', shell: 'compact' },
  'workspace-boundary': { viewport: 'boundary', shell: 'compact' },
  'workspace-mobile': { viewport: 'mobile', shell: 'mobile' },
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
  await page.context().clearCookies();
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
const generatedStorageState = process.env.WORKSPACE_VISUAL_STORAGE_STATE;
const hasAuthorizedAuth = Boolean(storageState || generatedStorageState || (username && password));

function currentProjectMode(projectName: string) {
  const mode = projectModes[projectName as keyof typeof projectModes];
  if (!mode) throw new Error(`Unexpected workspace visual project: ${projectName}`);
  return mode;
}

async function gotoAuthenticatedRoute(page: Page, route: string, expectedPath = route) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
  const viewRegion = page.locator('[data-workspace-view-region]');
  if (await viewRegion.count()) await expect(viewRegion).not.toHaveAttribute('aria-busy', 'true');
  await waitForFonts(page);

  const url = new URL(page.url());
  // `KR:005930` 처럼 콜론이 든 경로 파라미터는 라우터가 `%3A` 로 정규화할 수도,
  // 그대로 둘 수도 있다. 둘 다 같은 자원이므로 디코드해서 비교한다.
  const pathname = decodeURIComponent(url.pathname);
  expect(pathname, 'requested route redirected to login').not.toBe('/login');
  expect(pathname, 'requested route must resolve to its canonical workspace path').toBe(
    decodeURIComponent(expectedPath),
  );
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

/**
 * Assert the SETTLED layout does not scroll horizontally.
 *
 * This used to read scrollWidth once, immediately after navigation. At 390px
 * that measured the page mid-mount and failed all 10 routes: sampled every
 * 120ms on /workspace/today, scrollWidth is 398 at t=1219ms and 390 from
 * t=1346ms onward, with zero right-overflowing elements once settled. The
 * assertion was reporting a frame, not a layout.
 *
 * Polling for a stable value is the fix for the measurement. It is NOT a fix
 * for the transient itself — an 8px overshoot at first paint is still real and
 * still tracked (docs/plan/remaining-work-2026-08-05.md F2). Widening the
 * tolerance instead would have hidden both.
 */
async function assertNoHorizontalOverflow(page: Page) {
  const read = async () =>
    page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
  let overflow = await read();
  // Two consecutive identical readings across an animation frame boundary, so a
  // value sampled mid-transition is never the one asserted on.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (overflow.scrollWidth <= overflow.clientWidth + 1) break;
    await page.waitForTimeout(120);
    const next = await read();
    if (next.scrollWidth === overflow.scrollWidth) break;
    overflow = next;
  }
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

async function observePendingLaneMarker(tab: Locator) {
  return tab.evaluate(
    (element) =>
      new Promise<boolean>((resolve) => {
        const finish = (observed: boolean) => {
          observer.disconnect();
          window.clearTimeout(timeout);
          resolve(observed);
        };
        const observer = new MutationObserver(() => {
          if (element.getAttribute('data-pending') === 'true') finish(true);
        });
        const timeout = window.setTimeout(() => finish(false), 2_000);
        observer.observe(element, { attributes: true, attributeFilter: ['data-pending'] });
        (element as HTMLElement).click();
      }),
  );
}

async function skipAfterCanonicalAbsence({
  canonicalTitle,
  reason,
  region,
  target,
}: {
  canonicalTitle: string;
  reason: string;
  region: Locator;
  target: Locator;
}) {
  if ((await target.count()) > 0) return;
  const canonicalState = region
    .locator('[data-kind="empty"], [data-kind="unavailable"]')
    .filter({ hasText: canonicalTitle });
  await expect(canonicalState).toBeVisible();
  test.skip(true, reason);
}

test.describe('authenticated workspace visual matrix', () => {
  test.skip(
    !hasAuthorizedAuth,
    'authenticated matrix skipped: authorized storage state or credentials are absent',
  );

  for (const route of routes) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${route} ${colorScheme} shell, Axe, overflow, and screenshot`, async ({
        page,
      }, testInfo) => {
        const mode = currentProjectMode(testInfo.project.name);
        expect(testInfo.project.use.viewport).toEqual(workspaceViewports[mode.viewport]);
        await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
        await gotoAuthenticatedRoute(page, route);
        await assertShellMode(page, mode.shell);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
          timeout: 20_000,
        });
        await assertNoHorizontalOverflow(page);
        const accessibility = await new AxeBuilder({ page }).analyze();
        expect(accessibility.violations).toEqual([]);
        await capture(
          page,
          testInfo,
          // 콜론은 파일 이름에 쓰기 나쁘다. 기존 경로에는 없으므로 이름이 바뀌는
          // 것은 새로 들어온 자산 경로뿐이다.
          `${route.slice(1).replaceAll('/', '-').replaceAll(':', '-')}-${mode.viewport}-${colorScheme}`,
          [page.locator('time'), page.getByTestId('admin-invitation-status').locator('code')],
        );
      });
    }
  }

  for (const [route, destination] of retiredRoutes) {
    test(`${route} redirects to ${destination} without restoring retired UI`, async ({ page }) => {
      const retiredLoaderRequests: string[] = [];
      page.on('request', (request) => {
        const url = decodeURIComponent(request.url());
        if (!url.includes('/_serverFn/') && !url.includes('/api/')) return;
        const requestShape = `${url}\n${request.postData() ?? ''}`;
        if (
          /v1\/(?:crypto|themes|market-topic-news)|view["'=:\s]+(?:crypto|themes|market-topic-news)/i.test(
            requestShape,
          )
        ) {
          retiredLoaderRequests.push(requestShape);
        }
      });
      await gotoAuthenticatedRoute(page, route, destination);
      await expect(page.getByTestId('workspace-nav-crypto')).toHaveCount(0);
      await expect(page.getByTestId('workspace-nav-themes')).toHaveCount(0);
      expect(retiredLoaderRequests).toEqual([]);
    });
  }

  // reduced-motion 은 위 매트릭스와 **별개 배열**이다. 자산 화면은 깊이
  // accordion 이 열리고 닫히는 유일한 화면이므로 여기에도 들어가야 한다.
  for (const route of [
    '/workspace/today',
    '/workspace/radar',
    '/workspace/stocks',
    `${assetRoute}/events`,
  ] as const) {
    test(`${route} reduced-motion has no running transform animation`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await gotoAuthenticatedRoute(page, route);
      await assertNoTransformAnimation(page);
    });
  }

  test('captures mobile navigation Sheet open', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'workspace-mobile', 'mobile interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/today');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await expect(page.getByRole('dialog', { name: '리서치 탐색 메뉴' })).toBeVisible();
    await capture(page, testInfo, 'workspace-mobile-navigation-open');
  });

  test('captures Today pending lane', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'workspace-expanded', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/today');
    const tab = page.getByRole('tablist', { name: '인사이트 분류' }).getByRole('tab').nth(1);
    const pendingMarkerObserved = await observePendingLaneMarker(tab);
    expect(pendingMarkerObserved).toBe(true);
    await expect(tab).toHaveAttribute('data-pending', 'true');
    await capture(page, testInfo, 'workspace-today-pending-lane');
  });

  test('captures evidence inspector', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'workspace-expanded', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/today');
    const record = page.getByTestId('research-feed-record').first();
    await skipAfterCanonicalAbsence({
      canonicalTitle: '이 분류에는 아직 변화가 없습니다',
      reason: 'canonical empty Today lane has no evidence record',
      region: page.getByTestId('research-feed'),
      target: record,
    });
    await record.click();
    await expect(page.getByTestId('evidence-inspector')).toBeVisible();
    await capture(page, testInfo, 'workspace-evidence-inspector', [page.locator('time')]);
  });

  test('keeps Today feed content across the available row width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'workspace-expanded', 'single layout contract');
    await gotoAuthenticatedRoute(page, '/workspace/today');
    const record = page.getByTestId('research-feed-record').first();
    const emptyState = page
      .getByTestId('research-feed')
      .locator('[data-kind="empty"], [data-kind="unavailable"]');
    await expect(record.or(emptyState)).toBeVisible({ timeout: 20_000 });
    await skipAfterCanonicalAbsence({
      canonicalTitle: '이 분류에는 아직 변화가 없습니다',
      reason: 'canonical empty Today lane has no feed row to measure',
      region: page.getByTestId('research-feed'),
      target: record,
    });

    const [recordBox, labelBox] = await Promise.all([
      record.boundingBox(),
      record.locator('[data-slot="button-label"]').boundingBox(),
    ]);
    expect(recordBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    expect(labelBox!.width).toBeGreaterThan(recordBox!.width * 0.8);
  });

  test('captures Stocks selected row and briefing inspector', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'workspace-expanded', 'single interaction capture');
    await gotoAuthenticatedRoute(page, '/workspace/stocks');
    const stockRegion = page.locator('main');
    const stock = page.getByRole('button', { name: /종목 브리핑 열기/ }).first();
    await skipAfterCanonicalAbsence({
      canonicalTitle: '조건에 맞는 종목이 없습니다',
      reason: 'canonical empty stock table has no selectable stock',
      region: stockRegion,
      target: stock,
    });
    await stock.click();
    await expect(stock).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('stock-briefing-inspector')).toBeVisible();
    await capture(page, testInfo, 'workspace-stocks-selected-briefing', [page.locator('time')]);
  });

  test('captures Radar map fallback when authorized data exposes it', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'workspace-expanded', 'single interaction capture');
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
          if (['webgl', 'webgl2', 'experimental-webgl'].includes(contextId)) return null;
          return Reflect.apply(original, this, [contextId, ...args]);
        },
      });
    });
    await gotoAuthenticatedRoute(page, '/workspace/radar');
    const mapTab = page.getByRole('tab', { name: /지도·글로브/ });
    await expect(mapTab).toHaveCount(1);
    await mapTab.click();
    const mapRegion = page.getByTestId('market-mode-map_globe');
    const fallback = page.getByTestId('geo-fallback-row');
    if ((await fallback.count()) === 0) {
      const unavailable = mapRegion
        .locator('[data-kind="empty"], [data-kind="unavailable"]')
        .filter({
          hasText: /지도 원천이 연결되지 않았습니다|지도에 표시할 위치가 없습니다/,
        });
      await expect(unavailable).toBeVisible();
      test.skip(true, 'canonical empty or unavailable map data has no fallback rows');
    }
    await expect(mapRegion.getByRole('status')).toContainText(
      '지도 렌더링을 사용할 수 없어 근거 표를 유지합니다',
    );
    await capture(page, testInfo, 'workspace-radar-map-fallback', [page.locator('time')]);
  });

  test('captures administrator one-time invitation disclosure without retaining plaintext', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'workspace-expanded',
      'isolated administrator mutation capture',
    );
    await gotoAuthenticatedRoute(page, '/admin/invitations');
    const issueButton = page.getByRole('button', { name: '코드 발급', exact: true });
    await expect(issueButton).toHaveCount(1);
    const label = `visual-matrix-${crypto.randomUUID()}`;
    const dynamicLabel = page.getByText(label, { exact: true });
    let issueAttempted = false;
    try {
      await page.getByLabel('메모').fill(label);
      await issueButton.click();
      issueAttempted = true;
      await expect(page.getByText('이 코드는 지금 한 번만 표시됩니다.')).toHaveCount(1);
      const status = page.getByTestId('admin-invitation-status');
      const code = status.locator('code');
      await expect(code).toHaveText(/^[A-Za-z0-9_-]{40,}$/);
      const plaintext = (await code.textContent())!.trim();
      await capture(page, testInfo, 'admin-invitation-one-time-disclosure', [code, dynamicLabel]);
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
      await capture(page, testInfo, 'admin-invitation-after-disclosure', [dynamicLabel]);
    } finally {
      if (issueAttempted) {
        await page.goto('/admin/invitations');
        const row = page.getByRole('row').filter({
          has: page.getByText(label, { exact: true }),
        });
        await expect(row).toHaveCount(1);
        const revoke = row.getByRole('button', { name: `${label} 코드 폐기` });
        if ((await revoke.count()) === 1) await revoke.click();
        await expect(row).toContainText('폐기됨');
      }
    }
  });
});
