import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
if (storageState) test.use({ storageState });

test.describe('v3 research workspace candidate', () => {
  test.skip(!storageState, 'PLAYWRIGHT_STORAGE_STATE is required for authenticated candidate QA');

  test('redirects the authenticated root to the v3 workspace', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
    await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
  });

  test('clears the session on logout and protects the workspace again', async ({
    context,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'auth lifecycle is viewport-independent');
    await page.goto('/workspace');
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === '__Host-stock-insight-session')).toBe(false);

    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fworkspace$/);
  });

  test('loads every real-data section with URL state and no layout overflow', async ({
    page,
  }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });

    await page.goto('/workspace?view=today&lane=must_know');
    await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
    await expect(page.getByRole('heading', { name: '오늘 봐야 할 변화' })).toBeVisible();
    await expect(page.getByTestId('research-feed-record').first()).toBeVisible();
    const workspace = page.getByTestId('research-workspace-v3');
    for (const rawToken of ['related_ticker:', 'STAGE:', 'R/R', 'Companyfacts']) {
      await expect(workspace).not.toContainText(rawToken);
    }
    await expect(workspace).toContainText('기대 손익비');

    const sections = [
      ['radar', '세계 레이더'],
      ['stocks', '종목'],
      ['themes', '테마·관계'],
      ['research', '내 리서치'],
      ['history', '판단 이력'],
      ['status', '데이터 상태'],
    ] as const;
    for (const [id, heading] of sections) {
      if (testInfo.project.name === 'mobile') {
        await page.getByRole('button', { name: '메뉴 열기' }).click();
      }
      await page.getByTestId(`workspace-nav-${id}`).click();
      await expect(page).toHaveURL(new RegExp(`view=${id}`));
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }

    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: '메뉴 열기' }).click();
    }
    await page.getByTestId('workspace-nav-themes').click();
    await expect(page.getByTestId('relation-graph')).toBeVisible();
    await expect(page.getByText('관계를 텍스트로 보기')).toBeVisible();
    for (const rawTheme of ['ai_semi', 'megacap_ai', 'electronic_components']) {
      await expect(page.getByTestId('research-workspace-v3')).not.toContainText(rawTheme);
    }
    await expect(page.getByTestId('theme-ledger')).toBeVisible();
    const selectableThemes = page.locator('[data-testid="theme-select"]:not([disabled])');
    const targetTheme = selectableThemes.nth(1);
    const targetThemeName = (await targetTheme.getAttribute('aria-label'))?.replace(
      ' 관계 보기',
      '',
    );
    await targetTheme.click();
    await expect(targetTheme).toHaveAttribute('aria-pressed', 'true');
    if (targetThemeName)
      await expect(page.getByText(`${targetThemeName} 대표 종목에서 시작`)).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(runtimeErrors).toEqual([]);
  });

  test('opens run-bound evidence detail and keeps the inspector accessible', async ({
    page,
  }, testInfo) => {
    await page.goto('/workspace?view=today&lane=must_know');
    const firstRecord = page.getByTestId('research-feed-record').first();
    await expect(firstRecord).toBeVisible();
    await firstRecord.click();
    await expect(page).toHaveURL(/record=/);
    const inspector = page.getByTestId('evidence-inspector');
    await expect(inspector).toBeVisible();
    await expect(page.getByRole('dialog', { name: '근거 인스펙터' })).toBeVisible();
    const closeInspector = inspector.getByRole('button', { name: '인스펙터 닫기' });
    await expect(inspector.getByRole('heading').first()).toBeVisible();
    for (const rawToken of [
      'related_ticker:',
      'STAGE:',
      'R/R',
      'Companyfacts',
      'stock_candidate',
    ]) {
      await expect(inspector).not.toContainText(rawToken);
    }
    await expect(inspector).toContainText('종목 후보 분석');

    if (testInfo.project.name === 'mobile') {
      await expect(closeInspector).toBeFocused();
      await expect(page.getByTestId('workspace-content')).toHaveAttribute('inert', '');
      await expect(page.getByTestId('workspace-sidebar')).toHaveAttribute('inert', '');
      const box = await inspector.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? Infinity).toBeLessThanOrEqual(390);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    } else {
      await expect(page.getByTestId('workspace-content')).not.toHaveAttribute('inert');
      await expect(page.getByTestId('workspace-sidebar')).not.toHaveAttribute('inert');
      await expect(firstRecord).toBeFocused();
    }

    const results = await new AxeBuilder({ page })
      .include('[data-testid="research-workspace-v3"]')
      .analyze();
    expect(results.violations).toEqual([]);

    if (testInfo.project.name === 'mobile') {
      await page.keyboard.press('Shift+Tab');
      expect(await inspector.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden();
    await expect(firstRecord).toBeFocused();
    await expect(page.getByTestId('workspace-content')).not.toHaveAttribute('inert');
  });

  test('supports APG keyboard navigation across feed lanes', async ({ page }) => {
    await page.goto('/workspace');
    const tabs = page.getByRole('tablist', { name: '인사이트 분류' }).getByRole('tab');
    await expect(tabs.first()).toBeEnabled();
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/lane=for_you/);
    await page.keyboard.press('End');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('loads additional Radar and History pages when cursors are available', async ({ page }) => {
    await page.goto('/workspace?view=radar');
    const radarRows = page.getByTestId('radar-row');
    const initialRadarCount = await radarRows.count();
    const radarLoadMore = page.getByTestId('radar-load-more');
    await expect(radarLoadMore).toBeEnabled();
    await radarLoadMore.click();
    await expect.poll(() => radarRows.count()).toBeGreaterThan(initialRadarCount);

    await page.goto('/workspace?view=history');
    await expect(page.getByText(/건 표시 · 전체 \d+건/)).toBeVisible();
    const historyLoadMore = page.getByTestId('history-load-more');
    if (await historyLoadMore.isVisible().catch(() => false)) {
      const historyRows = page.getByTestId('history-row');
      const initialHistoryCount = await historyRows.count();
      await expect(historyLoadMore).toBeEnabled();
      await historyLoadMore.click();
      await expect.poll(() => historyRows.count()).toBeGreaterThan(initialHistoryCount);
    }
  });

  test('supports mobile navigation and keyboard-visible controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only interaction');
    await page.goto('/workspace');
    const sidebar = page.getByTestId('workspace-sidebar');
    const menuButton = page.locator('button[aria-controls="workspace-navigation"]');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    await expect(sidebar).not.toHaveAttribute('aria-hidden');
    await expect(sidebar).not.toHaveAttribute('inert');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => (await sidebar.boundingBox())?.x ?? -999)
      .toBeGreaterThanOrEqual(-1);
    await expect(page.getByTestId('workspace-nav-today')).toBeFocused();
    await expect(page.getByTestId('workspace-content')).toHaveAttribute('inert', '');
    await page.keyboard.press('Shift+Tab');
    expect(await sidebar.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect.poll(async () => (await sidebar.boundingBox())?.x ?? 0).toBeLessThan(-300);
    await expect(menuButton).toBeFocused();
    await expect(page.getByTestId('workspace-content')).not.toHaveAttribute('inert');

    await menuButton.click();
    await expect(page.getByTestId('workspace-nav-status')).toBeVisible();
    await page.getByTestId('workspace-nav-status').click();
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(page.getByRole('heading', { name: '데이터 상태' })).toBeVisible();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['BUTTON', 'INPUT', 'A']).toContain(focused);
  });

  test('keeps the data as-of time visible on mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only freshness contract');
    await page.goto('/workspace?view=status');
    const asOf = page.locator('main header time').first();
    await expect(asOf).toBeVisible();
    await expect(asOf).toContainText('기준 시각');
  });

  test('reflows stock and status tables without horizontal clipping on mobile', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout contract');
    await page.goto('/workspace?view=stocks');
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    const firstStock = table
      .locator('tbody tr')
      .filter({ has: page.locator('td:not([colspan])') })
      .first();
    await expect(firstStock).toBeVisible();

    const layout = await table.evaluate((element) => {
      const wrapper = element.parentElement;
      const cells = Array.from(element.querySelectorAll<HTMLElement>('td:not([colspan])'));
      return {
        wrapperClientWidth: wrapper?.clientWidth ?? 0,
        wrapperScrollWidth: wrapper?.scrollWidth ?? Number.POSITIVE_INFINITY,
        maxRight: Math.max(...cells.map((cell) => cell.getBoundingClientRect().right)),
      };
    });
    expect(layout.wrapperScrollWidth).toBeLessThanOrEqual(layout.wrapperClientWidth + 1);
    expect(layout.maxRight).toBeLessThanOrEqual(390);

    await page.goto('/workspace?view=status');
    const statusTable = page.getByRole('table');
    await expect(statusTable).toBeVisible();
    const statusLayout = await statusTable.evaluate((element) => {
      const wrapper = element.parentElement;
      return {
        wrapperClientWidth: wrapper?.clientWidth ?? 0,
        wrapperScrollWidth: wrapper?.scrollWidth ?? Number.POSITIVE_INFINITY,
      };
    });
    expect(statusLayout.wrapperScrollWidth).toBeLessThanOrEqual(
      statusLayout.wrapperClientWidth + 1,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('renders honest empty, loading, and pagination error states', async ({ page }) => {
    await page.goto('/workspace?view=stocks');
    const search = page.getByRole('textbox', { name: '종목명 또는 티커 검색' });
    await search.fill('존재하지않는종목-qa');
    await expect(page.getByText('조건에 맞는 종목이 없습니다')).toBeVisible();

    await page.goto('/workspace?view=today&lane=for_you');
    const loadMore = page.getByRole('button', { name: '다음 변화 더 보기' });
    await expect(loadMore).toBeEnabled();
    await page.route('**/api/feed**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"qa"}' });
    });
    await loadMore.click();
    await expect(page.getByRole('button', { name: '불러오는 중' })).toBeVisible();
    await expect(page.getByText('다음 페이지를 불러오지 못했습니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });
});
