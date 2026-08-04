import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openIdentityContentCatalog(page: Page) {
  const inProgressTab = page.getByRole('tab', { name: '목업 진행 중', exact: true });
  await inProgressTab.click();
  await expect(inProgressTab).toHaveAttribute('aria-selected', 'true');
  const catalog = page.locator('[data-slot="identity-content-catalog"]');
  await expect(catalog).toBeVisible();
  return catalog;
}

test.describe('UI Lab Identity & Content', () => {
  test('cycles refresh feedback and shares content selection across A/B/C', async ({ page }) => {
    await page.goto('/__ui-lab');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();

    const refreshButton = page.locator('button[data-refresh-state]');
    await expect(refreshButton).toHaveAccessibleName('새로고침');
    await expect(refreshButton).toBeEnabled();
    await refreshButton.click();
    await expect(refreshButton).toHaveAttribute('data-refresh-state', 'pending');
    await expect(refreshButton).toHaveAttribute('data-refresh-state', 'complete', {
      timeout: 2_500,
    });
    await expect(refreshButton).toHaveAccessibleName('새로고침 완료');
    await refreshButton.click();
    await expect(refreshButton).toHaveAttribute('data-refresh-state', 'pending');
    await expect(refreshButton).toHaveAttribute('data-refresh-state', 'complete', {
      timeout: 2_500,
    });

    const catalog = await openIdentityContentCatalog(page);
    await expect(catalog.getByRole('tab')).toHaveCount(6);

    await catalog.getByRole('tab', { name: 'List', exact: true }).click();
    await expect(catalog.locator('article[data-component="list"]')).toHaveCount(3);
    await catalog.getByRole('button', { name: '메모리 사이클 회복 선택' }).first().click();
    await expect(
      catalog.locator('article[data-component="list"] [aria-current="true"]'),
    ).toHaveCount(3);
    const selectedListRow = catalog
      .locator('article[data-component="list"] [aria-current="true"]')
      .first();
    expect(
      await selectedListRow.evaluate((element) => getComputedStyle(element).animationName),
    ).toContain('identity-list-select');

    await catalog.getByRole('tab', { name: 'Timeline', exact: true }).click();
    await expect(
      catalog.locator('article[data-component="timeline"] [aria-current="true"]'),
    ).toHaveCount(3);
    const selectedTimelineRow = catalog
      .locator('article[data-component="timeline"] [aria-current="true"]')
      .first();
    expect(
      await selectedTimelineRow.evaluate((element) => getComputedStyle(element).animationName),
    ).toContain('identity-timeline-select');

    await catalog.getByRole('tab', { name: 'Carousel', exact: true }).click();
    await catalog
      .getByRole('button', { name: '공급망 제약 재점검 선택', exact: true })
      .first()
      .click();
    await expect(catalog.locator('article[data-component="carousel"]')).toHaveCount(3);
    const carouselContent = catalog.locator('[data-carousel-content]').first();
    await expect(carouselContent).toHaveAttribute('data-direction', 'forward');
    expect(
      await carouselContent.evaluate((element) => getComputedStyle(element).animationName),
    ).toContain('identity-carousel-content-enter');
    await expect(catalog.getByRole('button', { name: '다음 콘텐츠' })).toHaveCount(3);
    for (const nextButton of await catalog.getByRole('button', { name: '다음 콘텐츠' }).all()) {
      await expect(nextButton).toBeDisabled();
    }

    await page.getByRole('tab', { name: '예정', exact: true }).click();
    const planned = page.locator('[aria-label="향후 배치"]');
    await expect(planned.locator('article')).toHaveCount(3);
    await expect(planned.getByText('Menu & Overlay', { exact: true })).toHaveCount(0);
    expect(page.url()).toBe(initialUrl);
  });

  test('keeps the mobile reduced-motion catalog contained and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/__ui-lab');
    await page.waitForLoadState('networkidle');
    const catalog = await openIdentityContentCatalog(page);

    const catalogMetrics = await catalog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(catalogMetrics.scrollWidth).toBeLessThanOrEqual(catalogMetrics.clientWidth);

    const componentTabs = catalog.locator('[data-slot="identity-content-tabs"]');
    const tabMetrics = await componentTabs.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(tabMetrics.scrollWidth).toBeGreaterThan(tabMetrics.clientWidth);

    for (const component of ['Avatar', 'Badge', 'Status', 'List', 'Timeline', 'Carousel']) {
      await catalog.getByRole('tab', { name: component, exact: true }).click();
      await expect(catalog.locator('article[data-component]')).toHaveCount(3);
    }

    await catalog
      .getByRole('button', { name: '메모리 사이클 회복 선택', exact: true })
      .first()
      .click();
    const reducedCarouselDuration = await catalog
      .locator('[data-carousel-content]')
      .first()
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
    expect(reducedCarouselDuration).toBeLessThanOrEqual(0.001);

    const controls = catalog.getByRole('button');
    for (let index = 0; index < (await controls.count()); index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    }

    const results = await new AxeBuilder({ page })
      .include('[data-slot="identity-content-catalog"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
