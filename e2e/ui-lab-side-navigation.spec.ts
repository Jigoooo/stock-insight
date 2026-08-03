import { expect, test, type Page } from '@playwright/test';

async function openCompletedCatalog(page: Page) {
  await page.goto('/__ui-lab?route-tab=evidence&side-route=today');
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: '완료' }).click();
}

test.describe('UI Lab side navigation', () => {
  test('keeps Side Tab as panel state across three visual directions', async ({ page }) => {
    await openCompletedCatalog(page);

    const catalog = page.locator('[data-catalog="side-tabs"]');
    await expect(catalog.locator('article')).toHaveCount(3);

    const tablist = catalog.getByRole('tablist', { name: '패널 전환 · 세로 레일' });
    const beforeUrl = page.url();
    const summaryTab = tablist.getByRole('tab', { name: '리서치 요약' });
    const evidenceTab = tablist.getByRole('tab', { name: '근거 기록' });
    const companyTab = tablist.getByRole('tab', { name: '기업 메모' });

    await expect(async () => {
      await summaryTab.focus();
      await page.keyboard.press('ArrowDown');
      await expect(evidenceTab).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });

    await expect(async () => {
      await companyTab.click({ timeout: 1_000 });
      await expect(companyTab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
    await expect(catalog.getByRole('tabpanel', { name: '기업 메모' }).first()).toContainText(
      '기업별 메모',
    );
    expect(page.url()).toBe(beforeUrl);
  });

  test('keeps Side List as local selection across three visual directions', async ({ page }) => {
    await openCompletedCatalog(page);

    const catalog = page.locator('[data-catalog="side-lists"]');
    await expect(catalog.locator('article')).toHaveCount(3);

    const navigation = catalog.getByRole('navigation', { name: '경로 목록 · 조용한 행' });
    const holdings = navigation.getByRole('button', { name: '보유 종목' });
    const beforeUrl = page.url();
    await holdings.click();

    expect(page.url()).toBe(beforeUrl);
    await expect(holdings).toHaveAttribute('aria-current', 'page');
    await expect(catalog.getByText('보유 기업과 연결된 근거')).toHaveCount(3);
  });

  test('settles caller-supplied Side Tab motion immediately when reduced motion is requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCompletedCatalog(page);

    const article = page.locator('[data-catalog="side-tabs"] article').first();
    const tablist = article.getByRole('tablist', { name: '패널 전환 · 세로 레일' });
    const summaryTab = tablist.getByRole('tab', { name: '리서치 요약' });
    const evidenceTab = tablist.getByRole('tab', { name: '근거 기록' });
    const companyTab = tablist.getByRole('tab', { name: '기업 메모' });

    await expect(async () => {
      await evidenceTab.click({ timeout: 1_000 });
      await expect(evidenceTab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
    await summaryTab.click();
    await expect(summaryTab).toHaveAttribute('aria-selected', 'true');

    const summaryHeight = await article
      .locator('[data-slot="tabs-contents"]')
      .evaluate((element) => element.getBoundingClientRect().height);

    await companyTab.click();
    await expect(companyTab).toHaveAttribute('aria-selected', 'true');

    const companyPanel = article.getByRole('tabpanel', { name: '기업 메모' });
    await expect(companyPanel).toHaveAttribute('data-height', 'tall', { timeout: 1_000 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );

    const settled = await article.evaluate((element) => {
      const activeTab = element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      const activePanel = element.querySelector<HTMLElement>(
        '[role="tabpanel"][data-state="active"]',
      );
      const contents = element.querySelector<HTMLElement>('[data-slot="tabs-contents"]');
      const indicator = element.querySelector<HTMLElement>('[data-slot="motion-highlight"]');

      if (!activeTab || !activePanel || !contents || !indicator) return null;

      const activeTabRect = activeTab.getBoundingClientRect();
      const activePanelRect = activePanel.getBoundingClientRect();
      const contentsRect = contents.getBoundingClientRect();
      const indicatorRect = indicator.getBoundingClientRect();
      const panelStyle = getComputedStyle(activePanel);

      return {
        contentOpacity: panelStyle.opacity,
        contentTransform: panelStyle.transform,
        contentsHeightDelta: Math.abs(contentsRect.height - activePanelRect.height),
        indicatorTopDelta: Math.abs(indicatorRect.top - activeTabRect.top),
        panelHeight: activePanelRect.height,
      };
    });

    expect(settled).not.toBeNull();
    expect(settled?.panelHeight).toBeGreaterThan(summaryHeight + 80);
    expect(settled?.contentsHeightDelta).toBeLessThan(1);
    expect(Math.abs((settled?.indicatorTopDelta ?? 0) - 7)).toBeLessThan(1);
    expect(settled?.contentOpacity).toBe('1');
    expect(settled?.contentTransform).toBe('none');
  });

  test('blocks disabled Side List links before child navigation runs', async ({ page }) => {
    await openCompletedCatalog(page);

    const navigation = page.getByRole('navigation', { name: 'Side List 비활성 상태' });
    const disabledLink = navigation.getByRole('button', { name: '준비 중인 경로' });
    const beforeUrl = page.url();

    await expect(disabledLink).toHaveAttribute('aria-disabled', 'true');
    await disabledLink.click({ force: true });

    expect(page.url()).toBe(beforeUrl);
  });

  test('keeps disabled Side List color and surface stable on hover', async ({ page }) => {
    await openCompletedCatalog(page);

    const disabledLink = page
      .getByRole('navigation', { name: 'Side List 비활성 상태' })
      .getByRole('button', { name: '준비 중인 경로' });
    await expect(disabledLink).toHaveAttribute('aria-disabled', 'true');

    const before = await disabledLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });

    await disabledLink.hover();

    const after = await disabledLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });

    expect(after).toEqual(before);
  });
});
