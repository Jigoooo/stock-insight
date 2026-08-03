import { expect, test, type Page } from '@playwright/test';

async function openPaginationPage(page: Page, currentPage: number) {
  await page.goto(
    `/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=evidence&page=${currentPage}`,
  );
  await page.waitForLoadState('networkidle');
  return page.locator('[data-catalog="location-navigation"]');
}

function expectSearchValues(page: Page, expectedPage: string) {
  const searchParams = new URL(page.url()).searchParams;
  expect(searchParams.get('route-tab')).toBe('evidence');
  expect(searchParams.get('side-route')).toBe('today');
  expect(searchParams.get('breadcrumb')).toBe('evidence');
  expect(searchParams.get('page')).toBe(expectedPage);
}

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
    await page.waitForLoadState('networkidle');

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
    const catalog = await openPaginationPage(page, 3);
    await expect(catalog.locator('[data-pagination-variant]')).toHaveCount(3);
    await catalog
      .locator('[data-pagination-variant="hairline"]')
      .getByRole('link', { name: '4페이지' })
      .click();
    await expect(page).toHaveURL(/page=4/);
    await expect(catalog).toHaveAttribute('data-page', '4');

    expectSearchValues(page, '4');

    const cursor = page.locator('[data-cursor-preview]');
    const cursorAction = cursor.getByRole('button', { name: '다음 기록' });
    await cursorAction.click();
    await Promise.all([
      expect(cursorAction).toBeDisabled(),
      expect(cursorAction).toHaveCSS('cursor', 'default'),
      expect(cursorAction.locator('[data-cursor-spinner]')).toBeVisible(),
      expect(cursorAction.getByText('불러오는 중', { exact: true })).toBeVisible(),
      expect(cursor.locator('[aria-live="polite"]')).toHaveText('불러오는 중'),
    ]);
    await expect(cursor.locator('[aria-live="polite"]')).toHaveText('마지막 기록');
    await expect(cursor).not.toContainText('/ 12');
  });

  test('renders compact ledger controls separately from cursor state', async ({ page }) => {
    const catalog = await openPaginationPage(page, 3);
    const ledger = catalog.locator('[data-pagination-variant="ledger"]');
    const ledgerNavigation = ledger.getByRole('navigation');

    await expect(ledgerNavigation.locator('[data-pagination-page]')).toHaveCount(0);
    await expect(ledgerNavigation.getByRole('link', { name: '이전 페이지' })).toHaveCount(1);
    await expect(ledgerNavigation.getByText('03 / 12', { exact: true })).toHaveCount(1);
    await expect(ledgerNavigation.getByRole('link', { name: '다음 페이지' })).toHaveCount(1);
    await expect(ledgerNavigation.locator('[data-cursor-preview]')).toHaveCount(0);
    await expect(ledger.locator('[data-cursor-preview]')).toHaveCount(1);
    await expect(ledger.locator('[data-cursor-preview]')).not.toContainText('/ 12');
  });

  for (const { currentPage, expectedPages } of [
    { currentPage: 3, expectedPages: ['1', '2', '3', '4', '12'] },
    { currentPage: 4, expectedPages: ['1', '3', '4', '5', '12'] },
    { currentPage: 9, expectedPages: ['1', '8', '9', '10', '12'] },
    { currentPage: 10, expectedPages: ['1', '9', '10', '11', '12'] },
  ]) {
    test(`keeps the numeric page window stable at page ${currentPage}`, async ({ page }) => {
      const catalog = await openPaginationPage(page, currentPage);
      const hairline = catalog.locator('[data-pagination-variant="hairline"]');

      expect(
        await hairline
          .locator('[data-pagination-page]')
          .evaluateAll((links) => links.map((link) => link.getAttribute('data-pagination-page'))),
      ).toEqual(expectedPages);
      await expect(hairline.locator(`[data-pagination-page="${currentPage}"]`)).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  }

  for (const { currentPage, actionName } of [
    { currentPage: 1, actionName: '이전 페이지' },
    { currentPage: 12, actionName: '다음 페이지' },
  ]) {
    test(`keeps the ${actionName} boundary inert at page ${currentPage}`, async ({ page }) => {
      const catalog = await openPaginationPage(page, currentPage);

      for (const variant of ['hairline', 'soft-inset', 'ledger']) {
        const preview = catalog.locator(`[data-pagination-variant="${variant}"]`);
        await expect(preview.getByRole('link', { name: actionName })).toHaveCount(0);
        const boundary = preview.locator(`[aria-disabled="true"][aria-label="${actionName}"]`);
        await expect(boundary).toHaveCount(1);
        await expect(boundary).toHaveAttribute('tabindex', '-1');
      }
    });
  }

  for (const { actionName, expectedPage, variant } of [
    { actionName: '이전 페이지', expectedPage: '3', variant: 'hairline' },
    { actionName: '다음 페이지', expectedPage: '5', variant: 'hairline' },
    { actionName: '이전 페이지', expectedPage: '3', variant: 'ledger' },
    { actionName: '다음 페이지', expectedPage: '5', variant: 'ledger' },
  ]) {
    test(`preserves all search values through ${variant} ${actionName}`, async ({ page }) => {
      const catalog = await openPaginationPage(page, 4);
      const preview = catalog.locator(`[data-pagination-variant="${variant}"]`);

      await preview.getByRole('link', { name: actionName }).click();
      await expect(page).toHaveURL(new RegExp(`page=${expectedPage}`));
      expectSearchValues(page, expectedPage);
    });
  }

  test('moves pagination with keyboard focus and Enter', async ({ page }) => {
    const catalog = await openPaginationPage(page, 3);
    const nextAction = catalog
      .locator('[data-pagination-variant="hairline"]')
      .getByRole('link', { name: '다음 페이지' });

    await nextAction.focus();
    await expect(nextAction).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/page=4/);
    expectSearchValues(page, '4');
  });

  test('removes indicator motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const catalog = await openPaginationPage(page, 3);
    const softInset = catalog.locator('[data-pagination-variant="soft-inset"]');
    const indicator = softInset
      .locator('[aria-current="page"]')
      .locator('[data-pagination-indicator]');

    await expect(indicator).toHaveCount(1);
    const transitionDuration = await indicator.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).transitionDuration),
    );
    expect(transitionDuration).toBeLessThanOrEqual(0.001);
    await expect(indicator).toHaveCSS('transform', 'none');

    await softInset.getByRole('link', { name: '4페이지' }).click();
    const relocatedIndicator = softInset
      .locator('[aria-current="page"]')
      .locator('[data-pagination-indicator]');
    const motionState = await relocatedIndicator.evaluate(async (element) => {
      const transforms = [window.getComputedStyle(element).transform];
      for (let frame = 0; frame < 4; frame += 1) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        transforms.push(window.getComputedStyle(element).transform);
      }
      return {
        hasRunningAnimation: element
          .getAnimations({ subtree: true })
          .some((animation) => animation.playState === 'running'),
        transforms,
      };
    });

    await expect(page).toHaveURL(/page=4/);
    await expect(catalog).toHaveAttribute('data-page', '4');
    expect(motionState.hasRunningAnimation).toBe(false);
    expect(motionState.transforms).toEqual(['none', 'none', 'none', 'none', 'none']);
  });

  test('renders the hairline current page as a bordered rounded rectangle', async ({ page }) => {
    const catalog = await openPaginationPage(page, 3);
    const currentPage = catalog.locator(
      '[data-pagination-variant="hairline"] [aria-current="page"]',
    );

    await expect(currentPage).toHaveCSS('border-top-width', '1px');
    await expect(currentPage).toHaveCSS('border-right-width', '1px');
    await expect(currentPage).toHaveCSS('border-bottom-width', '1px');
    await expect(currentPage).toHaveCSS('border-left-width', '1px');
    await expect(currentPage).not.toHaveCSS('border-radius', '0px');
  });

  test('keeps mobile pagination targets at 44 by 44 without page overflow', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 520, '390px mobile contract');
    const catalog = await openPaginationPage(page, 1);
    const pagination = catalog.locator('[data-pagination-variant="hairline"]');

    const metrics = await pagination.locator('a, [aria-disabled="true"]').evaluateAll((actions) =>
      actions.map((action) => ({
        height: action.getBoundingClientRect().height,
        width: action.getBoundingClientRect().width,
      })),
    );
    expect(metrics.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);

    const pageWidths = await page.evaluate(() => {
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(pageWidths.documentWidth).toBeLessThanOrEqual(pageWidths.viewportWidth);
  });
});
