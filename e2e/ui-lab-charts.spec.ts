import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function openChartCatalog(page: Page): Promise<Locator> {
  await page.goto('/__ui-lab');
  await page.waitForLoadState('networkidle');
  const inProgressTab = page.getByRole('tab', { name: '목업 진행 중' });
  await inProgressTab.click();
  await expect(inProgressTab).toHaveAttribute('aria-selected', 'true');
  const catalog = page.locator('[data-slot="chart-catalog"]');
  await expect(catalog).toBeVisible();
  return catalog;
}

test.describe('UI Lab Charts End-to-End', () => {
  test('keeps Market Tape ranges and brush selection synchronized across A/B/C', async ({
    page,
  }) => {
    const catalog = await openChartCatalog(page);
    await expect(catalog.locator('article[data-component="chart"]')).toHaveCount(3);

    await catalog.getByRole('radio', { name: '1M' }).click();
    await expect(catalog.getByText('22 bars', { exact: true })).toHaveCount(3);
    await expect(catalog.locator('[data-slot="chart-range-readout"]')).toContainText(['22개']);

    const rightHandle = catalog
      .locator('[data-slot="chart-brush"] .visx-brush-handle-right')
      .first();
    await expect(rightHandle).toBeVisible();
    await rightHandle.scrollIntoViewIfNeeded();
    const box = await rightHandle.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 180, centerY, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const texts = await catalog
          .locator('[data-slot="chart-range-readout"] strong')
          .allTextContents();
        return new Set(texts).size === 1 && !texts[0]?.includes('22개');
      })
      .toBe(true);
  });

  test('shares Evidence Band evidence, domain, and band visibility across A/B/C', async ({
    page,
  }) => {
    const catalog = await openChartCatalog(page);
    await catalog.getByRole('tab', { name: 'Evidence Band', exact: true }).click();

    await expect(catalog.locator('article[data-component="chart"]')).toHaveCount(3);
    await expect(catalog.getByRole('heading', { name: 'A · Range Ledger' })).toHaveCount(1);
    await expect(catalog.getByRole('heading', { name: 'B · Event Pulse' })).toHaveCount(1);
    await expect(catalog.getByRole('heading', { name: 'C · Linked Evidence' })).toHaveCount(1);
    await expect(catalog.locator('[data-slot="evidence-context-legend"]')).toHaveCount(3);
    await expect(catalog.locator('[data-slot="evidence-row"]')).toHaveCount(9);
    await expect(catalog.locator('[data-slot="reference-band"]')).toHaveCount(6);

    await catalog.locator('[data-evidence-id="evidence-demand"]').first().click();
    const sharedEvidence = catalog.locator('[data-evidence-id="evidence-demand"]');
    await expect(sharedEvidence).toHaveCount(3);
    for (const evidence of await sharedEvidence.all()) {
      await expect(evidence).toHaveAttribute('aria-pressed', 'true');
      await expect(evidence).toHaveAttribute('aria-current', 'true');
    }
    await expect(catalog.locator('[data-slot="evidence-selected-summary"]')).toHaveCount(1);

    const bandToggle = catalog.getByRole('checkbox', { name: '조건 구간 표시' });
    await bandToggle.uncheck();
    await expect(catalog.locator('[data-slot="reference-band"]')).toHaveCount(0);
    await expect(catalog.locator('svg .chart-reference-area')).toHaveCount(0);

    await catalog.getByRole('combobox', { name: '차트 상태' }).selectOption('error');
    await expect(catalog.getByText('가격 데이터 읽기 오류')).toHaveCount(3);
    await catalog.getByRole('button', { name: '다시 시도' }).first().click();
    await expect(catalog.locator('article[data-state="ready"]')).toHaveCount(3);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const metrics = await catalog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const containedEvidenceRows = await catalog.evaluate((element) =>
      ['band-ledger', 'event-pulse', 'evidence-split'].map((variantId) => {
        const viewport = element.querySelector(
          `article[data-variant="${variantId}"] [data-slot="chart-viewport"]`,
        );
        const lastRow = element.querySelector(
          `article[data-variant="${variantId}"] [data-evidence-id="evidence-supply"]`,
        );
        if (!(viewport && lastRow)) return false;
        return (
          lastRow.getBoundingClientRect().bottom <= viewport.getBoundingClientRect().bottom + 1
        );
      }),
    );
    expect(containedEvidenceRows).toEqual([true, true, true]);

    const results = await new AxeBuilder({ page }).include('[data-slot="chart-catalog"]').analyze();
    expect(results.violations).toEqual([]);
  });

  test('mounts only three Candle Ledger charts on mobile with reduced motion and no a11y issues', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const catalog = await openChartCatalog(page);
    await catalog.getByRole('tab', { name: 'Candle Ledger', exact: true }).click();

    const renderers = catalog.locator('[data-slot="lightweight-chart-root"]');
    const roleIndicator = catalog.locator(
      ':scope > [data-slot="tabs"] > [data-slot="tabs-list"] > [data-slot="tabs-highlight-item"][data-active="true"] > [data-slot="motion-highlight"]',
    );
    await expect(renderers).toHaveCount(3);
    await expect(roleIndicator).toHaveCount(1);
    await expect(roleIndicator).toHaveCSS('height', '2px');
    await expect(roleIndicator).toHaveCSS('min-height', '0px');
    await expect(catalog.locator('[data-slot="candle-readout"]')).toHaveCount(3);
    await expect(catalog.getByRole('link', { name: 'TradingView Lightweight Charts' })).toHaveCount(
      3,
    );
    await expect.poll(async () => catalog.locator('canvas').count()).toBeGreaterThanOrEqual(3);

    await catalog.getByRole('tab', { name: 'Market Tape', exact: true }).click();
    await expect(renderers).toHaveCount(0);
    await catalog.getByRole('tab', { name: 'Candle Ledger', exact: true }).click();
    await expect(renderers).toHaveCount(3);

    const metrics = await catalog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const results = await new AxeBuilder({ page }).include('[data-slot="chart-catalog"]').analyze();
    expect(results.violations).toEqual([]);
  });
});
