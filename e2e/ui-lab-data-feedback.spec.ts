import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('UI Lab Data & Feedback', () => {
  test('shares Table and virtual DataGrid interactions across A/B/C', async ({ page }) => {
    await page.goto('/__ui-lab');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();
    await page.getByRole('tab', { name: '완료', exact: true }).click();
    const catalog = page.locator('[data-slot="data-feedback-catalog"]');

    await catalog.getByRole('tab', { name: 'Table', exact: true }).click();
    await expect(catalog.locator('table[data-variant]')).toHaveCount(3);
    await expect(catalog.locator('article[data-component="table"] [data-sort-icon]')).toHaveCount(
      12,
    );
    await catalog.getByRole('button', { name: '기업 정렬' }).first().click();
    await expect(catalog.locator('th[aria-sort="ascending"]')).toHaveCount(3);
    await catalog
      .getByRole('checkbox', { name: /선택/ })
      .first()
      .check();
    await expect(catalog.locator('[data-slot="table-selection-summary"]')).toHaveCount(3);
    await expect(catalog.getByText('1개 항목 선택됨', { exact: true })).toHaveCount(3);

    await catalog.getByRole('button', { name: '점수 정렬' }).first().click();
    await expect(catalog.locator('[data-table-motion-row]')).toHaveCount(18);
    await catalog
      .getByRole('button', { name: /근거 펼치기/ })
      .first()
      .click();
    await expect(catalog.getByText('연결 근거')).toHaveCount(3);
    await expect(catalog.locator('[data-table-detail-motion]')).toHaveCount(3);

    await catalog.getByRole('tab', { name: 'DataGrid', exact: true }).click();
    await expect(catalog.locator('[role="grid"]')).toHaveCount(3);
    await expect(catalog.locator('[data-slot="data-grid-root"]')).toHaveCount(3);
    await expect(
      catalog.locator('article[data-component="data-grid"] [data-sort-icon]'),
    ).toHaveCount(18);
    const gridHeaderCheckboxes = catalog.getByRole('checkbox', { name: '전체 행 선택' });
    await expect(gridHeaderCheckboxes).toHaveCount(3);
    const verticalLineOptions = catalog.getByRole('checkbox', { name: '수직선 표시' });
    await expect(verticalLineOptions).toHaveCount(3);

    const headerLabelGaps = await catalog
      .locator('article[data-component="data-grid"] [data-grid-sort-button]')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const label = button.querySelector('span');
          const icon = button.querySelector('[data-sort-icon]');
          if (!label || !icon) return Number.POSITIVE_INFINITY;
          return Math.round(
            icon.getBoundingClientRect().left - label.getBoundingClientRect().right,
          );
        }),
      );
    expect(headerLabelGaps.every((gap) => gap >= 4 && gap <= 10)).toBe(true);

    await gridHeaderCheckboxes.first().check();
    for (const checkbox of await gridHeaderCheckboxes.all()) {
      await expect(checkbox).toBeChecked();
    }
    await catalog.getByRole('button', { name: '점수 정렬' }).first().click();
    await expect(catalog.locator('[role="columnheader"][aria-sort="ascending"]')).toHaveCount(3);
    await expect(catalog.locator('[data-grid-motion-row]')).toHaveCount(42);

    const precisionCell = catalog
      .locator('article[data-variant="precision-grid"] [role="gridcell"][data-column="company"]')
      .first();
    const softCell = catalog
      .locator('article[data-variant="soft-sheet"] [role="gridcell"][data-column="company"]')
      .first();
    const denseTicker = catalog
      .locator('article[data-variant="dense-matrix"] [role="gridcell"][data-column="ticker"]')
      .first();
    const denseCompany = catalog
      .locator('article[data-variant="dense-matrix"] [role="gridcell"][data-column="company"]')
      .first();
    const denseSelection = catalog
      .locator('article[data-variant="dense-matrix"] [role="gridcell"]')
      .first();
    const denseSelectionHeader = catalog.locator(
      'article[data-variant="dense-matrix"] [role="columnheader"][aria-label="행 선택"]',
    );
    const denseTickerHeader = catalog.locator(
      'article[data-variant="dense-matrix"] [role="columnheader"][data-column="ticker"]',
    );
    expect(
      await precisionCell.evaluate((element) => getComputedStyle(element).borderRightWidth),
    ).toBe('0px');
    expect(await softCell.evaluate((element) => getComputedStyle(element).borderRightWidth)).toBe(
      '0px',
    );
    expect(
      await denseTicker.evaluate((element) => getComputedStyle(element).borderRightWidth),
    ).toBe('1px');
    expect(await denseTicker.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe(
      '0px',
    );
    expect(
      await denseSelection.evaluate((element) => getComputedStyle(element).borderRightWidth),
    ).toBe('0px');
    expect(await denseSelection.evaluate((element) => getComputedStyle(element).position)).toBe(
      'sticky',
    );
    expect(
      await denseSelectionHeader.evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(
      await denseTickerHeader.evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    expect(
      await denseSelection.evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(await denseTicker.evaluate((element) => getComputedStyle(element).backgroundColor));

    await verticalLineOptions.first().check();
    for (const checkbox of await verticalLineOptions.all()) {
      await expect(checkbox).toBeChecked();
    }
    await expect(catalog.locator('[role="grid"][data-column-borders]')).toHaveCount(3);
    expect(
      await precisionCell.evaluate((element) => getComputedStyle(element).borderRightWidth),
    ).toBe('1px');
    expect(await softCell.evaluate((element) => getComputedStyle(element).borderRightWidth)).toBe(
      '1px',
    );
    expect(
      await denseCompany.evaluate((element) => getComputedStyle(element).borderRightWidth),
    ).toBe('1px');
    expect(
      await precisionCell.evaluate((element) => getComputedStyle(element).borderRightColor),
    ).not.toBe(await denseTicker.evaluate((element) => getComputedStyle(element).borderRightColor));

    const firstGrid = catalog.locator('[role="grid"]').first();
    await firstGrid.locator('[role="gridcell"][data-column="note"]').first().dblclick();
    await firstGrid.getByRole('textbox').fill('다시 확인');
    await firstGrid.getByRole('textbox').press('Enter');
    await expect(catalog.getByText('다시 확인', { exact: true })).toHaveCount(3);

    await firstGrid.locator('[role="gridcell"][data-column="ticker"]').first().dblclick();
    const tickerEditor = firstGrid.getByRole('textbox', { name: /종목 편집/ });
    await tickerEditor.fill('TEST01');
    await tickerEditor.press('Enter');
    await expect(catalog.getByText('TEST01', { exact: true })).toHaveCount(3);

    const mountedRows = await firstGrid.locator('[role="row"]').count();
    expect(mountedRows).toBeGreaterThan(8);
    expect(mountedRows).toBeLessThan(40);
    await firstGrid.locator('[data-slot="data-grid-viewport"]').evaluate((element) => {
      element.scrollTop = 8_800;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(firstGrid.locator('[role="row"][aria-rowindex="201"]')).toBeVisible();

    await catalog.getByRole('tab', { name: 'Skeleton', exact: true }).click();
    const skeletonStates = await catalog
      .locator('[data-slot="skeleton-root"]')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const pattern = element.querySelector('[data-skeleton-animation]');
          return {
            animation: element.getAttribute('data-variant'),
            animationName: getComputedStyle(element).animationName,
            blocks: [...(pattern?.children ?? [])].map((block) => ({
              height: Math.round(Number.parseFloat(getComputedStyle(block).height)),
              width: Math.round(Number.parseFloat(getComputedStyle(block).width)),
            })),
          };
        }),
      );
    expect(skeletonStates).toHaveLength(3);
    expect(new Set(skeletonStates.map(({ animation }) => animation)).size).toBe(3);
    expect(skeletonStates.every(({ animationName }) => animationName !== 'none')).toBe(true);
    expect(skeletonStates[1]?.blocks).toEqual(skeletonStates[0]?.blocks);
    expect(skeletonStates[2]?.blocks).toEqual(skeletonStates[0]?.blocks);
    const calmPulseDuration = await catalog
      .locator('article[data-variant="block-pulse"] [data-slot="skeleton-root"] span')
      .first()
      .evaluate((element) => getComputedStyle(element).animationDuration);
    expect(calmPulseDuration).toBe('2.2s');
    expect(page.url()).toBe(initialUrl);
  });

  test('keeps virtual rows flush when rapidly returning to the top', async ({ page }) => {
    await page.goto('/__ui-lab');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: '완료', exact: true }).click();
    const catalog = page.locator('[data-slot="data-feedback-catalog"]');
    await catalog.getByRole('tab', { name: 'DataGrid', exact: true }).click();
    const firstGrid = catalog.locator('[role="grid"]').first();
    const viewport = firstGrid.locator('[data-slot="data-grid-viewport"]');

    await viewport.evaluate((element) => {
      element.scrollTop = 43_000;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(24);
    await viewport.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(16);

    const topState = await firstGrid.evaluate((grid) => {
      const viewportElement = grid.querySelector<HTMLElement>('[data-slot="data-grid-viewport"]');
      const firstRow = grid.querySelector<HTMLElement>('[data-grid-motion-row]');
      if (!viewportElement || !firstRow) return undefined;
      return {
        firstRowIndex: firstRow.getAttribute('aria-rowindex'),
        topGap: Math.round(
          firstRow.getBoundingClientRect().top - viewportElement.getBoundingClientRect().top,
        ),
        transform: getComputedStyle(firstRow).transform,
      };
    });

    expect(topState).toBeDefined();
    expect(topState?.firstRowIndex).toBe('2');
    expect(topState?.topGap).toBeLessThanOrEqual(48);
    expect(topState?.transform).toBe('none');
  });

  test('contains all state variants on mobile with reduced motion and accessible feedback', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/__ui-lab');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: '완료', exact: true }).click();
    const catalog = page.locator('[data-slot="data-feedback-catalog"]');

    await expect(catalog.getByRole('tab')).toHaveCount(8);
    const sharedSlots = {
      Progress: 'feedback-progress',
      Spinner: 'feedback-spinner',
      Skeleton: 'skeleton-root',
      Empty: 'feedback-root',
      Error: 'feedback-root',
      Loading: 'feedback-loading',
    } as const;

    for (const name of ['Progress', 'Spinner', 'Skeleton', 'Empty', 'Error', 'Loading'] as const) {
      await catalog.getByRole('tab', { name, exact: true }).click();
      await expect(catalog.locator('article[data-component]')).toHaveCount(3);
      await expect(catalog.locator(`[data-slot="${sharedSlots[name]}"]`)).toHaveCount(3);

      const bottomLayout = await catalog
        .locator('article[data-component]')
        .last()
        .evaluate((card) => {
          const contents = card.closest<HTMLElement>('[data-slot="data-feedback-contents"]');
          const cardRect = card.getBoundingClientRect();
          const contentsRect = contents?.getBoundingClientRect();
          return {
            bottomGap: contentsRect ? Math.round(contentsRect.bottom - cardRect.bottom) : -1,
            overflow: contents ? getComputedStyle(contents).overflow : 'missing',
          };
        });
      expect(bottomLayout.bottomGap).toBeGreaterThanOrEqual(20);
      expect(bottomLayout.overflow).toBe('visible');

      const alignment = await catalog
        .getByRole('tab', { name, exact: true })
        .evaluate((trigger) => {
          const item = trigger.closest('[data-slot="tabs-highlight-item"]');
          const indicator = item?.querySelector<HTMLElement>('[data-slot="motion-highlight"]');
          if (!item || !indicator) return Number.POSITIVE_INFINITY;
          const triggerRect = trigger.getBoundingClientRect();
          const indicatorRect = indicator.getBoundingClientRect();
          return Math.abs(
            triggerRect.left +
              triggerRect.width / 2 -
              (indicatorRect.left + indicatorRect.width / 2),
          );
        });
      expect(alignment).toBeLessThanOrEqual(1);
    }

    for (const family of ['empty', 'error', 'loading']) {
      await catalog.getByRole('tab', { name: new RegExp(`^${family}$`, 'i') }).click();
      const previews = catalog.locator(`[data-state-family="${family}"]`);
      await expect(previews).toHaveCount(3);
      for (const preview of await previews.all()) {
        expect(await preview.evaluate((element) => getComputedStyle(element).justifyItems)).toBe(
          'center',
        );
      }
    }

    await catalog.getByRole('button', { name: '다시 불러오기' }).first().click();
    await expect(catalog.getByText('불러오는 중', { exact: true })).toHaveCount(3);
    await expect(catalog.getByText('불러오기 완료', { exact: true })).toHaveCount(3, {
      timeout: 2_000,
    });

    const moving = catalog.locator('[data-motion-indicator]').first();
    expect(await moving.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe(
      'paused',
    );

    const results = await new AxeBuilder({ page })
      .include('[data-slot="data-feedback-catalog"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
