import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const titles = ['오늘', '내 종목', '시장 연결', '복기'];
const forbiddenCopy =
  /지금 사세요|매도하세요|목표가|손절가|익절가|내일 오를 종목|수익률|성공(?:한|입니다|판단)|실패(?:한|입니다|판단)|신뢰도 점수|행 수|작업명|분석 실행/;

async function gotoPreview(page: Page, scenario = 'default') {
  await page.goto(`/__dev-preview?surface=status&scenario=${scenario}`);
  if (scenario !== 'error') {
    await expect(page.getByRole('heading', { name: '데이터 신뢰도', level: 1 })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeEnabled();
}

function card(page: Page, title: string) {
  const surface = {
    오늘: 'today',
    '내 종목': 'stocks',
    '시장 연결': 'market_connections',
    복기: 'history',
  }[title];
  return page.locator(`button[data-surface="${surface}"]`);
}

async function openReliability(page: Page, title = '오늘') {
  const opener = card(page, title);
  await expect(opener).toBeEnabled();
  await opener.click();
  const inspector = page.locator('[data-testid="reliability-inspector"]:visible');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('heading', { name: '상태 요약' })).toBeVisible();
  await expect(inspector).toContainText(`${title} 데이터 신뢰도`);
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
  await expect(page.locator('body')).not.toContainText(forbiddenCopy);
});

test('keeps overall state, four surfaces, and common limitations in fixed order', async ({
  page,
}) => {
  const regions = page.locator(
    '[aria-labelledby="reliability-overall-title"], [aria-label="기능별 데이터 신뢰도"], [aria-labelledby="reliability-limitations-title"]',
  );
  await expect(regions).toHaveCount(3);
  const labels = await regions.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-labelledby') ?? node.getAttribute('aria-label')),
  );
  expect(labels).toEqual([
    'reliability-overall-title',
    '기능별 데이터 신뢰도',
    'reliability-limitations-title',
  ]);
  const cards = page.getByTestId('reliability-surface-card');
  await expect(cards).toHaveCount(4);
  expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()))).toEqual(
    expect.arrayContaining(titles.map((title) => expect.stringContaining(title))),
  );
  for (const title of titles) await expect(card(page, title)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(forbiddenCopy);
});

test('shares exact selection and matching detail across all four surface cards', async ({
  page,
}) => {
  for (const title of titles) {
    const { inspector, opener } = await openReliability(page, title);
    await expect(opener).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test('restores an exact programmatic opener after close', async ({ page }) => {
  const opener = card(page, '시장 연결');
  await expect(opener).toBeEnabled();
  const focusedBefore = await opener.evaluate((element: HTMLButtonElement) => {
    const focused = element.ownerDocument.activeElement === element;
    element.click();
    return focused;
  });
  expect(focusedBefore).toBe(false);
  const inspector = page.getByTestId('reliability-inspector');
  await expect(inspector).toBeVisible();
  await inspector.getByRole('button', { name: '데이터 신뢰도 상세 닫기' }).click();
  await expect(inspector).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('opens a fixed desktop drawer without shifting the briefing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer contract');
  await page.evaluate(() => sessionStorage.clear());
  await gotoPreview(page);
  const grid = page.locator('[aria-label="기능별 데이터 신뢰도"]');
  const before = await grid.boundingBox();
  const { inspector } = await openReliability(page);
  const after = await grid.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(520, 0);
});

test('resizes, remembers width, and switches modal without requesting data', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop resize contract');
  await page.evaluate(() => sessionStorage.clear());
  await gotoPreview(page);
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  const { inspector } = await openReliability(page);
  const separator = page.getByRole('separator', { name: '데이터 신뢰도 상세 너비 조절' });
  for (let step = 0; step < 4; step += 1) await separator.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '584');
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
  await expect(page.locator('[data-slot="dialog-overlay"]:visible')).toHaveCount(0);
  const { inspector: reopened } = await openReliability(page, '내 종목');
  await expect(
    page.getByRole('separator', { name: '데이터 신뢰도 상세 너비 조절' }),
  ).toHaveAttribute('aria-valuenow', '584');
  const beforeToggle = requested.length;
  await waitForStableGeometry(reopened);
  await reopened.getByRole('button', { name: '넓게 보기' }).click();
  await expect(reopened).toHaveAttribute('data-inspector-presentation', 'modal');
  await expect(reopened.getByRole('heading', { name: '확인 가능한 근거' })).toBeVisible();
  await expect(reopened.getByRole('heading', { name: '제한과 영향' })).toBeVisible();
  expect(requested.length).toBe(beforeToggle);
});

test('overlay closes only detail without activating the card behind it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop overlay contract');
  const first = card(page, '오늘');
  const second = card(page, '시장 연결');
  const secondBox = await second.boundingBox();
  expect(secondBox).not.toBeNull();
  await first.click();
  const inspector = page.getByTestId('reliability-inspector');
  await expect(inspector).toBeVisible();
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  const overlayBox = await overlay.boundingBox();
  await overlay.click({
    position: {
      x: (secondBox?.x ?? 0) + (secondBox?.width ?? 0) / 2 - (overlayBox?.x ?? 0),
      y: (secondBox?.y ?? 0) + (secondBox?.height ?? 0) / 2 - (overlayBox?.y ?? 0),
    },
  });
  await expect(inspector).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(second).toHaveAttribute('aria-current', 'false');
  await expect(first).toBeFocused();
});

test('stacks cards at the 1240 boundary and contains long text', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop boundary contract');
  await page.setViewportSize({ width: 1240, height: 960 });
  await gotoPreview(page);
  const cards = page.getByTestId('reliability-surface-card');
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect((second?.y ?? 0) > (first?.y ?? Infinity)).toBe(true);
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('uses a bottom sheet from below on 390px without desktop controls', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile bottom-sheet contract');
  const { inspector } = await openReliability(page);
  await waitForStableGeometry(inspector);
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'mobile');
  await expect(inspector).toHaveAttribute('data-presentation', 'bottom-sheet');
  await expect(page.getByRole('separator', { name: '데이터 신뢰도 상세 너비 조절' })).toHaveCount(
    0,
  );
  await expect(inspector.getByRole('button', { name: '넓게 보기' })).toHaveCount(0);
  const box = await inspector.boundingBox();
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844)).toBeLessThanOrEqual(2);
});

test('renders all ready, stale, source limited, and empty scenarios honestly', async ({ page }) => {
  await gotoPreview(page, 'all-ready');
  await expect(page.getByText('활용 가능', { exact: true })).toHaveCount(5);
  await expect(page.getByText('현재 확인된 공통 제한이 없습니다.')).toBeVisible();

  await gotoPreview(page, 'stale');
  await expect(page.getByText('일부 제한', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/최근 확인 시각이 지연/).first()).toBeVisible();

  await gotoPreview(page, 'source-limited');
  await expect(page.getByText(/원문 근거가 완전히 연결되지 않았습니다/).first()).toBeVisible();

  await gotoPreview(page, 'empty');
  await expect(page.getByText('상태 정보 확인 필요', { exact: false })).toBeVisible();
  await expect(page.getByText('확인 필요', { exact: true })).toHaveCount(5);
  await expect(page.locator('body')).not.toContainText(/장애|오류 발생/);
});

test('retries the preview error in place without reloading the document', async ({ page }) => {
  await gotoPreview(page, 'error');
  const marker = await page.evaluate(() => {
    const value = crypto.randomUUID();
    document.documentElement.dataset.retryMarker = value;
    return value;
  });
  await expect(page.getByTestId('workspace-view-load-error')).toBeVisible();
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('heading', { name: '데이터 신뢰도', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.retryMarker)).toBe(marker);
});

test('passes dark mode, reduced motion, Axe, wrapping, and overflow checks', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await gotoPreview(page);
  const { inspector } = await openReliability(page, '시장 연결');
  await waitForStableGeometry(inspector);
  await expect(page.locator('body')).not.toContainText(forbiddenCopy);
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const wrapping = await inspector
    .locator('section h2, section h3, section p, section li, section dt, section dd')
    .evaluateAll((nodes) =>
      nodes.every((node) => {
        const style = getComputedStyle(node);
        return style.overflowWrap === 'anywhere' || node.scrollWidth <= node.clientWidth + 1;
      }),
    );
  expect(wrapping).toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
