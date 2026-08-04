import { expect, test } from '@playwright/test';

test.describe('UI Lab Data & Feedback', () => {
  test('shares Table and virtual DataGrid interactions across A/B/C', async ({ page }) => {
    await page.goto('/__ui-lab');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();
    await page.getByRole('tab', { name: '목업 진행 중', exact: true }).click();
    const catalog = page.locator('[data-slot="data-feedback-catalog"]');

    await catalog.getByRole('tab', { name: 'Table', exact: true }).click();
    await catalog
      .getByRole('button', { name: /근거 펼치기/ })
      .first()
      .click();
    await expect(catalog.getByText('연결 근거')).toHaveCount(3);

    await catalog.getByRole('tab', { name: 'DataGrid', exact: true }).click();
    await expect(catalog.locator('[role="grid"]')).toHaveCount(3);
    await catalog.getByRole('button', { name: '점수 정렬' }).first().click();
    await expect(catalog.locator('[role="columnheader"][aria-sort="ascending"]')).toHaveCount(3);

    const firstGrid = catalog.locator('[role="grid"]').first();
    await firstGrid.locator('[role="gridcell"][data-column="note"]').first().dblclick();
    await firstGrid.getByRole('textbox').fill('다시 확인');
    await firstGrid.getByRole('textbox').press('Enter');
    await expect(catalog.getByText('다시 확인', { exact: true })).toHaveCount(3);

    const mountedRows = await firstGrid.locator('[role="row"]').count();
    expect(mountedRows).toBeGreaterThan(8);
    expect(mountedRows).toBeLessThan(40);
    await firstGrid.locator('[data-slot="data-grid-viewport"]').evaluate((element) => {
      element.scrollTop = 8_800;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(firstGrid.locator('[role="row"][aria-rowindex="201"]')).toBeVisible();
    expect(page.url()).toBe(initialUrl);
  });
});
