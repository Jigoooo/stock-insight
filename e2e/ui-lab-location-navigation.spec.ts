import { expect, test } from '@playwright/test';

test.describe('UI Lab location navigation', () => {
  test('normalizes invalid preview state and renders the 3C catalog', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=invalid&page=99');

    const catalog = page.locator('[data-catalog="location-navigation"]');
    await expect(page.getByRole('heading', { name: 'Breadcrumb · Pagination' })).toBeVisible();
    await expect(catalog).toHaveAttribute('data-breadcrumb', 'evidence');
    await expect(catalog).toHaveAttribute('data-page', '3');
  });

  test('renders three semantic Breadcrumb variants with real links', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=evidence&page=3');

    const catalog = page.locator('[data-catalog="location-navigation"]');
    const variants = catalog.locator('nav[data-breadcrumb-variant]');
    const currentItems = variants.locator('[aria-current="page"]');
    await expect(variants).toHaveCount(3);
    await expect(variants.locator(':scope > ol')).toHaveCount(3);
    await expect(currentItems).toHaveCount(3);
    expect(
      await currentItems.evaluateAll((items) => items.every((item) => item.tagName !== 'A')),
    ).toBe(true);

    const ledger = catalog.locator('nav[data-breadcrumb-variant="ledger"]');
    const collapsedText = ledger.getByText('중간 경로 1개 생략', { exact: true });
    const collapsedItem = collapsedText.locator('xpath=ancestor::li[1]');
    await expect(collapsedText).toBeAttached();
    await expect(collapsedItem).toContainText('…');
    await expect(collapsedItem.getByRole('link')).toHaveCount(0);

    const nvdaLink = catalog
      .locator('[data-breadcrumb-variant="hairline"]')
      .getByRole('link', { name: 'NVDA' });
    await expect(nvdaLink).toHaveAttribute('href', /breadcrumb=nvda/);
    await nvdaLink.click();
    await expect(page).toHaveURL(/breadcrumb=nvda/);

    const searchParams = new URL(page.url()).searchParams;
    expect(searchParams.get('route-tab')).toBe('evidence');
    expect(searchParams.get('side-route')).toBe('today');
    expect(searchParams.get('breadcrumb')).toBe('nvda');
    expect(searchParams.get('page')).toBe('3');
  });

  test('moves numeric pages and separates cursor state from page totals', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=evidence&page=3');
    await page.waitForLoadState('networkidle');

    const catalog = page.locator('[data-catalog="location-navigation"]');
    await expect(catalog.locator('[data-pagination-variant]')).toHaveCount(3);
    await catalog
      .locator('[data-pagination-variant="hairline"]')
      .getByRole('link', { name: '4페이지' })
      .click();
    await expect(page).toHaveURL(/page=4/);
    await expect(catalog).toHaveAttribute('data-page', '4');

    const searchParams = new URL(page.url()).searchParams;
    expect(searchParams.get('route-tab')).toBe('evidence');
    expect(searchParams.get('side-route')).toBe('today');
    expect(searchParams.get('breadcrumb')).toBe('evidence');
    expect(searchParams.get('page')).toBe('4');

    const cursor = page.locator('[data-cursor-preview]');
    const cursorAction = cursor.getByRole('button', { name: '다음 기록' });
    await cursorAction.click();
    await expect(cursorAction).toBeDisabled();
    await expect(cursorAction).toHaveCSS('cursor', 'default');
    await expect(cursor.getByText('불러오는 중')).toBeVisible();
    await expect(cursor.getByText('마지막 기록')).toBeVisible();
    await expect(cursor).not.toContainText('/ 12');
  });

  test('keeps pagination boundaries inert and the page within the viewport', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=evidence&page=1');

    const catalog = page.locator('[data-catalog="location-navigation"]');
    const previousActions = catalog.getByRole('link', { name: '이전 페이지' });
    const disabledPreviousActions = catalog.locator(
      '[data-pagination-variant] [aria-disabled="true"][aria-label="이전 페이지"]',
    );
    await expect(previousActions).toHaveCount(0);
    await expect(disabledPreviousActions).toHaveCount(3);

    const metrics = await page.evaluate(() => {
      const action = document.querySelector<HTMLElement>('[data-pagination-variant] a');
      return {
        actionHeight: action?.getBoundingClientRect().height ?? 0,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(metrics.actionHeight).toBeGreaterThanOrEqual(
      (page.viewportSize()?.width ?? 0) <= 520 ? 44 : 32,
    );
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  });
});
