import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openCatalog(page: Page) {
  await page.goto('/__ui-lab');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('tab', { name: '완료' })).toHaveAttribute('aria-selected', 'true');
  const catalog = page.locator('[data-slot="menu-overlay-catalog"]');
  await expect(catalog).toBeVisible();
  return catalog;
}

test.describe('UI Lab Menu & Overlay', () => {
  test('opens the six surfaces and keeps menu actions local', async ({ page }) => {
    const catalog = await openCatalog(page);
    const initialUrl = page.url();
    await expect(catalog.locator('article[data-variant]')).toHaveCount(2);
    await expect(catalog.getByText('C · Compact Ledger', { exact: true })).toHaveCount(0);

    await catalog.getByRole('button', { name: 'DropdownMenu A 열기' }).click();
    await page.getByRole('menuitem', { name: '근거 보기' }).click();
    await expect(catalog.locator('[data-slot="menu-overlay-result"]')).toContainText('근거 보기');

    await catalog.getByRole('button', { name: 'ContextMenu B 대상' }).click({ button: 'right' });
    await expect(page.getByRole('menu')).toHaveAttribute('data-variant', 'soft-surface');
    await page.keyboard.press('Escape');

    await catalog.getByRole('button', { name: 'Popover B 열기' }).click();
    await expect(page.getByText('선택 근거', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    for (const [kind, variant] of [
      ['Drawer A', 'hairline'],
      ['Sheet B', 'soft-surface'],
      ['BottomSheet A', 'hairline'],
    ] as const) {
      await catalog.getByRole('button', { name: `${kind} 열기`, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAttribute('data-variant', variant);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(20);
      expect(
        await page.evaluate(() => {
          const overlay = document.querySelector('[data-slot="sheet-overlay"]');
          return overlay ? getComputedStyle(overlay).pointerEvents : 'none';
        }),
      ).toBe('none');
      await page.waitForTimeout(100);
      await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
      await expect(dialog).toHaveCount(0);
      expect(
        await page.evaluate(() => ({
          bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
          scrollLocked: document.body.hasAttribute('data-scroll-locked'),
        })),
      ).toEqual({ bodyPointerEvents: 'auto', scrollLocked: false });
    }

    expect(page.url()).toBe(initialUrl);
  });

  test('keeps the mobile reduced-motion catalog usable and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const catalog = await openCatalog(page);

    const metrics = await catalog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const triggers = catalog.getByRole('button');
    for (let index = 0; index < (await triggers.count()); index += 1) {
      const box = await triggers.nth(index).boundingBox();
      expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    }

    await catalog.getByRole('button', { name: 'BottomSheet B 열기' }).click();
    const bottomSheet = page.getByRole('dialog');
    await expect(bottomSheet).toHaveAttribute('data-overlay-kind', 'bottom-sheet');
    await expect(bottomSheet).toHaveCSS('transform', 'none');
    const bottomSheetBox = await bottomSheet.boundingBox();
    const viewport = page.viewportSize();
    expect(bottomSheetBox).toBeTruthy();
    expect(viewport).toBeTruthy();
    const leftGap = bottomSheetBox?.x ?? 0;
    const rightGap =
      (viewport?.width ?? 0) -
      ((bottomSheetBox?.x ?? 0) + (bottomSheetBox?.width ?? viewport?.width ?? 0));
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');

    const results = await new AxeBuilder({ page })
      .include('[data-slot="menu-overlay-catalog"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
