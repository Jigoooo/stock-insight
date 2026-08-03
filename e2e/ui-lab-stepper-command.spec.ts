import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function openCatalog(page: Page) {
  await page.goto('/__ui-lab');
  await page.waitForLoadState('networkidle');
  const inProgressTab = page.getByRole('tab', { name: '목업 진행 중' });
  await inProgressTab.click();
  await expect(inProgressTab).toHaveAttribute('aria-selected', 'true');
  const catalog = page.locator('section[aria-labelledby="stepper-command-title"]');
  await expect(catalog).toBeVisible();
  return catalog;
}

async function openPalette(catalog: Locator, variant: 'A' | 'B' | 'C') {
  await catalog.getByRole('button', { name: `CommandPalette ${variant} 열기` }).click();
  return catalog.page().getByRole('dialog');
}

test.describe('UI Lab Stepper and CommandPalette', () => {
  test('keeps all Stepper variants synchronized without changing the URL', async ({ page }) => {
    const catalog = await openCatalog(page);
    const initialUrl = page.url();

    await catalog
      .getByRole('list', { name: 'Stepper 비교 · 가벼운 진행선' })
      .getByRole('button', { name: '영향 경로' })
      .click();

    const synchronizedSteps = catalog.getByRole('button', { name: '영향 경로' });
    await expect(synchronizedSteps).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(synchronizedSteps.nth(index)).toHaveAttribute('aria-current', 'step');
    }
    expect(page.url()).toBe(initialUrl);
  });

  test('opens A with Cmd/Ctrl+K and focuses search', async ({ page }) => {
    await openCatalog(page);

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('data-command-variant', 'compact-command');
    await expect(dialog.getByRole('combobox', { name: '명령 검색' })).toBeFocused();
  });

  test('filters results and executes the active option with arrows and Enter', async ({ page }) => {
    const catalog = await openCatalog(page);
    const dialog = await openPalette(catalog, 'A');
    const search = dialog.getByRole('combobox', { name: '명령 검색' });

    await search.fill('확인');
    await search.press('ArrowDown');
    const activeOptionId = await search.getAttribute('aria-activedescendant');
    expect(activeOptionId).toBeTruthy();
    await expect(page.locator(`#${activeOptionId}`)).toHaveAttribute('aria-selected', 'true');
    const selectedLabel = await page.locator(`#${activeOptionId}`).locator('strong').textContent();
    expect(selectedLabel).toBeTruthy();
    await search.press('Enter');

    await expect(dialog).toBeHidden();
    await expect(catalog.locator('[data-slot="command-result"]')).toContainText(
      selectedLabel ?? '',
    );
  });

  test('closes with Escape without changing the URL', async ({ page }) => {
    const catalog = await openCatalog(page);
    const initialUrl = page.url();
    const dialog = await openPalette(catalog, 'A');

    await dialog.getByRole('combobox', { name: '명령 검색' }).press('Escape');

    await expect(dialog).toBeHidden();
    expect(page.url()).toBe(initialUrl);
  });

  test('updates B preview and renders C compact results', async ({ page }) => {
    const catalog = await openCatalog(page);
    const splitDialog = await openPalette(catalog, 'B');
    const splitSearch = splitDialog.getByRole('combobox', { name: '명령 검색' });

    await splitSearch.press('ArrowDown');
    await expect(splitDialog.locator('[data-slot="command-preview"] h3')).toHaveText('테마 탐색');
    await splitSearch.press('Escape');

    const compactDialog = await openPalette(catalog, 'C');
    await expect(compactDialog.locator('[data-slot="command-results"]')).toHaveAttribute(
      'data-density',
      'compact',
    );
    await expect(compactDialog.getByText('최근 항목', { exact: true })).toBeVisible();
    await expect(compactDialog.getByText('빠른 액션', { exact: true })).toBeVisible();
  });

  test('shows an empty state for an unmatched query', async ({ page }) => {
    const catalog = await openCatalog(page);
    const dialog = await openPalette(catalog, 'A');

    await dialog.getByRole('combobox', { name: '명령 검색' }).fill('일치하지 않는 명령');

    await expect(dialog.getByText('검색 결과가 없습니다.')).toBeVisible();
    await expect(dialog.getByRole('option')).toHaveCount(0);
  });

  test('keeps mobile controls usable without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const catalog = await openCatalog(page);

    const metrics = await catalog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const controls = catalog.locator('ol button, button[data-slot="button-control"]');
    for (let index = 0; index < (await controls.count()); index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const splitDialog = await openPalette(catalog, 'B');
    await expect(splitDialog.locator('[data-slot="command-preview"]')).toBeVisible();
    const dialogMetrics = await splitDialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dialogMetrics.scrollWidth).toBeLessThanOrEqual(dialogMetrics.clientWidth);
  });

  test('removes the Stepper transform when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const catalog = await openCatalog(page);

    const indicator = catalog.locator('[class*="softTrackIndicator"]');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveCSS('transform', 'none');
  });

  test('has no focused accessibility violations', async ({ page }) => {
    await openCatalog(page);

    const results = await new AxeBuilder({ page })
      .include('section[aria-labelledby="stepper-command-title"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
