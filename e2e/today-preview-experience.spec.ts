import { expect, test } from '@playwright/test';

const previewUrl = '/__dev-preview?surface=today';

test.beforeEach(async ({ page }) => {
  await page.goto(previewUrl);
  await expect(page.getByRole('heading', { name: '오늘의 투자 브리핑' })).toBeVisible();
});

test('separates briefing panels and headline cards as distinct surfaces', async ({
  page,
}, testInfo) => {
  const marketPanel = page.getByTestId('today-market-summary');
  const headlinePanel = page.getByTestId('today-headline-news');
  const [marketBox, headlineBox] = await Promise.all([
    marketPanel.boundingBox(),
    headlinePanel.boundingBox(),
  ]);

  expect(marketBox).not.toBeNull();
  expect(headlineBox).not.toBeNull();
  expect(
    (headlineBox?.y ?? 0) - ((marketBox?.y ?? 0) + (marketBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(16);

  const cards = headlinePanel.locator('li');
  const [firstCard, secondCard] = await Promise.all([
    cards.nth(0).boundingBox(),
    cards.nth(1).boundingBox(),
  ]);
  expect(firstCard).not.toBeNull();
  expect(secondCard).not.toBeNull();
  const cardGap =
    testInfo.project.name === 'mobile'
      ? (secondCard?.y ?? 0) - ((firstCard?.y ?? 0) + (firstCard?.height ?? 0))
      : (secondCard?.x ?? 0) - ((firstCard?.x ?? 0) + (firstCard?.width ?? 0));
  expect(cardGap).toBeGreaterThanOrEqual(12);
});

test('never illustrates a headline with an image the article did not carry', async ({ page }) => {
  // This used to assert three bundled JPEGs were present. They were picked by entity
  // key — KR:005930 got a memory-chip photo, MACRO got a treasury photo — so the
  // picture had nothing to do with the article it sat on. The RSS payload carries
  // only kind/region/source/title/url/when, so there was no real image to show.
  //
  // The invariant now runs the other way, and survives K7 adding og:image hotlinks:
  // a headline may carry an image only if it came from the article's own origin.
  const headlineCards = page.getByTestId('today-headline-news').locator('li');
  await expect(headlineCards).toHaveCount(3);
  const images = headlineCards.locator('img');
  for (let index = 0; index < (await images.count()); index += 1) {
    const source = await images.nth(index).getAttribute('src');
    expect(source, 'headline imagery must not be served from our own bundle').not.toMatch(
      /^\/media\//,
    );
  }
});

test('opens a working original-source link from a selected headline', async ({ page }) => {
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();

  const inspector = page.getByRole('dialog', { name: '근거 인스펙터' });
  await expect(inspector).toBeVisible();
  const sourceLink = inspector.getByRole('link', { name: /원문 뉴스 보기/ });
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute('href', /^https:\/\//);
});

test('ships the first response with a stable light and dark canvas', async ({ request }) => {
  const response = await request.get(previewUrl);
  const html = await response.text();

  expect(response.ok()).toBe(true);
  expect(html).toContain('data-initial-canvas');
  expect(html).toContain('#f2f1ec');
  expect(html).toContain('#11120f');
});

test('aligns every briefing card to one 20px content rail', async ({ page }) => {
  await expect(page.getByTestId('today-headline-news').getByRole('button').first()).toBeEnabled();
  const panelIds = [
    'today-market-summary',
    'today-headline-news',
    'today-curated-news',
    'today-news-list',
    'today-connection-summary',
  ];
  for (const panelId of panelIds) {
    const panel = page.locator(`[data-testid="${panelId}"]`).last();
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-slot="card"]')).toBeVisible();
    const [cardBox, headingBox] = await Promise.all([
      panel.locator('[data-slot="card"]').boundingBox(),
      panel.getByRole('heading', { level: 2 }).boundingBox(),
    ]);
    expect(cardBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    const headingInset = (headingBox?.x ?? 0) - (cardBox?.x ?? 0);
    expect(headingInset, panelId).toBeGreaterThanOrEqual(20);
    expect(headingInset, panelId).toBeLessThanOrEqual(22);
  }

  const marketPanel = page.locator('[data-testid="today-market-summary"]').last();
  const headlinePanel = page.locator('[data-testid="today-headline-news"]').last();
  const curatedPanel = page.locator('[data-testid="today-curated-news"]').last();
  const newsPanel = page.locator('[data-testid="today-news-list"]').last();
  const connectionPanel = page.locator('[data-testid="today-connection-summary"]').last();
  const railTargets = [
    marketPanel
      .locator('[aria-label="오늘의 주요 시장 지표 샘플"] li')
      .first()
      .locator('span')
      .first(),
    headlinePanel.locator('[aria-label="오늘의 핵심 카드 뉴스"] li').first().locator('button'),
    curatedPanel
      .locator('[aria-label="내 관심종목 큐레이터 뉴스"] li')
      .first()
      .locator('[data-slot="button-label"] > span'),
    newsPanel.locator('[aria-label="인사이트 분류"] button').first(),
    newsPanel
      .locator('[aria-label="더 살펴볼 시장 변화"] li')
      .first()
      .locator('[data-slot="button-label"] > span'),
    connectionPanel.locator('[aria-label="개인화 연결 현황"] dt').first(),
    connectionPanel
      .locator('[aria-label="시장 연결 경로 요약"] li')
      .first()
      .locator('[data-slot="button-label"] > span'),
  ];
  const cardBox = await marketPanel.locator('[data-slot="card"]').boundingBox();
  expect(cardBox).not.toBeNull();
  for (const target of railTargets) {
    const targetBox = await target.boundingBox();
    expect(targetBox).not.toBeNull();
    expect((targetBox?.x ?? 0) - (cardBox?.x ?? 0)).toBeGreaterThanOrEqual(20);
    expect((targetBox?.x ?? 0) - (cardBox?.x ?? 0)).toBeLessThanOrEqual(23);
  }

  const [connectionBox, evidenceBox] = await Promise.all([
    connectionPanel.locator('[data-slot="card"]').boundingBox(),
    connectionPanel
      .locator('[aria-label="시장 연결 경로 요약"] li')
      .first()
      .locator('em')
      .boundingBox(),
  ]);
  expect(connectionBox).not.toBeNull();
  expect(evidenceBox).not.toBeNull();
  expect(
    (connectionBox?.x ?? 0) +
      (connectionBox?.width ?? 0) -
      ((evidenceBox?.x ?? 0) + (evidenceBox?.width ?? 0)),
  ).toBeGreaterThanOrEqual(20);
  expect(
    (connectionBox?.x ?? 0) +
      (connectionBox?.width ?? 0) -
      ((evidenceBox?.x ?? 0) + (evidenceBox?.width ?? 0)),
  ).toBeLessThanOrEqual(22);
});

test('keeps the active news lane indicator as a thin underline', async ({ page }) => {
  await expect(
    page.getByTestId('today-news-list').getByRole('tab', { name: /꼭 봐야 할 변화/ }),
  ).toBeVisible();
  const indicator = page.getByTestId('today-news-list').locator('[data-slot="motion-highlight"]');
  await expect(indicator).toBeVisible();

  const box = await indicator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 0).toBeLessThanOrEqual(3);
});

test('opens the evidence drawer above the workspace without changing card geometry', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer contract');
  const panel = page.getByTestId('today-headline-news');
  const before = await panel.boundingBox();

  await panel.getByRole('button', { name: /메모리 가격 반등/ }).click();

  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toBeVisible();
  const after = await panel.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');

  const placement = await inspector.evaluate((element) => ({
    position: getComputedStyle(element).position,
    zIndex: Number(getComputedStyle(element).zIndex),
  }));
  expect(placement.position).toBe('fixed');
  expect(placement.zIndex).toBeGreaterThan(30);

  const evidenceMeta = inspector.locator('dl').filter({ hasText: '근거 수준' });
  const metaColumns = await evidenceMeta.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean),
  );
  expect(metaColumns).toHaveLength(2);
});

test('restores a programmatically activated opener after close on every viewport', async ({
  page,
}) => {
  const opener = page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ });

  await expect(opener).toBeEnabled();
  const wasFocusedBeforeActivation = await opener.evaluate((element) => {
    const wasFocused = element.ownerDocument.activeElement === element;
    element.click();
    return wasFocused;
  });
  expect(wasFocusedBeforeActivation).toBe(false);

  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toBeVisible();
  await expect
    .poll(() =>
      inspector.evaluate((element) => element.contains(element.ownerDocument.activeElement)),
    )
    .toBe(true);

  await inspector.getByRole('button', { name: '인스펙터 닫기' }).click();
  await expect(inspector).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('uses a drawer overlay that closes without activating the card behind it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop outside interaction contract');
  const headlines = page.getByTestId('today-headline-news');
  const firstHeadline = headlines.getByRole('button', { name: /메모리 가격 반등/ });
  const secondHeadline = headlines.getByRole('button', { name: /북미 클라우드/ });
  const secondBox = await secondHeadline.boundingBox();
  expect(secondBox).not.toBeNull();

  await firstHeadline.click();

  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('메모리 가격 반등');
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-overlay-tone', 'light');

  await page.mouse.click(
    (secondBox?.x ?? 0) + (secondBox?.width ?? 0) / 2,
    (secondBox?.y ?? 0) + (secondBox?.height ?? 0) / 2,
  );

  await expect(inspector).toHaveCount(0);
  await expect(firstHeadline).toHaveAttribute('aria-current', 'true');
  await expect(secondHeadline).toHaveAttribute('aria-current', 'false');
});

test('uses the same inset full-border selected surface for every Today evidence entry', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop selected-surface contract');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const selectedSurface = async (element: ReturnType<typeof page.locator>) =>
    element.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        borderColors: [
          style.borderTopColor,
          style.borderRightColor,
          style.borderBottomColor,
          style.borderLeftColor,
        ],
        borderWidths: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        boxShadow: style.boxShadow,
      };
    });
  const headline = page
    .getByTestId('today-headline-news')
    .locator('[aria-label="오늘의 핵심 카드 뉴스"] button')
    .first();
  await headline.click();
  await expect(headline).toHaveAttribute('aria-current', 'true');
  await expect.poll(async () => (await selectedSurface(headline)).boxShadow).toMatch(/8px 22px/);
  await headline.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const headlineSurface = await selectedSurface(headline);
  const inspector = page.getByTestId('evidence-inspector');
  await inspector.getByRole('button', { name: '인스펙터 닫기' }).click();
  await expect(inspector).toHaveCount(0);

  const listRow = page.getByTestId('today-news-list').getByTestId('research-feed-record').first();
  await listRow.click();
  await expect(listRow).toHaveAttribute('aria-current', 'true');
  await expect.poll(async () => selectedSurface(listRow)).toEqual(headlineSurface);
  const listSurface = await selectedSurface(listRow);
  const list = page.getByTestId('today-news-list').locator('ul[aria-label="더 살펴볼 시장 변화"]');
  const [listBox, listRowBox] = await Promise.all([list.boundingBox(), listRow.boundingBox()]);
  expect((listRowBox?.x ?? 0) - (listBox?.x ?? 0)).toBeGreaterThanOrEqual(4);
  expect(
    (listBox?.x ?? 0) + (listBox?.width ?? 0) - ((listRowBox?.x ?? 0) + (listRowBox?.width ?? 0)),
  ).toBeGreaterThanOrEqual(4);
  await inspector.getByRole('button', { name: '인스펙터 닫기' }).click();
  await expect(inspector).toHaveCount(0);

  const connectionRow = page.getByTestId('today-connection-summary').locator('button').first();
  await connectionRow.click();
  await expect(connectionRow).toHaveAttribute('aria-current', 'true');
  await expect.poll(async () => selectedSurface(connectionRow)).toEqual(headlineSurface);
  const connectionSurface = await selectedSurface(connectionRow);

  expect(headlineSurface.borderWidths).toEqual(['1px', '1px', '1px', '1px']);
  expect(listSurface.borderWidths).toEqual(headlineSurface.borderWidths);
  expect(listSurface.borderColors).toEqual(headlineSurface.borderColors);
  expect(listSurface.backgroundColor).toBe(headlineSurface.backgroundColor);
  expect(listSurface.boxShadow).toBe(headlineSurface.boxShadow);
  expect(connectionSurface.borderWidths).toEqual(headlineSurface.borderWidths);
  expect(connectionSurface.borderColors).toEqual(headlineSurface.borderColors);
  expect(connectionSurface.backgroundColor).toBe(headlineSurface.backgroundColor);
  expect(connectionSurface.boxShadow).toBe(headlineSurface.boxShadow);
  expect(listSurface.boxShadow).not.toBe('none');
});

test('resizes the evidence drawer accessibly and remembers the width for the session', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop resize contract');
  const headline = page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ });
  await headline.click();

  const inspector = page.getByTestId('evidence-inspector');
  const separator = page.getByRole('separator', { name: '근거 인스펙터 너비 조절' });
  await expect(separator).toHaveAttribute('aria-valuenow', '520');
  await separator.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '536');
  expect((await inspector.boundingBox())?.width).toBeCloseTo(536, 0);

  await inspector.getByRole('button', { name: '인스펙터 닫기' }).click();
  await expect(inspector).toHaveCount(0);
  await headline.click();
  await expect(page.getByRole('separator', { name: '근거 인스펙터 너비 조절' })).toHaveAttribute(
    'aria-valuenow',
    '536',
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem('stock-insight:evidence-inspector-width')),
  ).toBe('536');
});

test('resizes the evidence drawer from its left edge with pointer input', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop resize contract');
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();

  const inspector = page.getByTestId('evidence-inspector');
  const separator = page.getByRole('separator', { name: '근거 인스펙터 너비 조절' });
  await expect
    .poll(() => inspector.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none');
  const handle = await separator.boundingBox();
  expect(handle).not.toBeNull();
  const startWidth = Number(await separator.getAttribute('aria-valuenow'));
  const startX = (handle?.x ?? 0) + (handle?.width ?? 0) / 2;
  const startY = (handle?.y ?? 0) + Math.min(120, (handle?.height ?? 0) / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 48, startY, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await separator.getAttribute('aria-valuenow')))
    .toBeGreaterThan(startWidth);
});

test('toggles the same evidence detail between drawer and centered modal', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop presentation contract');
  const detailRequests: string[] = [];
  page.on('request', (request) => {
    if (/research-record|entity-relations/.test(request.url())) detailRequests.push(request.url());
  });
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();

  const inspector = page.getByTestId('evidence-inspector');
  const title = inspector.getByRole('heading', { level: 2 });
  const expectedTitle = await title.textContent();
  const requestCountBeforeToggle = detailRequests.length;
  const expandButton = inspector.getByRole('button', { name: '넓게 보기' });
  const expandButtonBox = await expandButton.boundingBox();
  expect(expandButtonBox?.height ?? 0).toBeGreaterThanOrEqual(35);
  expect(expandButtonBox?.width ?? 0).toBeGreaterThan(expandButtonBox?.height ?? 0);
  await expandButton.click();

  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'modal');
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-overlay-tone', 'light');
  const modalBox = await inspector.boundingBox();
  expect(modalBox?.width ?? 0).toBeGreaterThanOrEqual(759);
  expect(modalBox?.width ?? Infinity).toBeLessThanOrEqual(960);
  await expect(title).toHaveText(expectedTitle ?? '');
  expect(detailRequests).toHaveLength(requestCountBeforeToggle);
  await expect(page.getByRole('separator', { name: '근거 인스펙터 너비 조절' })).toHaveCount(0);

  await inspector.getByRole('button', { name: '옆에서 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toBeVisible();

  await inspector.getByRole('button', { name: '넓게 보기' }).click();
  await expect(overlay).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(inspector).toHaveCount(0);
});

test('returns a replaced evidence detail to the desktop drawer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop presentation reset contract');
  const headlines = page.getByTestId('today-headline-news');
  await headlines.getByRole('button', { name: /메모리 가격 반등/ }).click();

  const inspector = page.getByTestId('evidence-inspector');
  await inspector.getByRole('button', { name: '넓게 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'modal');

  await headlines
    .locator('[aria-label="오늘의 핵심 카드 뉴스"] button')
    .nth(1)
    .evaluate((element: HTMLButtonElement) => element.click());

  await expect(inspector).toContainText('북미 클라우드');
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
});

test('keeps mobile evidence detail as the existing bottom modal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile contract');
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();

  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'mobile');
  await expect(inspector).toHaveAttribute('data-presentation', 'bottom-sheet');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toBeVisible();
  await expect(page.getByTestId('workspace-content')).toHaveAttribute('inert', '');
  await expect(page.getByRole('separator', { name: '근거 인스펙터 너비 조절' })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: '넓게 보기' })).toHaveCount(0);
  await expect
    .poll(() => inspector.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none');
  const box = await inspector.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844)).toBeLessThanOrEqual(1);
  expect(box?.width ?? Infinity).toBeLessThanOrEqual(391);
});

test('settles the evidence drawer without transform motion when reduced motion is requested', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop reduced-motion contract');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();

  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toBeVisible();
  await expect
    .poll(() => inspector.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none');
});
