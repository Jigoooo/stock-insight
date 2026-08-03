import { expect, test } from '@playwright/test';

test.describe('UI Lab side navigation', () => {
  test('keeps Side Tab as panel state across three visual directions', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence');

    const catalog = page.locator('[data-catalog="side-tabs"]');
    await expect(catalog.locator('article')).toHaveCount(3);

    const tablist = catalog.getByRole('tablist', { name: '패널 전환 · 세로 레일' });
    const beforeUrl = page.url();
    const companyTab = tablist.getByRole('tab', { name: '기업 메모' });

    await expect(async () => {
      await companyTab.click({ timeout: 1_000 });
      await expect(companyTab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
    await expect(catalog.getByRole('tabpanel', { name: '기업 메모' }).first()).toContainText(
      '기업별 메모',
    );
    expect(page.url()).toBe(beforeUrl);
  });

  test('keeps Side List as route links across three visual directions', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence');

    const catalog = page.locator('[data-catalog="side-lists"]');
    await expect(catalog.locator('article')).toHaveCount(3);

    const navigation = catalog.getByRole('navigation', { name: '경로 목록 · 조용한 행' });
    const holdings = navigation.getByRole('link', { name: '보유 종목' });
    await expect(holdings).toHaveAttribute('href', /side-route=holdings/);
    await holdings.click();

    await expect(page).toHaveURL(/side-route=holdings/);
    await expect(holdings).toHaveAttribute('aria-current', 'page');
  });
});
