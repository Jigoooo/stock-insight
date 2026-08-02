import { expect, test, type Page } from '@playwright/test';

async function openFileUpload(page: Page) {
  await page.goto('/__ui-lab');
  const categoryButton = page.getByRole('button', { name: 'FileUpload · Dropzone' });

  await expect(async () => {
    await categoryButton.click({ timeout: 1_000 });
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
}

test.describe('UI Lab FileUpload', () => {
  test('shows only the approved A and B directions', async ({ page }) => {
    await openFileUpload(page);
    const comparison = page.locator('section[aria-labelledby="input-action-title"]');
    const hairlineCard = comparison.locator('article[data-direction="hairline"]');
    const insetCard = comparison.locator('article[data-direction="inset"]');
    const railCard = comparison.locator('article[data-direction="rail"]');

    await expect(hairlineCard).toHaveCount(1);
    await expect(hairlineCard.getByRole('heading', { name: '선과 여백 중심' })).toBeVisible();
    await expect(insetCard).toHaveCount(1);
    await expect(insetCard.getByRole('heading', { name: '낮은 음영의 면' })).toBeVisible();
    await expect(railCard).toHaveCount(0);
  });

  test('removes one multiple-selection row and compacts the remaining order', async ({ page }) => {
    await openFileUpload(page);
    const firstCard = page.locator('article[data-direction="hairline"]');
    await firstCard.getByRole('button', { name: '다중' }).click();
    await firstCard.getByRole('button', { name: '선택', exact: true }).click();

    const list = firstCard.getByRole('list', { name: '선택된 파일' });
    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('portfolio-2026-08.csv');

    await firstCard.getByRole('button', { name: 'portfolio-2026-08.csv 삭제' }).click();

    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('earnings-notes.pdf');
    await expect(rows.nth(1)).toContainText('watchlist.xlsx');
  });

  test('keeps opacity feedback without transform motion when reduced motion is requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFileUpload(page);

    const firstCard = page.locator('article[data-direction="hairline"]');
    await firstCard.getByRole('button', { name: '다중' }).click();
    await firstCard.getByRole('button', { name: '선택', exact: true }).click();

    const firstRow = firstCard.getByRole('listitem').first();
    await expect(firstRow).toBeVisible();
    await expect
      .poll(() => firstRow.evaluate((element) => getComputedStyle(element).transform))
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });
});
