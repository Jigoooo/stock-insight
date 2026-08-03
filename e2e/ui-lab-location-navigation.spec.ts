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
});
