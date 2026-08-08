import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const previewUrl = '/__dev-preview?surface=stocks&scenario=default';

async function gotoPreview(page: Page, url = previewUrl) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: '내 종목 브리핑' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeEnabled();
}

function panelForHeading(page: Page, name: string) {
  const headingIds: Record<string, string> = {
    '우선 확인할 보유종목': 'priority-holdings-title',
    '전체 보유종목': 'stock-holdings-title',
    '변화가 있는 관심종목': 'stock-watchlist-title',
  };
  return page.locator(`[aria-labelledby="${headingIds[name]}"] [data-slot="card"]`);
}

async function openStock(panel: Locator, name: string) {
  const opener = panel.locator(`button[aria-label="${name} 종목 브리핑 열기"]`);
  await expect(opener).toBeEnabled();
  await opener.click();
  const inspector = panel.page().getByTestId('stock-briefing-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText(name, { exact: true })).toBeVisible();
  return { inspector, opener };
}

async function waitForStableGeometry(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate(
        (node) =>
          new Promise<boolean>((resolve) => {
            const first = node.getBoundingClientRect();
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const second = node.getBoundingClientRect();
                const style = getComputedStyle(node);
                resolve(
                  style.opacity === '1' &&
                    style.transform === 'none' &&
                    Math.abs(first.x - second.x) < 0.01 &&
                    Math.abs(first.width - second.width) < 0.01,
                );
              });
            });
          }),
      ),
    )
    .toBe(true);
}

async function expectReadableSummaryMetrics(inspector: Locator, expectedDrawerWidth: number) {
  await expect
    .poll(async () => (await inspector.boundingBox())?.width)
    .toBeCloseTo(expectedDrawerWidth, 0);
  const values = inspector.locator(
    'section[aria-labelledby="stock-inspector-summary"] dl > div > dd',
  );
  await expect(values).toHaveCount(6);
  const geometry = await values.evaluateAll((nodes) =>
    nodes.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return {
        lineCount: range.getClientRects().length,
        width: node.getBoundingClientRect().width,
      };
    }),
  );
  for (const value of geometry) expect(value.width).toBeGreaterThanOrEqual(64);
  expect(geometry[3]?.lineCount).toBe(1);
  expect(geometry[4]?.lineCount).toBe(1);
  expect(geometry[5]?.lineCount ?? Infinity).toBeLessThanOrEqual(2);
}

test.beforeEach(async ({ page }) => {
  await gotoPreview(page);
});

test('places at most three priority holdings before the full holdings list', async ({ page }) => {
  const priority = panelForHeading(page, '우선 확인할 보유종목');
  const holdings = panelForHeading(page, '전체 보유종목');
  await expect(priority.getByRole('button')).toHaveCount(3);
  const [priorityBox, holdingsBox] = await Promise.all([
    priority.boundingBox(),
    holdings.boundingBox(),
  ]);
  expect(priorityBox).not.toBeNull();
  expect(holdingsBox).not.toBeNull();
  if ((priorityBox?.y ?? 0) === (holdingsBox?.y ?? 0)) {
    expect(priorityBox?.x ?? Infinity).toBeLessThan(holdingsBox?.x ?? 0);
  } else {
    expect(priorityBox?.y ?? Infinity).toBeLessThan(holdingsBox?.y ?? 0);
  }

  const copy = await page.getByTestId('workspace-content').innerText();
  expect(copy).not.toMatch(
    /평가금액|누적 수익률|지금 사세요|매도하세요|목표가|손절가|익절가|내일 오를 종목/,
  );
});

test('uses the full card width for stock row content in every entry section', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop stacked-card geometry contract');
  await page.setViewportSize({ width: 1180, height: 900 });
  await gotoPreview(page);
  const entries = [
    { panel: '우선 확인할 보유종목', stock: '삼성전자' },
    { panel: '전체 보유종목', stock: '삼성전자' },
    { panel: '변화가 있는 관심종목', stock: 'NVIDIA' },
  ];

  for (const entry of entries) {
    await page
      .getByRole('heading', { name: entry.panel })
      .evaluate((heading) => heading.scrollIntoView({ block: 'center' }));
    const row = panelForHeading(page, entry.panel).locator(
      `button[aria-label="${entry.stock} 종목 브리핑 열기"]`,
    );
    await expect(row).toBeVisible();
    await expect
      .poll(() =>
        row.evaluate((node) => {
          const label = node.querySelector<HTMLElement>('[data-slot="button-label"]');
          const layout = label?.firstElementChild as HTMLElement | null;
          return layout ? getComputedStyle(layout).display : null;
        }),
      )
      .toBe('grid');
    const geometry = await row.evaluate((node) => {
      const button = node.getBoundingClientRect();
      const buttonStyle = getComputedStyle(node);
      const content = node.querySelector<HTMLElement>('[data-slot="button-content"]');
      const label = node.querySelector<HTMLElement>('[data-slot="button-label"]');
      const layout = label?.firstElementChild as HTMLElement | null;
      const metrics = layout?.lastElementChild as HTMLElement | null;

      if (!content || !label || !layout || !metrics) return null;

      const horizontalPadding =
        Number.parseFloat(buttonStyle.paddingLeft) + Number.parseFloat(buttonStyle.paddingRight);
      const horizontalBorder =
        Number.parseFloat(buttonStyle.borderLeftWidth) +
        Number.parseFloat(buttonStyle.borderRightWidth);
      return {
        availableWidth: button.width - horizontalPadding - horizontalBorder,
        contentWidth: content.getBoundingClientRect().width,
        labelWidth: label.getBoundingClientRect().width,
        layoutWidth: layout.getBoundingClientRect().width,
        metricsRightGap: button.right - metrics.getBoundingClientRect().right,
        rightInset:
          Number.parseFloat(buttonStyle.paddingRight) +
          Number.parseFloat(buttonStyle.borderRightWidth),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.contentWidth ?? 0, `${entry.panel} content width`).toBeGreaterThanOrEqual(
      (geometry?.availableWidth ?? Infinity) - 1,
    );
    expect(geometry?.labelWidth ?? 0, `${entry.panel} label width`).toBeGreaterThanOrEqual(
      (geometry?.availableWidth ?? Infinity) - 1,
    );
    expect(geometry?.layoutWidth ?? 0, `${entry.panel} layout width`).toBeGreaterThanOrEqual(
      (geometry?.availableWidth ?? Infinity) - 1,
    );
    expect(
      geometry?.metricsRightGap ?? Infinity,
      `${entry.panel} metrics right gap`,
    ).toBeLessThanOrEqual((geometry?.rightInset ?? 0) + 1);
  }
});

test('opens matching detail from priority, holdings, and watchlist entry points', async ({
  page,
}) => {
  const entries = [
    { panel: '우선 확인할 보유종목', stock: '삼성전자' },
    { panel: '전체 보유종목', stock: '삼성전자' },
    { panel: '변화가 있는 관심종목', stock: 'NVIDIA' },
  ];

  for (const entry of entries) {
    const { inspector, opener } = await openStock(panelForHeading(page, entry.panel), entry.stock);
    await expect(opener).toHaveAttribute('aria-current', 'true');
    await inspector.getByRole('button', { name: '종목 브리핑 인스펙터 닫기' }).click();
    await expect(inspector).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test('shows held, watched, linked-news, and evidence context in stock detail', async ({ page }) => {
  const holding = await openStock(panelForHeading(page, '우선 확인할 보유종목'), '삼성전자');
  const holdingSummary = holding.inspector.locator(
    'section[aria-labelledby="stock-inspector-summary"]',
  );
  await expect(holdingSummary).toContainText('보유종목');
  await expect(holdingSummary).not.toContainText('관심종목');
  await expect(holdingSummary).toContainText('연결 뉴스');
  await expect(holdingSummary).toContainText('3건');
  await expect(holdingSummary).toContainText('근거 수준');
  await expect(holdingSummary).toContainText('높음');
  await holding.inspector.getByRole('button', { name: '종목 브리핑 인스펙터 닫기' }).click();

  const watchlist = await openStock(panelForHeading(page, '변화가 있는 관심종목'), 'NVIDIA');
  const watchlistSummary = watchlist.inspector.locator(
    'section[aria-labelledby="stock-inspector-summary"]',
  );
  await expect(watchlistSummary).not.toContainText('보유종목');
  await expect(watchlistSummary).toContainText('관심종목');
  await expect(watchlistSummary).toContainText('중간');
});

test('opens the stock drawer above the workspace without changing page geometry', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer contract');
  const holdings = panelForHeading(page, '전체 보유종목');
  const before = await holdings.boundingBox();
  const { inspector } = await openStock(panelForHeading(page, '우선 확인할 보유종목'), '삼성전자');
  const after = await holdings.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  expect(await inspector.evaluate((node) => getComputedStyle(node).position)).toBe('fixed');
});

test('keeps drawer summary values readable at the default and minimum widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer summary contract');
  await page.evaluate(() => sessionStorage.clear());
  await gotoPreview(page);
  try {
    const { inspector } = await openStock(
      panelForHeading(page, '우선 확인할 보유종목'),
      '삼성전자',
    );
    const resizer = page.getByRole('separator', { name: '종목 브리핑 인스펙터 너비 조절' });
    await expect(resizer).toHaveAttribute('aria-valuenow', '520');
    await expectReadableSummaryMetrics(inspector, 520);

    for (let step = 0; step < 7; step += 1) await resizer.press('ArrowRight');
    await expect(resizer).toHaveAttribute('aria-valuenow', '420');
    await expectReadableSummaryMetrics(inspector, 420);
  } finally {
    await page.evaluate(() => sessionStorage.clear());
  }
});

test('overlay click closes only and does not activate the stock behind it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop outside interaction contract');
  const priority = panelForHeading(page, '우선 확인할 보유종목');
  const first = priority.getByRole('button', { name: '삼성전자 종목 브리핑 열기' });
  const second = priority.getByRole('button', { name: 'SK하이닉스 종목 브리핑 열기' });
  const secondBox = await second.boundingBox();
  expect(secondBox).not.toBeNull();
  await first.click();
  const inspector = page.getByTestId('stock-briefing-inspector');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveAttribute(
    'data-overlay-tone',
    'light',
  );
  await page.mouse.click(
    (secondBox?.x ?? 0) + (secondBox?.width ?? 0) / 2,
    (secondBox?.y ?? 0) + (secondBox?.height ?? 0) / 2,
  );
  await expect(inspector).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(second).not.toHaveAttribute('aria-current', 'true');
});

test('keeps Evidence and Stocks inspector session widths independent', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop session storage contract');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/__dev-preview?surface=today');
  const evidenceOpener = page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ });
  await expect(evidenceOpener).toBeEnabled();
  await evidenceOpener.click();
  const evidenceResizer = page.getByRole('separator', { name: '근거 인스펙터 너비 조절' });
  await evidenceResizer.press('ArrowLeft');
  await expect(evidenceResizer).toHaveAttribute('aria-valuenow', '536');

  await gotoPreview(page);
  await openStock(panelForHeading(page, '우선 확인할 보유종목'), '삼성전자');
  const stockResizer = page.getByRole('separator', { name: '종목 브리핑 인스펙터 너비 조절' });
  await expect(stockResizer).toHaveAttribute('aria-valuenow', '520');
  await stockResizer.press('ArrowLeft');
  await expect(stockResizer).toHaveAttribute('aria-valuenow', '536');
  expect(
    await page.evaluate(() => ({
      evidence: sessionStorage.getItem('stock-insight:evidence-inspector-width'),
      stocks: sessionStorage.getItem('stock-insight:stock-inspector-width'),
    })),
  ).toEqual({ evidence: '536', stocks: '536' });
  await stockResizer.press('ArrowLeft');
  expect(
    await page.evaluate(() => ({
      evidence: sessionStorage.getItem('stock-insight:evidence-inspector-width'),
      stocks: sessionStorage.getItem('stock-insight:stock-inspector-width'),
    })),
  ).toEqual({ evidence: '536', stocks: '552' });
});

test('remembers resized stock drawer width for the session', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop resize contract');
  const priority = panelForHeading(page, '우선 확인할 보유종목');
  const { inspector } = await openStock(priority, '삼성전자');
  const resizer = page.getByRole('separator', { name: '종목 브리핑 인스펙터 너비 조절' });
  await resizer.press('ArrowLeft');
  await expect(resizer).toHaveAttribute('aria-valuenow', '536');
  await inspector.getByRole('button', { name: '종목 브리핑 인스펙터 닫기' }).click();
  await openStock(priority, '삼성전자');
  await expect(
    page.getByRole('separator', { name: '종목 브리핑 인스펙터 너비 조절' }),
  ).toHaveAttribute('aria-valuenow', '536');
});

test('switches drawer and modal without another data request', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop presentation contract');
  const { inspector } = await openStock(panelForHeading(page, '우선 확인할 보유종목'), '삼성전자');
  const dataRequests: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) dataRequests.push(request.url());
  });
  const before = dataRequests.length;
  await inspector.getByRole('button', { name: '넓게 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'modal');
  await expect(inspector.getByText('삼성전자', { exact: true })).toBeVisible();
  expect(dataRequests).toHaveLength(before);
  await expect(page.getByRole('separator', { name: '종목 브리핑 인스펙터 너비 조절' })).toHaveCount(
    0,
  );
  await inspector.getByRole('button', { name: '옆에서 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  expect(dataRequests).toHaveLength(before);
});

test('keeps centered detail modals at least 24px from 768–807px viewport edges', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop boundary geometry contract');
  for (const width of [768, 807]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoPreview(page);
    const { inspector } = await openStock(
      panelForHeading(page, '우선 확인할 보유종목'),
      '삼성전자',
    );
    await inspector.getByRole('button', { name: '넓게 보기' }).click();
    await waitForStableGeometry(inspector);
    const box = await inspector.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(25);
    expect(width - ((box?.x ?? 0) + (box?.width ?? width))).toBeGreaterThanOrEqual(25);
  }
});

test('does not clip the selected full-border shadow in any stock list', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop selected geometry contract');
  const entries = [
    { panel: '우선 확인할 보유종목', stock: '삼성전자' },
    { panel: '전체 보유종목', stock: '삼성전자' },
    { panel: '변화가 있는 관심종목', stock: 'NVIDIA' },
  ];
  for (const entry of entries) {
    const panel = panelForHeading(page, entry.panel);
    const { inspector, opener } = await openStock(panel, entry.stock);
    const geometry = await opener.evaluate((node) => {
      const parent = node.parentElement;
      if (!parent) return null;
      const row = node.getBoundingClientRect();
      const list = parent.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        borderRadius: style.borderRadius,
        borderWidths: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        boxShadow: style.boxShadow,
        insetLeft: row.left - list.left,
        insetRight: list.right - row.right,
        overflow: getComputedStyle(parent).overflow,
      };
    });
    expect(geometry).not.toBeNull();
    expect(Number.parseFloat(geometry?.borderRadius ?? '0')).toBeGreaterThanOrEqual(10);
    expect(geometry?.borderWidths).toEqual(['1px', '1px', '1px', '1px']);
    expect(geometry?.boxShadow).not.toBe('none');
    expect(geometry?.insetLeft ?? 0).toBeGreaterThanOrEqual(10);
    expect(geometry?.insetRight ?? 0).toBeGreaterThanOrEqual(10);
    expect(geometry?.overflow).toBe('visible');
    await page.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
  }
});

test('uses HTTPS original-source links in stock detail', async ({ page }) => {
  const { inspector } = await openStock(panelForHeading(page, '우선 확인할 보유종목'), '삼성전자');
  const source = inspector.locator('a[href^="https://"]').first();
  await expect(source).toHaveAttribute('href', /^https:\/\//);
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', /noreferrer/);
  expect(await inspector.innerText()).not.toMatch(/매수|매도|목표가|손절가|익절가/);
});

test('renders watched-only content before honest holdings guidance', async ({ page }) => {
  await gotoPreview(page, '/__dev-preview?surface=stocks&scenario=no-holdings');
  const summary = page.locator('[aria-labelledby="stocks-briefing-summary-title"]');
  const watchlistHeading = page.getByRole('heading', { name: '변화가 있는 관심종목' });
  const guidance = page.getByText('보유종목 등록이 필요합니다', { exact: true });
  expect(
    await summary.locator('dl > div').evaluateAll((rows) =>
      rows.map((row) => ({
        label: row.querySelector('dt')?.textContent?.trim(),
        value: row.querySelector('dd')?.textContent?.trim(),
      })),
    ),
  ).toEqual([
    { label: '보유종목', value: '0개' },
    { label: '연결 뉴스', value: '—' },
    { label: '확인할 리스크', value: '—' },
    { label: '최근 분석', value: '—' },
  ]);
  await expect(summary.getByLabel('집계 데이터 없음')).toHaveCount(2);
  await expect(summary.getByLabel('분석 시각 없음')).toHaveCount(1);
  await expect(watchlistHeading).toBeVisible();
  await expect(guidance).toBeVisible();
  expect(
    await watchlistHeading.evaluate(
      (heading, other) =>
        Boolean(heading.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
      await guidance.elementHandle(),
    ),
  ).toBe(true);
  await expect(page.getByRole('heading', { name: '우선 확인할 보유종목' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '전체 보유종목' })).toHaveCount(0);
});

test('renders one honest all-empty state', async ({ page }) => {
  await gotoPreview(page, '/__dev-preview?surface=stocks&scenario=empty');
  await expect(page.getByText('아직 보유·관심 종목이 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /종목 브리핑 열기/ })).toHaveCount(0);
});

test('keeps selection and offers retry when mandatory detail loading fails', async ({ page }) => {
  await gotoPreview(page, '/__dev-preview?surface=stocks&scenario=detail-error');
  const priority = panelForHeading(page, '우선 확인할 보유종목');
  const opener = priority.locator('button[aria-label="삼성전자 종목 브리핑 열기"]');
  await expect(opener).toBeEnabled();
  await opener.click();
  const inspector = page.getByTestId('stock-briefing-inspector');
  await expect(
    inspector.getByText('종목 브리핑을 불러오지 못했습니다', { exact: true }),
  ).toBeVisible();
  await expect(inspector.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  await expect(opener).toHaveAttribute('aria-current', 'true');
});

test('supports dark mode, reduced motion, accessibility, and 390px containment', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await gotoPreview(page);
  const { inspector } = await openStock(panelForHeading(page, '우선 확인할 보유종목'), '삼성전자');
  await expect
    .poll(() => inspector.evaluate((node) => getComputedStyle(node).transform))
    .toBe('none');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  if (testInfo.project.name === 'mobile') {
    await expect(inspector).toHaveAttribute('data-inspector-presentation', 'mobile');
    await expect(inspector).toHaveAttribute('data-presentation', 'bottom-sheet');
    await expect(
      page.getByRole('separator', { name: '종목 브리핑 인스펙터 너비 조절' }),
    ).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: '넓게 보기' })).toHaveCount(0);
    const box = await inspector.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844)).toBeLessThanOrEqual(1);
    expect(box?.width ?? Infinity).toBeLessThanOrEqual(390);
  }
});
