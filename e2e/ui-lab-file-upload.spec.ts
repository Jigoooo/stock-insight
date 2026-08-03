import { expect, test, type Locator, type Page } from '@playwright/test';

const csvFile = (name: string, size = 32) => ({
  name,
  mimeType: 'text/csv',
  buffer: Buffer.alloc(size, 'a'),
});

async function firstUploadCard(page: Page) {
  await openFileUpload(page);
  return page.locator('article[data-direction="hairline"]');
}

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'interactive control should have a bounding box').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function fontSize(locator: Locator) {
  return Number.parseFloat(await locator.evaluate((element) => getComputedStyle(element).fontSize));
}

async function dropFile(
  dropzone: Locator,
  file: { name: string; mimeType: string; content: string },
) {
  await dropzone.evaluate((element, droppedFile) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File([droppedFile.content], droppedFile.name, { type: droppedFile.mimeType }),
    );
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, file);
}

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

  test('moves focus to the adjacent remove control and returns it to the picker after the final exit', async ({
    page,
  }) => {
    const firstCard = await firstUploadCard(page);
    await firstCard.getByRole('button', { name: '다중' }).click();
    await firstCard.getByRole('button', { name: '선택', exact: true }).click();

    await firstCard.getByRole('button', { name: 'portfolio-2026-08.csv 삭제' }).click();
    await expect(firstCard.getByRole('button', { name: 'earnings-notes.pdf 삭제' })).toBeFocused();

    await firstCard.getByRole('button', { name: 'earnings-notes.pdf 삭제' }).click();
    await expect(firstCard.getByRole('button', { name: 'watchlist.xlsx 삭제' })).toBeFocused();

    await firstCard.getByRole('button', { name: 'watchlist.xlsx 삭제' }).click();
    await expect(firstCard.getByRole('button', { name: '파일 선택' })).toBeFocused();
    await expect(firstCard.getByRole('listitem')).toHaveCount(0);
  });

  test('appends valid input and dropped files while preserving state across mode changes and rejection', async ({
    page,
  }) => {
    const firstCard = await firstUploadCard(page);
    const input = firstCard.locator('input[type="file"]');
    const rows = firstCard.getByRole('listitem');

    await firstCard.getByRole('button', { name: '다중' }).click();
    await input.setInputFiles(csvFile('first.csv'));
    await input.setInputFiles(csvFile('first.csv'));
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('first.csv');
    await expect(rows.nth(1)).toContainText('first.csv');

    await dropFile(input.locator('..'), {
      name: 'dropped.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: 'spreadsheet',
    });
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText('dropped.xlsx');

    await input.setInputFiles({
      name: 'rejected.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid'),
    });
    await input.setInputFiles(csvFile('too-large.csv', 10 * 1024 * 1024 + 1));
    await expect(rows).toHaveCount(3);

    await firstCard.getByRole('button', { name: '단일' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('first.csv');
    await firstCard.getByRole('button', { name: '다중' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('first.csv');
  });

  test('keeps desktop controls compact and mobile controls comfortably tappable', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name === 'mobile') {
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const firstCard = await firstUploadCard(page);
    const toggleNames = ['단일', '다중', '대기', '드래그', '선택'];

    for (const name of toggleNames) {
      const control = firstCard.getByRole('button', { name, exact: true });
      if (testInfo.project.name === 'mobile') {
        await expectMinimumHitArea(control);
        expect(await fontSize(control)).toBeGreaterThanOrEqual(11);
      } else {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeLessThanOrEqual(30);
        expect(await fontSize(control)).toBeGreaterThanOrEqual(10.5);
      }
    }
    const picker = firstCard.getByRole('button', { name: '파일 선택' });
    if (testInfo.project.name === 'mobile') {
      await expectMinimumHitArea(picker);
    } else {
      const box = await picker.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(34);
    }

    await firstCard.getByRole('button', { name: '다중' }).click();
    await firstCard.getByRole('button', { name: '선택', exact: true }).click();
    const deleteButton = firstCard.getByRole('button', {
      name: 'portfolio-2026-08.csv 삭제',
    });
    if (testInfo.project.name === 'mobile') {
      await expectMinimumHitArea(deleteButton);
    } else {
      const box = await deleteButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(32);
      expect(box!.height).toBeLessThanOrEqual(32);
    }
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
    const dropzone = firstCard.locator('input[type="file"]').locator('..');
    await expect(firstRow).toBeVisible();
    await expect
      .poll(() => firstRow.evaluate((element) => getComputedStyle(element).transform))
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect
      .poll(() => dropzone.evaluate((element) => getComputedStyle(element).transitionProperty))
      .not.toContain('min-height');
    await expect(firstRow).toHaveCSS('opacity', '1');
  });
});
