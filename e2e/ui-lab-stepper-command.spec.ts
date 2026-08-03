import { expect, test, type Locator, type Page } from '@playwright/test';

async function openCatalog(page: Page) {
  await page.goto('/__ui-lab');
  await page.getByRole('tab', { name: '목업 진행 중' }).click();
  return page.locator('section[aria-labelledby="stepper-command-title"]');
}

async function openPalette(catalog: Locator, variant: 'A' | 'B' | 'C') {
  await catalog.getByRole('button', { name: `CommandPalette ${variant} 열기` }).click();
  return catalog.page().getByRole('dialog');
}

test.describe('UI Lab Stepper and CommandPalette', () => {
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
});
