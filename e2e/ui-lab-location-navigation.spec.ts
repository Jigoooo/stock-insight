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
    await expect(catalog.locator('[data-breadcrumb-variant]')).toHaveCount(3);
    await expect(catalog.locator('[data-breadcrumb-variant] [aria-current="page"]')).toHaveCount(3);

    const nvdaLink = catalog
      .locator('[data-breadcrumb-variant="hairline"]')
      .getByRole('link', { name: 'NVDA' });
    await expect(nvdaLink).toHaveAttribute('href', /breadcrumb=nvda/);
    await nvdaLink.click();
    await expect(page).toHaveURL(/breadcrumb=nvda/);
  });
});
