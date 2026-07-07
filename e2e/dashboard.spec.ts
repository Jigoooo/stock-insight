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

const stockListAvailabilityFixtures = [
  {
    availability: 'available',
    expectedTitle: '종목 0개 사용 가능',
    expectedTitleSuffix: '사용 가능',
    expectedTone: 'success',
  },
  {
    availability: 'text_only',
    expectedTitle: '종목 6개 텍스트 기반',
    expectedTitleSuffix: '텍스트 기반',
    expectedTone: 'info',
  },
  {
    availability: 'stale',
    expectedTitle: '종목 6개 오래됨',
    expectedTitleSuffix: '오래됨',
    expectedTone: 'warning',
  },
  {
    availability: 'collecting',
    expectedTitle: '종목 6개 수집 중',
    expectedTitleSuffix: '수집 중',
    expectedTone: 'neutral',
  },
  {
    availability: 'missing',
    expectedTitle: '종목 6개 데이터 없음',
    expectedTitleSuffix: '데이터 없음',
    expectedTone: 'muted',
  },
  {
    availability: 'error',
    expectedTitle: '종목 6개 읽기 오류',
    expectedTitleSuffix: '읽기 오류',
    expectedTone: 'danger',
  },
  {
    availability: 'unsupported',
    expectedTitle: '종목 6개 지원 범위 밖',
    expectedTitleSuffix: '지원 범위 밖',
    expectedTone: 'muted',
  },
] as const;

const dashboardStatusFixtureSections = [
  {
    label: '시장 뉴스',
    navTabTestId: 'nav-tab-news',
    popoverTestId: 'market-news-quality-popover',
    statusTestId: 'market-news-status',
  },
  {
    label: '포트폴리오',
    navTabTestId: 'nav-tab-portfolio',
    popoverTestId: 'portfolio-quality-popover',
    statusTestId: 'portfolio-status',
  },
  {
    label: 'Digest',
    navTabTestId: 'nav-tab-portfolio',
    popoverTestId: 'portfolio-digest-quality-popover',
    statusTestId: 'portfolio-digest-status',
  },
] as const;

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

type StockListAvailability = (typeof stockListAvailabilityFixtures)[number]['availability'];

function stockListFixtureSource(availability: StockListAvailability) {
  return availability === 'available' ? 'database' : 'fallback';
}

async function installStockListAvailabilityFixture(page: Page, availability: StockListAvailability) {
  await page.route('**/api/stocks?**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        availability,
        data: [],
        error:
          availability === 'error'
            ? { code: 'E2E_STOCK_LIST_FIXTURE', message: 'E2E forced stock list error' }
            : null,
        meta: {
          generatedAt: '2026-07-07T00:00:00.000Z',
          source: stockListFixtureSource(availability),
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

function createAvailabilityEnvelope(availability: StockListAvailability, data: unknown, code: string) {
  return {
    availability,
    data,
    error:
      availability === 'error'
        ? { code, message: `E2E forced ${code.toLowerCase()} error` }
        : null,
    meta: {
      generatedAt: '2026-07-07T00:00:00.000Z',
      source: stockListFixtureSource(availability),
    },
  };
}

async function fulfillJson(route: Parameters<Parameters<Page['route']>[1]>[0], body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

async function installDashboardStatusAvailabilityFixture(
  page: Page,
  availability: StockListAvailability,
) {
  await page.route('**/api/market-news**', async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope(availability, [], 'E2E_MARKET_NEWS_FIXTURE'),
    );
  });
  await page.route('**/api/me/bootstrap', async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope(
        availability,
        {
          positions: [],
          preferences: {
            defaultMarket: 'KR',
            defaultScope: 'all',
          },
          user: {
            id: 'e2e-user',
            label: 'E2E 사용자',
          },
          watchlist: [],
        },
        'E2E_ME_BOOTSTRAP_FIXTURE',
      ),
    );
  });
  await page.route('**/api/portfolio/digest', async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope(
        availability,
        {
          alerts: [],
          exposures: [],
          freshness: [],
          stats: {
            alertCount: 0,
            changeEventCount: 0,
            freshnessRiskCount: 0,
            nonStockFilteredCount: 0,
            positionCount: 0,
            watchlistCount: 0,
          },
        },
        'E2E_PORTFOLIO_DIGEST_FIXTURE',
      ),
    );
  });
}

const e2eDetailStockItem = {
  analysisStatus: 'cached',
  changePct: 1.25,
  confidence: 'high',
  currency: 'KRW',
  displayName: 'E2E 상세 검증',
  entityKey: 'E2E:DETAIL',
  isHolding: false,
  isWatched: true,
  lastAnalyzedAt: '2026-07-07T00:00:00.000Z',
  latestPrice: 12345,
  market: 'KR',
  name: 'E2E 상세 검증',
  primaryThesis: 'detail availability fixture',
  ticker: 'E2E001',
};

function createStockDetailFixtureData(
  availability: StockListAvailability,
  learningCardAvailability?: StockListAvailability,
) {
  return {
    analysisJob: {
      id: 'e2e-detail-job',
      progressPct: 100,
      queuedAt: '2026-07-07T00:00:00.000Z',
      startedAt: '2026-07-07T00:01:00.000Z',
      status: 'completed',
    },
    checkpoints: ['detail availability fixture checkpoint'],
    deepReport: {
      reportMarkdown: '## E2E 상세 검증\n전용 detail API availability fixture입니다.',
      researchedAt: '2026-07-07T00:00:00.000Z',
      sources: [{ label: 'E2E source', url: 'https://example.com/e2e-detail' }],
      status: availability,
    },
    glossaryTerms: [],
    learningCards: learningCardAvailability
      ? [
          {
            availability: learningCardAvailability,
            bodyMarkdown: '## E2E 공부 카드\nlearning card availability fixture입니다.',
            bullets: ['상태별 badge와 품질 설명을 확인합니다.'],
            cardKey: 'e2e-learning-card',
            section: '검증',
            sources:
              learningCardAvailability === 'available'
                ? [{ label: 'E2E learning source', url: 'https://example.com/e2e-learning' }]
                : [],
            title: 'E2E 공부 카드',
            updatedAt: '2026-07-07T00:00:00.000Z',
          },
        ]
      : [],
    relatedNews: [],
    risks: ['detail availability fixture risk'],
    stock: e2eDetailStockItem,
  };
}

async function installStockDetailAvailabilityFixture(
  page: Page,
  availability: StockListAvailability,
) {
  await page.route('**/api/stocks?**', async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope('available', [e2eDetailStockItem], 'E2E_STOCK_LIST_FIXTURE'),
    );
  });
  await page.route('**/api/stocks/E2E%3ADETAIL', async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope(
        availability,
        availability === 'available' ? createStockDetailFixtureData(availability) : null,
        'E2E_STOCK_DETAIL_FIXTURE',
      ),
    );
  });
}

async function installLearningCardAvailabilityFixture(
  page: Page,
  availability: StockListAvailability,
) {
  await page.route('**/api/stocks?**', async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope('available', [e2eDetailStockItem], 'E2E_STOCK_LIST_FIXTURE'),
    );
  });
  await page.route('**/api/stocks/E2E%3ADETAIL', async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope(
        'available',
        createStockDetailFixtureData('available', availability),
        'E2E_LEARNING_CARD_FIXTURE',
      ),
    );
  });
}

const e2eDiscoverItem = {
  analysisStatus: 'none',
  canStartAnalysis: true,
  checkpoints: ['거래량 동반 회복 확인'],
  confidence: 'medium',
  entityKey: 'KR:E2E002',
  market: 'KR',
  name: 'E2E 발굴 후보',
  reasonSummary: '전용 discover API availability fixture입니다.',
  reasonTitle: '시장 모멘텀 후보',
  reasonType: 'market_candidate',
  relatedToMyStocks: [
    {
      entityKey: 'KR:E2E001',
      market: 'KRX',
      name: 'E2E 상세 검증',
      ticker: 'E2E001',
    },
  ],
  sourceCount: 1,
  sources: [{ label: 'E2E source', url: 'https://example.com/e2e-discover' }],
  ticker: 'E2E002',
  topRisks: ['fixture risk'],
};

async function installDiscoverAvailabilityFixture(page: Page, availability: StockListAvailability) {
  await page.route(/\/api\/discover\/stocks(?:\?.*)?$/, async (route) => {
    await fulfillJson(
      route,
      createAvailabilityEnvelope(
        availability,
        availability === 'available' ? [e2eDiscoverItem] : [],
        'E2E_DISCOVER_FIXTURE',
      ),
    );
  });
}

async function expectQualityPopoverVisible(page: Page, testId: string, expectedText: string) {
  const popover = page.getByTestId(testId);
  await popover.getByText('데이터 품질').click();
  await expect(popover).toContainText(expectedText);
  await expect
    .poll(async () =>
      popover.evaluate((element) => {
        const panel = element.querySelector('div');
        if (!panel) return false;
        const rect = panel.getBoundingClientRect();
        return rect.top >= 0 && rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
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
  await expect(page.getByTestId('stock-list')).toContainText('검색 결과 없음');
  await expect(page.getByTestId('stock-list')).toContainText('다음 행동:');
  await expect(page.getByTestId('stock-detail')).toContainText('종목 상세 없음');
  await expect(page.getByTestId('stock-detail')).toContainText('다음 행동:');
  await expect(page.getByTestId('stock-detail')).not.toContainText('HD현대일렉트릭');
  await expectQualityPopoverVisible(page, 'stock-list-quality-popover', '종목 0개 수집 중');
  await expectNoAccessibilityViolations(page);
});

test.describe('dashboard availability fixtures', () => {
  test.describe.configure({ mode: 'serial' });

  for (const fixture of stockListAvailabilityFixtures) {
    test(`renders ${fixture.availability}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-only fixture matrix');

      await installStockListAvailabilityFixture(page, fixture.availability);
      await installDashboardStatusAvailabilityFixture(page, fixture.availability);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');

      await page.getByTestId('nav-tab-stocks').click();
      await expect(page.getByTestId('stock-list-status')).toHaveAttribute(
        'data-tone',
        fixture.expectedTone,
      );
      await expectQualityPopoverVisible(
        page,
        'stock-list-quality-popover',
        fixture.expectedTitle,
      );

      for (const section of dashboardStatusFixtureSections) {
        await page.getByTestId(section.navTabTestId).click();
        await expect(page.getByTestId(section.statusTestId)).toHaveAttribute(
          'data-tone',
          fixture.expectedTone,
        );
        await expectQualityPopoverVisible(
          page,
          section.popoverTestId,
          `${section.label} ${fixture.expectedTitleSuffix}`,
        );
      }
    });
  }
});

test.describe('stock detail availability fixtures', () => {
  test.describe.configure({ mode: 'serial' });

  for (const fixture of stockListAvailabilityFixtures) {
    test(`renders ${fixture.availability}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-only fixture matrix');

      await installStockDetailAvailabilityFixture(page, fixture.availability);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');
      await page.getByTestId('nav-tab-stocks').click();
      await page.getByTestId('stock-card-e2e-detail').click();

      await expect(page.getByTestId('stock-detail')).toContainText('E2E 상세 검증');
      await expect(page.getByTestId('stock-detail-quality-popover')).toHaveAttribute(
        'data-availability',
        fixture.availability,
      );
      await expectQualityPopoverVisible(
        page,
        'stock-detail-quality-popover',
        `심층 리포트 ${fixture.expectedTitleSuffix}`,
      );
    });
  }
});

test.describe('learning card availability fixtures', () => {
  test.describe.configure({ mode: 'serial' });

  for (const fixture of stockListAvailabilityFixtures) {
    test(`renders ${fixture.availability}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-only fixture matrix');

      await installLearningCardAvailabilityFixture(page, fixture.availability);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');
      await page.getByTestId('nav-tab-stocks').click();
      await page.getByTestId('stock-card-e2e-detail').click();

      await expect(page.getByTestId('learning-cards')).toContainText('E2E 공부 카드');
      await expect(page.getByTestId('learning-card-status-e2e-learning-card')).toHaveAttribute(
        'data-tone',
        fixture.expectedTone,
      );
      await expectQualityPopoverVisible(
        page,
        'learning-card-quality-popover-e2e-learning-card',
        `공부 카드 ${fixture.expectedTitleSuffix}`,
      );
    });
  }
});

test.describe('discover availability fixtures', () => {
  test.describe.configure({ mode: 'serial' });

  for (const fixture of stockListAvailabilityFixtures) {
    test(`renders ${fixture.availability}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop-only fixture matrix');

      await installDiscoverAvailabilityFixture(page, fixture.availability);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');
      await page.getByTestId('nav-tab-stocks').click();

      await expect(page.getByTestId('discover-status')).toHaveAttribute(
        'data-tone',
        fixture.expectedTone,
      );
      await expectQualityPopoverVisible(
        page,
        'discover-quality-popover',
        `발굴 후보 ${fixture.expectedTitleSuffix}`,
      );
      await expect(page.getByTestId('discover-list')).toContainText(
        fixture.availability === 'available' ? 'E2E 발굴 후보' : '다음 행동:',
      );
    });
  }
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

test('shared UI hardening keeps Korean text, long tokens, status badges, and raw buttons safe', async ({
  page,
}, testInfo) => {
  const tabPrefix = testInfo.project.name === 'mobile' ? 'mobile-tab' : 'nav-tab';

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-futur-hydrated', 'true');
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await page.getByTestId(`${tabPrefix}-stocks`).click();
  await expect(page.getByTestId('stock-list-status')).toHaveAttribute(
    'data-tone',
    /success|neutral|info|warning|danger|muted/,
  );

  const hardening = await page.evaluate(() => {
    const prose = document.createElement('p');
    prose.textContent = '워크스페이스처럼 긴 한국어 단어는 중간에서 쪼개지지 않아야 합니다.';
    const code = document.createElement('code');
    code.textContent =
      'https://example.com/research/source/very-long-url-that-must-wrap-without-overflow';
    const rawButton = document.createElement('button');
    rawButton.textContent = '원시 버튼';
    document.body.append(prose, code, rawButton);

    const bodyStyle = getComputedStyle(document.body);
    const proseStyle = getComputedStyle(prose);
    const codeStyle = getComputedStyle(code);
    const buttonStyle = getComputedStyle(rawButton);
    const result = {
      bodyWordBreak: bodyStyle.wordBreak,
      codeOverflowWrap: codeStyle.overflowWrap,
      codeWordBreak: codeStyle.wordBreak,
      proseOverflowWrap: proseStyle.overflowWrap,
      proseWordBreak: proseStyle.wordBreak,
      rawButtonTransition: buttonStyle.transitionProperty,
      rawButtonUserSelect: buttonStyle.userSelect,
    };
    prose.remove();
    code.remove();
    rawButton.remove();
    return result;
  });

  expect(hardening.bodyWordBreak).toBe('keep-all');
  expect(hardening.proseWordBreak).toBe('keep-all');
  expect(hardening.proseOverflowWrap).toBe('break-word');
  expect(hardening.codeWordBreak).toBe('normal');
  expect(hardening.codeOverflowWrap).toBe('anywhere');
  expect(hardening.rawButtonTransition).toContain('transform');
  expect(hardening.rawButtonUserSelect).toBe('none');
});
