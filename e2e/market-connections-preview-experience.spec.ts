import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const previewUrl = '/__dev-preview?surface=market-connections&scenario=default';
const primaryStory = 'AI 인프라 증설과 메모리 공급 조절이 한 경로에 모였습니다';

async function gotoPreview(page: Page, scenario = 'default') {
  await page.goto(`/__dev-preview?surface=market-connections&scenario=${scenario}`);
  await expect(page.getByRole('heading', { name: '내 종목에 영향을 줄 시장 변화' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeEnabled();
}

function priorityPanel(page: Page) {
  return page.locator('[aria-labelledby="priority-market-changes-title"]');
}

function marketList(page: Page) {
  return page.locator('[aria-labelledby="other-market-changes-title"]');
}

function storyOpener(page: Page, title = primaryStory) {
  return page.locator(`button[aria-label="${title} 시장 변화 상세 열기"]`);
}

async function openStory(page: Page, opener = storyOpener(page)) {
  await expect(opener).toBeEnabled();
  await opener.click();
  const inspector = page.getByTestId('market-connection-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText(primaryStory, { exact: true })).toBeVisible();
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

test.beforeEach(async ({ page }) => {
  await gotoPreview(page);
});

test('orders summary, personalized stories, and broader changes without advisory copy', async ({
  page,
}) => {
  const summary = page.locator('[aria-labelledby="market-connection-summary-title"]');
  const priority = priorityPanel(page);
  const broader = marketList(page);
  const [summaryBox, priorityBox, broaderBox] = await Promise.all([
    summary.boundingBox(),
    priority.boundingBox(),
    broader.boundingBox(),
  ]);
  expect(summaryBox?.y ?? Infinity).toBeLessThan(priorityBox?.y ?? 0);
  expect(priorityBox?.y ?? Infinity).toBeLessThan(broaderBox?.y ?? 0);
  await expect(priority.getByRole('button')).toHaveCount(3);
  await expect(priority.getByText('삼성전자', { exact: true }).first()).toBeVisible();
  await expect(priority.getByText('SK하이닉스', { exact: true })).toBeVisible();
  await expect(priority.getByText('NVIDIA', { exact: true })).toBeVisible();
  await expect(priority.getByText('Micron', { exact: true })).toBeVisible();
  expect(await priority.innerText()).not.toMatch(
    /0\.91|91%|지금 사세요|매도하세요|목표가|손절가|익절가|내일 오를 종목|상승 확률|가격 전망/,
  );
  expect(await broader.innerText()).not.toMatch(/0\.\d+|\d+%|목표가|손절가|익절가|가격 전망/);
});

test('shares one exact selected story between priority, list, and timeline entry points', async ({
  page,
}) => {
  const broaderTitle = 'AI 데이터센터 전력 수요가 관심 종목의 공급 일정과 연결됩니다';
  const broaderOpener = storyOpener(page, broaderTitle);
  await broaderOpener.click();
  await expect(
    page.getByTestId('market-connection-inspector').getByText(broaderTitle),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('market-connection-inspector')).toHaveCount(0);
  await expect(broaderOpener).toBeFocused();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  const { opener } = await openStory(page);
  await expect(opener).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('market-connection-inspector')).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.getByRole('radio', { name: '시간' }).click();
  const timelineOpener = page
    .getByTestId('market-mode-timeline')
    .locator(`button[aria-label="${primaryStory} 시장 변화 상세 열기"]`);
  await openStory(page, timelineOpener);
  await expect(timelineOpener).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('market-connection-inspector')).toContainText(
    '삼성전자와 SK하이닉스의 HBM 공급',
  );
});

test('keeps aggregate factor and map exploration read-only behind exactly four modes', async ({
  page,
}) => {
  const modes = page.getByRole('radiogroup', { name: '시장 보조 탐색 선택' }).getByRole('radio');
  await expect(modes.first()).toBeEnabled();
  await expect(modes).toHaveCount(4);
  await expect(modes.nth(0)).toHaveText('요인');
  await expect(modes.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('heading', { name: '요인별 변화' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: '종목별 시장 신호 강도와 관심·보유 연결 상태' }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: /히트맵|비교/ })).toHaveCount(0);
  await page.getByTestId('market-factor-group').first().click();
  await expect(page.getByTestId('market-connection-inspector')).toHaveCount(0);
  await page.getByRole('radio', { name: '지도' }).click();
  await expect(page.getByTestId('geo-map-canvas')).toBeVisible();
  await page.getByTestId('geo-map-canvas').click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('market-connection-inspector')).toHaveCount(0);
});

test('overlays a resizable desktop drawer and preserves its independent session width', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer contract');
  await page.evaluate(() => sessionStorage.clear());
  await gotoPreview(page);
  const listBefore = await marketList(page).boundingBox();
  const { inspector } = await openStory(page);
  const listAfter = await marketList(page).boundingBox();
  expect(Math.abs((listAfter?.x ?? 0) - (listBefore?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((listAfter?.width ?? 0) - (listBefore?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(520, 0);

  const resizer = page.getByRole('separator', { name: '시장 연결 상세 인스펙터 너비 조절' });
  await expect(resizer).toHaveAttribute('aria-valuemin', '420');
  await expect(resizer).toHaveAttribute('aria-valuemax', '760');
  await resizer.press('ArrowLeft');
  await expect(resizer).toHaveAttribute('aria-valuenow', '536');
  const box = await resizer.boundingBox();
  expect(box).not.toBeNull();
  await resizer.hover({ position: { x: 6, y: 30 } });
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) - 58, (box?.y ?? 0) + 30, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => resizer.getAttribute('aria-valuenow').then((value) => Number(value)))
    .toBeGreaterThan(536);
  const pointerWidth = await resizer.getAttribute('aria-valuenow');

  await inspector.getByRole('button', { name: '시장 연결 상세 인스펙터 닫기' }).click();
  await openStory(page);
  await expect(
    page.getByRole('separator', { name: '시장 연결 상세 인스펙터 너비 조절' }),
  ).toHaveAttribute('aria-valuenow', pointerWidth!);
  expect(
    await page.evaluate(() => ({
      market: sessionStorage.getItem('stock-insight:market-connection-inspector-width'),
      evidence: sessionStorage.getItem('stock-insight:evidence-inspector-width'),
      stocks: sessionStorage.getItem('stock-insight:stock-inspector-width'),
    })),
  ).toEqual({ market: pointerWidth, evidence: null, stocks: null });
});

test('closes only detail through overlay and Escape and restores the exact opener', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop overlay contract');
  const first = storyOpener(page);
  const second = marketList(page).getByRole('button').first();
  const secondBox = await second.boundingBox();
  await first.click();
  await page.mouse.click(
    (secondBox?.x ?? 0) + (secondBox?.width ?? 0) / 2,
    (secondBox?.y ?? 0) + (secondBox?.height ?? 0) / 2,
  );
  await expect(page.getByTestId('market-connection-inspector')).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(second).not.toHaveAttribute('aria-current', 'true');
  await expect(first).toBeFocused();

  await first.click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('market-connection-inspector')).toHaveCount(0);
  await expect(first).toBeFocused();
});

test('switches to a settled modal without refetching and keeps the design margin', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop modal contract');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(request.url());
  });
  const { inspector } = await openStory(page);
  const before = requests.length;
  await inspector.getByRole('button', { name: '넓게 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'modal');
  await waitForStableGeometry(inspector);
  expect(requests).toHaveLength(before);
  const box = await inspector.boundingBox();
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(25.5);
  expect(1440 - ((box?.x ?? 0) + (box?.width ?? 1440))).toBeGreaterThanOrEqual(25.5);
  await expect(inspector.getByRole('heading', { name: '관계 그래프' })).toBeVisible();
  await expect(inspector.getByRole('heading', { name: '전체 영향 경로' })).toBeVisible();
});

test('keeps HTTPS source links safe and 420px drawer text readable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop width and source contract');
  const { inspector } = await openStory(page);
  const links = inspector.locator('a[href]');
  await expect(links).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(links.nth(index)).toHaveAttribute('href', /^https:\/\//);
    await expect(links.nth(index)).toHaveAttribute('target', '_blank');
    await expect(links.nth(index)).toHaveAttribute('rel', /noreferrer/);
  }
  const resizer = page.getByRole('separator', { name: '시장 연결 상세 인스펙터 너비 조절' });
  for (let step = 0; step < 7; step += 1) await resizer.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '420');
  await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(420, 0);
  const textGeometry = await inspector
    .locator('section[aria-labelledby="market-inspector-summary"] p')
    .evaluate((node) => ({
      wordBreak: getComputedStyle(node).wordBreak,
      lineCount: (() => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length;
      })(),
    }));
  expect(textGeometry.wordBreak).not.toBe('break-all');
  expect(textGeometry.lineCount).toBeLessThanOrEqual(8);
});

test('localizes no-personalized, empty, partial, and permanent detail-error scenarios', async ({
  page,
}, testInfo) => {
  await gotoPreview(page, 'no-personalized');
  await expect(page.getByText('개인화된 주요 변화가 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '내 종목에 연결된 주요 변화' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '그 밖의 시장 변화' })).toBeVisible();

  await gotoPreview(page, 'empty');
  await expect(page.getByText('감지된 시장 변화가 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /시장 변화 상세 열기/ })).toHaveCount(0);
  await expect(page.getByLabel('시장 보조 탐색')).toHaveCount(0);
  expect(await page.getByTestId('workspace-content').innerText()).not.toMatch(
    /점수|강도|세계 지도/,
  );

  await gotoPreview(page, 'partial');
  await expect(storyOpener(page)).toBeVisible();
  await page.getByRole('radio', { name: '지도' }).click();
  await expect(page.getByTestId('market-mode-map_globe')).toContainText('세계 지도 데이터 준비 중');
  const { inspector } = await openStory(page);
  await expect(inspector.getByText(primaryStory, { exact: true })).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    await inspector.getByRole('button', { name: '넓게 보기' }).click();
    await expect(inspector.getByText('관계 그래프를 확인하지 못했습니다')).toBeVisible();
    await expect(inspector.getByText('지역 정보를 확인하지 못했습니다')).toBeVisible();
    await expect(inspector.getByText('이전 사건을 확인하지 못했습니다')).toBeVisible();
  }

  await gotoPreview(page, 'detail-error');
  const errorOpener = storyOpener(page);
  await errorOpener.click();
  const errorInspector = page.getByTestId('market-connection-inspector');
  await expect(errorInspector.getByText('시장 변화 상세를 불러오지 못했습니다')).toBeVisible();
  await expect(errorOpener).toHaveAttribute('aria-current', 'true');
  await errorInspector.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(errorInspector.getByText('시장 변화 상세를 불러오지 못했습니다')).toBeVisible();
});

test('stacks priority cards at 1240px without overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop boundary contract');
  await page.setViewportSize({ width: 1240, height: 900 });
  await gotoPreview(page);
  const cards = priorityPanel(page).getByRole('button');
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()),
  );
  expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y + boxes[1]!.height - 1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
});

test('supports dark mode, reduced motion, keyboard navigation, Axe, and mobile bottom-sheet', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await gotoPreview(page);
  const modes = page.getByRole('radiogroup', { name: '시장 보조 탐색 선택' }).getByRole('radio');
  await expect(modes.first()).toBeEnabled();
  await modes.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(modes.nth(1)).toBeFocused();
  await modes.nth(1).press('Space');
  await expect(modes.nth(1)).toHaveAttribute('aria-checked', 'true');
  const { inspector } = await openStory(page);
  await expect
    .poll(() => inspector.evaluate((node) => getComputedStyle(node).transform))
    .toBe('none');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  if (testInfo.project.name === 'mobile') {
    await expect(inspector).toHaveAttribute('data-inspector-presentation', 'mobile');
    await expect(inspector).toHaveAttribute('data-presentation', 'bottom-sheet');
    const box = await inspector.boundingBox();
    expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844)).toBeLessThanOrEqual(1);
    await expect(
      page.getByRole('separator', { name: '시장 연결 상세 인스펙터 너비 조절' }),
    ).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: '넓게 보기' })).toHaveCount(0);
  }
});

test('ships deterministic light and dark first-response canvas tokens', async ({ request }) => {
  const response = await request.get(previewUrl);
  const html = await response.text();
  expect(response.ok()).toBe(true);
  expect(html).toContain('data-initial-canvas');
  expect(html).toContain('#f2f1ec');
  expect(html).toContain('#11120f');
});
