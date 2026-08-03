import { expect, test } from '@playwright/test';

test.describe('UI Lab navigation tabs', () => {
  test('keeps the approved Soft Inset surface around the list and selected tab', async ({
    page,
  }) => {
    await page.goto('/__ui-lab?route-tab=evidence');

    const list = page.getByRole('tablist', { name: '화면 탭 비교 · 소프트 인셋' });
    const activeTab = list.getByRole('tab', { selected: true });
    const activeItem = activeTab.locator('..');
    const indicator = activeItem.locator('[data-slot="motion-highlight"]');

    await expect(list).toHaveCSS('padding-top', '3px');
    await expect(list).toHaveCSS('border-top-width', '1px');
    await expect(list).toHaveCSS('border-radius', '10px');
    await expect(list).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await expect(indicator).toHaveCSS('padding-top', '0px');
    await expect(indicator).toHaveCSS('border-top-width', '1px');
    await expect(indicator).toHaveCSS('border-radius', '8px');
    await expect(indicator).toHaveCSS('box-shadow', 'none');

    const [activeItemBox, indicatorBox] = await Promise.all([
      activeItem.boundingBox(),
      indicator.boundingBox(),
    ]);
    expect(activeItemBox).not.toBeNull();
    expect(indicatorBox).not.toBeNull();
    expect(Math.abs(indicatorBox!.width - activeItemBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(indicatorBox!.height - activeItemBox!.height)).toBeLessThanOrEqual(1);
  });

  test('keeps the approved baseline across the full Sliding Underline list', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence');

    const list = page.getByRole('tablist', { name: '화면 탭 비교 · 슬라이딩 언더라인' });

    await expect(list).toHaveCSS('border-bottom-width', '1px');
  });
});
