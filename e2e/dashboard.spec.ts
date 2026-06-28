import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const forbiddenAdviceTerms = [
  '지금 사세요',
  '매도하세요',
  '목표가',
  '손절가',
  '익절가',
  '내일 오를 종목',
];

function getRelativeLuminance(color: string) {
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  const channels = rgbMatch
    ? rgbMatch.slice(1, 4).map(Number)
    : hexMatch
      ? [0, 2, 4].map((index) => Number.parseInt(hexMatch[1].slice(index, index + 2), 16))
      : [255, 255, 255];

  const [r, g, b] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(foreground: string, background: string) {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

async function expectTextTokenContrast(page: Page) {
  const contrastPairs = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const textTokens = [
      '--color-foreground',
      '--color-ink-soft',
      '--color-muted',
      '--color-muted-foreground',
    ];
    const surfaceTokens = [
      '--color-background',
      '--color-card',
      '--color-card-subtle',
      '--color-card-muted',
    ];

    return textTokens.flatMap((textToken) =>
      surfaceTokens.map((surfaceToken) => ({
        textToken,
        surfaceToken,
        foreground: rootStyle.getPropertyValue(textToken).trim(),
        background: rootStyle.getPropertyValue(surfaceToken).trim(),
      })),
    );
  });

  for (const pair of contrastPairs) {
    expect(
      getContrastRatio(pair.foreground, pair.background),
      `${pair.textToken} should keep 4.5:1 contrast on ${pair.surfaceToken}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
}

async function expectLinearDarkSurface(page: Page) {
  const samples = await page.evaluate(() =>
    ['[data-testid="dashboard-shell"]', 'article', 'article + section', 'label:has(input)'].map(
      (selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, backgroundColor: '', borderRadius: '' };

        const styles = getComputedStyle(element);
        return {
          selector,
          backgroundColor: styles.backgroundColor,
          borderRadius: styles.borderRadius,
        };
      },
    ),
  );

  for (const sample of samples) {
    expect(
      sample.backgroundColor,
      `${sample.selector} should be a dark Linear-style surface`,
    ).toBeTruthy();
    expect(getRelativeLuminance(sample.backgroundColor)).toBeLessThan(0.08);
  }

  for (const sample of samples.slice(1)) {
    expect(Number.parseFloat(sample.borderRadius)).toBeLessThanOrEqual(8);
  }
}

async function expectEChartCanvasRendered(page: Page, testId: string) {
  const canvas = page.getByTestId(testId).locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
        const chartCanvas = element as HTMLCanvasElement;
        const context = chartCanvas.getContext('2d');
        if (!context || chartCanvas.width === 0 || chartCanvas.height === 0) return false;

        const pixels = context.getImageData(0, 0, chartCanvas.width, chartCanvas.height).data;
        for (let index = 3; index < pixels.length; index += 16) {
          if (pixels[index] > 0) return true;
        }
        return false;
      }),
    )
    .toBe(true);
}

async function expectSvgRendered(page: Page, testId: string) {
  const svg = page.getByTestId(testId).locator('svg').first();
  await expect(svg).toBeVisible();
  await expect
    .poll(async () =>
      svg.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    )
    .toBe(true);
}

async function expectSnapshotBarsRendered(page: Page) {
  const chart = page.getByTestId('portfolio-snapshot-chart');
  const bars = page.getByTestId('portfolio-snapshot-bar');

  await expect(chart).toBeVisible();
  await expect(bars).toHaveCount(8);
  await expect
    .poll(async () =>
      bars.evaluateAll((elements) =>
        elements.every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      ),
    )
    .toBe(true);
}

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('[data-testid="dashboard-shell"]')
    .analyze();

  expect(results.violations).toEqual([]);
}

test('desktop dashboard supports tabs, stock search, selection, and detail scrolling', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only layout check');

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Futur Insight' })).toBeAttached();
  await expect(page.getByTestId('dashboard-shell')).toBeInViewport();
  await expectLinearDarkSurface(page);
  await expectTextTokenContrast(page);
  await expectNoAccessibilityViolations(page);
  await expectSnapshotBarsRendered(page);

  await page.getByTestId('nav-tab-theme').click();
  await expect(page.getByTestId('nav-tab-theme')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-tab-theme')).not.toHaveAttribute('role', 'tab');
  await expect(page.getByTestId('theme-flow-chart')).toBeVisible();
  await expectEChartCanvasRendered(page, 'theme-flow-chart');

  await page.getByTestId('nav-tab-portfolio').click();
  await expect(page.getByTestId('portfolio-theme-share-chart')).toBeVisible();
  await expectSvgRendered(page, 'portfolio-theme-share-chart');

  for (const term of forbiddenAdviceTerms) {
    await expect(page.getByText(term)).toHaveCount(0);
  }

  await page.getByTestId('nav-tab-stocks').click();

  await expect(page.getByRole('heading', { name: '종목 분석' })).toBeVisible();
  await page.getByTestId('stock-search').fill('전력기기');
  await expect
    .poll(async () =>
      page
        .getByTestId('stock-search')
        .evaluate((element) => getComputedStyle(element.closest('label')!).boxShadow),
    )
    .not.toBe('none');
  await expect(page.getByTestId('stock-card-ls-electric')).toBeVisible();
  await expect(page.getByTestId('stock-card-hd-hyundai-electric')).toBeVisible();

  await page.getByTestId('stock-card-hd-hyundai-electric').click();
  await expect(page.getByTestId('stock-detail')).toContainText('HD현대일렉트릭');
  await expect(page.getByTestId('stock-detail')).toContainText('관심 후보');
  await expect(page.getByTestId('stock-detail')).toHaveAttribute('role', 'region');
  await expect(page.getByTestId('stock-detail')).toHaveAttribute('aria-label', '종목 상세');
  await expect(page.getByTestId('stock-detail')).toHaveAttribute('tabindex', '0');
  await page.getByTestId('stock-detail').focus();
  await expect(page.getByTestId('stock-detail')).toBeFocused();

  await page.getByTestId('stock-detail').evaluate((element) => {
    element.scrollTop = 240;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect
    .poll(async () => page.getByTestId('stock-detail').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.locator('[data-scroll-area-track]').last()).toHaveAttribute(
    'data-visible',
    'true',
  );

  await page.getByTestId('stock-search').fill('검색결과없는종목');
  await expect(page.getByTestId('stock-list')).toContainText('검색 결과가 없습니다');
  await expect(page.getByTestId('stock-detail')).toContainText('선택 가능한 종목이 없습니다');
  await expect(page.getByTestId('stock-detail')).not.toContainText('HD현대일렉트릭');
  await expectNoAccessibilityViolations(page);
});

test('mobile dashboard uses bottom tabs without clipping primary content', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout check');

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');
  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();
  await expectNoAccessibilityViolations(page);
  await page.getByTestId('mobile-tab-stocks').click();
  await expect(page.getByRole('heading', { name: '종목 분석' })).toBeVisible();

  await page.getByTestId('stock-search').fill('NAVER');
  await expect(page.getByTestId('stock-card-naver')).toBeVisible();
  await page.getByTestId('stock-card-naver').click();
  await expect(page.getByTestId('stock-detail')).toContainText('NAVER');
  await expect(page.getByTestId('stock-detail')).toContainText('AI 플랫폼');

  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();
  await expect(page.getByTestId('mobile-tabbar')).toBeInViewport();
  await expect(page.getByTestId('stock-detail')).toBeVisible();

  await page.getByTestId('mobile-tab-theme').click();
  await expect(page.getByTestId('theme-flow-chart')).toBeVisible();
  await expectEChartCanvasRendered(page, 'theme-flow-chart');
  await expect
    .poll(async () =>
      page.getByTestId('dashboard-shell').evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    )
    .toEqual({ clientWidth: 375, scrollWidth: 375 });
  await expectNoAccessibilityViolations(page);
});

test('reduced motion keeps content and interactions available', async ({ page }, testInfo) => {
  const tabPrefix = testInfo.project.name === 'mobile' ? 'mobile-tab' : 'nav-tab';

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await expectSnapshotBarsRendered(page);
  await page.getByTestId(`${tabPrefix}-theme`).click();
  await expect(page.getByTestId('theme-flow-chart')).toBeVisible();
  await expectEChartCanvasRendered(page, 'theme-flow-chart');
  await page.getByTestId(`${tabPrefix}-portfolio`).click();
  await expect(page.getByTestId('portfolio-theme-share-chart')).toBeVisible();
  await expectSvgRendered(page, 'portfolio-theme-share-chart');
  await page.getByTestId(`${tabPrefix}-stocks`).click();
  await expect(page.getByRole('heading', { name: '종목 분석' })).toBeVisible();
  await page.getByTestId('stock-search').fill('삼성전자');
  await page.getByTestId('stock-card-samsung-electronics').click();
  await expect(page.getByTestId('stock-detail')).toContainText('삼성전자');
});
