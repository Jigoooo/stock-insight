import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const previewUrl = '/__dev-preview?surface=history&scenario=default';
const priorityTitle = '메모리 재고 정상화 확인';
const activeTitle = '서비스 매출 구성 변화 확인';
const observationTitle = '환율 변동 자동 관찰';
const pastTitle = '이전 수요 판단 복기';
const forbiddenCopy =
  /지금 사세요|매도하세요|목표가|손절가|익절가|내일 오를 종목|수익률|성공(?:한|입니다|판단)|실패(?:한|입니다|판단)|수익 성공|손실 실패/;

async function waitForReactHandler(target: Locator) {
  await expect
    .poll(
      () =>
        target.evaluate((node) => Object.keys(node).some((key) => key.startsWith('__reactProps$'))),
      {
        timeout: 15_000,
      },
    )
    .toBe(true);
}

async function gotoPreview(page: Page, scenario = 'default') {
  await page.goto(`/__dev-preview?surface=history&scenario=${scenario}`);
  await expect(page.getByRole('heading', { name: '판단 복기', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeEnabled();
  if (scenario === 'default') {
    const firstSelection = page.getByTestId('history-select-surface').first();
    await expect(firstSelection).toBeEnabled({
      timeout: 15_000,
    });
    await waitForReactHandler(firstSelection);
  }
}

function opener(page: Page, title: string) {
  return page.getByTestId('history-select-surface').filter({ hasText: title });
}

async function expectBodyToExcludeForbiddenCopy(page: Page) {
  await expect(page.locator('body')).not.toContainText(forbiddenCopy);
}

async function openHistory(page: Page, title = priorityTitle, target = opener(page, title)) {
  await expect(target).toBeEnabled();
  await waitForReactHandler(target);
  await target.click();
  const inspector = page.getByTestId('history-briefing-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText(title, { exact: true })).toBeVisible();
  return { inspector, opener: target };
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
  await expectBodyToExcludeForbiddenCopy(page);
});

test('keeps the approved sections in fixed order without advice or performance verdicts', async ({
  page,
}) => {
  const sections = page.locator(
    [
      '[aria-labelledby="history-오늘-다시-볼-판단"]',
      '[aria-labelledby="history-진행-중-판단"]',
      '[aria-labelledby="history-자동-시장-관찰"]',
      '[aria-labelledby="history-past-title"]',
    ].join(', '),
  );
  expect(
    await sections.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-labelledby')),
    ),
  ).toEqual([
    'history-오늘-다시-볼-판단',
    'history-진행-중-판단',
    'history-자동-시장-관찰',
    'history-past-title',
  ]);
  await expect(page.getByTestId('history-priority-item')).toHaveCount(3);
  await expectBodyToExcludeForbiddenCopy(page);
});

test('shares exact selection across judgment observation and past entry points', async ({
  page,
}) => {
  for (const title of [priorityTitle, activeTitle, observationTitle]) {
    const target = opener(page, title);
    const { inspector } = await openHistory(page, title, target);
    await expect(target).toHaveAttribute('aria-current', 'true');
    await expect(inspector.getByText(title, { exact: true })).toBeVisible();
    if (title === observationTitle) await expectBodyToExcludeForbiddenCopy(page);
    await page.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
    await expect(target).toBeFocused();
  }

  await page.getByTestId('history-past-entries').locator('summary').click();
  const target = opener(page, pastTitle);
  const { inspector } = await openHistory(page, pastTitle, target);
  await expect(target).toHaveAttribute('aria-current', 'true');
  await expect(inspector.getByText(pastTitle, { exact: true })).toBeVisible();
});

test('restores a programmatically activated opener exactly after close', async ({ page }) => {
  const target = opener(page, activeTitle);
  await expect(target).toBeEnabled();
  const wasFocusedBeforeActivation = await target.evaluate((element: HTMLButtonElement) => {
    const wasFocused = element.ownerDocument.activeElement === element;
    element.click();
    return wasFocused;
  });
  expect(wasFocusedBeforeActivation).toBe(false);
  const inspector = page.getByTestId('history-briefing-inspector');
  await expect(inspector).toBeVisible();
  await inspector.getByRole('button', { name: '복기 상세 닫기' }).click();
  await expect(inspector).toHaveCount(0);
  await expect(target).toBeFocused();
});

test('overlays a fixed desktop drawer without shifting the briefing', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer contract');
  await page.evaluate(() => sessionStorage.clear());
  await gotoPreview(page);
  const section = page.locator('[aria-labelledby="history-진행-중-판단"]');
  const before = await section.boundingBox();
  const { inspector } = await openHistory(page);
  const after = await section.boundingBox();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(520, 0);
});

test('overlay and Escape close only detail and restore the exact opener', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop overlay contract');
  const first = opener(page, priorityTitle);
  const second = opener(page, 'AI 인프라 수요 지속성 확인');
  const secondBox = await second.boundingBox();
  await first.click();
  const inspector = page.getByTestId('history-briefing-inspector');
  await expect(inspector).toBeVisible();
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  await expect(overlay).toBeVisible();
  const overlayBox = await overlay.boundingBox();
  await overlay.click({
    position: {
      x: (secondBox?.x ?? 0) + (secondBox?.width ?? 0) / 2 - (overlayBox?.x ?? 0),
      y: (secondBox?.y ?? 0) + (secondBox?.height ?? 0) / 2 - (overlayBox?.y ?? 0),
    },
  });
  await expect(page.getByTestId('history-briefing-inspector')).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(second).not.toHaveAttribute('aria-current', 'true');
  await expect(first).toBeFocused();

  await first.click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('history-briefing-inspector')).toHaveCount(0);
  await expect(first).toBeFocused();
});

test('switches the same loaded detail to a wide modal without another request', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop modal contract');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(request.url());
  });
  const { inspector } = await openHistory(page);
  await expectBodyToExcludeForbiddenCopy(page);
  const before = requests.length;
  await inspector.getByRole('button', { name: '넓게 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'modal');
  await waitForStableGeometry(inspector);
  expect(requests).toHaveLength(before);
  const box = await inspector.boundingBox();
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(25.5);
  expect(1440 - ((box?.x ?? 0) + (box?.width ?? 1440))).toBeGreaterThanOrEqual(25.5);
  await expect(inspector.getByRole('heading', { name: '당시 판단' })).toBeVisible();
  await expect(inspector.getByRole('heading', { name: '지금 달라진 점' })).toBeVisible();
  await expectBodyToExcludeForbiddenCopy(page);
});

test('clamps and remembers History width under an independent session key', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop resize contract');
  await page.evaluate(() => sessionStorage.clear());
  await gotoPreview(page);
  const { inspector } = await openHistory(page);
  const resizer = page.getByRole('separator', { name: '복기 상세 너비 조절' });
  for (let step = 0; step < 20; step += 1) await resizer.press('ArrowLeft');
  await expect(resizer).toHaveAttribute('aria-valuenow', '760');
  await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(760, 0);
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
  await expect(page.locator('[data-slot="dialog-overlay"]:visible')).toHaveCount(0);
  const { inspector: reopened } = await openHistory(page);
  await expect.poll(async () => (await reopened.boundingBox())?.width).toBeCloseTo(760, 0);
  expect(
    await page.evaluate(() => ({
      history: sessionStorage.getItem('stock-insight:history-inspector-width'),
      market: sessionStorage.getItem('stock-insight:market-connection-inspector-width'),
      evidence: sessionStorage.getItem('stock-insight:evidence-inspector-width'),
      stocks: sessionStorage.getItem('stock-insight:stock-inspector-width'),
    })),
  ).toEqual({ history: '760', market: null, evidence: null, stocks: null });
});

test('stacks the two judgment sections at the actual 1240px boundary', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop stacking contract');
  await page.setViewportSize({ width: 1240, height: 900 });
  await gotoPreview(page);
  const priority = page
    .getByRole('heading', { name: '오늘 다시 볼 판단' })
    .locator('..')
    .locator('..');
  const active = page.getByRole('heading', { name: '진행 중 판단' }).locator('..').locator('..');
  const [priorityBox, activeBox] = await Promise.all([
    priority.boundingBox(),
    active.boundingBox(),
  ]);
  expect(activeBox?.y ?? 0).toBeGreaterThan((priorityBox?.y ?? 0) + (priorityBox?.height ?? 0) - 1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
});

test('keeps 420px drawer and wide modal copy wrapped with HTTPS-only links', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop wrapping contract');
  const { inspector } = await openHistory(page);
  const links = inspector.locator('a[href]');
  await expect(links).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(links.nth(index)).toHaveAttribute('href', /^https:\/\//);
    await expect(links.nth(index)).toHaveAttribute('target', '_blank');
    await expect(links.nth(index)).toHaveAttribute('rel', /noreferrer/);
  }
  const resizer = page.getByRole('separator', { name: '복기 상세 너비 조절' });
  for (let step = 0; step < 7; step += 1) await resizer.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '420');
  await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(420, 0);
  const representativeText = inspector.locator(
    [
      'section[aria-labelledby="history-inspector-summary"] > strong',
      'section[aria-labelledby="history-inspector-original-judgment"] p',
      'section[aria-labelledby="history-inspector-original-evidence"] li',
      'section[aria-labelledby="history-inspector-changes"] p',
      'section[aria-labelledby="history-inspector-checkpoints"] li',
    ].join(', '),
  );
  const geometries = await representativeText.evaluateAll((nodes) =>
    nodes.map((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      wordBreak: getComputedStyle(node).wordBreak,
    })),
  );
  for (const geometry of geometries) {
    expect(geometry.wordBreak).not.toBe('break-all');
    expect(geometry.scrollWidth - geometry.clientWidth).toBeLessThanOrEqual(1);
  }
  await inspector.getByRole('button', { name: '넓게 보기' }).click();
  await waitForStableGeometry(inspector);
  expect(
    await inspector.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    await inspector
      .locator('[data-slot="dialog-body"]')
      .evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
});

test('covers observation-only no-due and empty scenarios honestly', async ({ page }) => {
  await gotoPreview(page, 'no-user-judgments');
  await expectBodyToExcludeForbiddenCopy(page);
  await expect(page.getByText('오늘 예정된 복기가 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByText('진행 중인 판단이 없습니다', { exact: true })).toBeVisible();
  await expect(opener(page, observationTitle)).toBeVisible();
  await expect(page.getByText('최근 기록을 대신 올리지 않고', { exact: false })).toBeVisible();

  await gotoPreview(page, 'no-due');
  await expectBodyToExcludeForbiddenCopy(page);
  await expect(page.getByText('오늘 예정된 복기가 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByTestId('history-active-item')).toHaveCount(4);
  await expect(page.getByTestId('history-priority-item')).toHaveCount(0);

  await gotoPreview(page, 'empty');
  await expectBodyToExcludeForbiddenCopy(page);
  await expect(page.getByText('아직 복기 기록이 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByTestId('history-select-surface')).toHaveCount(0);
});

test('keeps localized partial failures beside the selected base detail', async ({ page }) => {
  await gotoPreview(page, 'partial');
  await expectBodyToExcludeForbiddenCopy(page);
  const { inspector } = await openHistory(page);
  await expect(inspector.getByText(priorityTitle, { exact: true })).toBeVisible();
  await expect(inspector.getByText('현재 변화 요약을 불러오지 못했습니다.')).toBeVisible();
  await expect(inspector.getByText('연결 근거를 불러오지 못했습니다.')).toBeVisible();
  await expect(inspector.getByRole('heading', { name: '당시 판단' })).toBeVisible();
  await expectBodyToExcludeForbiddenCopy(page);
});

test('preserves detail-error selection and retries the same item successfully', async ({
  page,
}) => {
  await gotoPreview(page, 'detail-error');
  await expectBodyToExcludeForbiddenCopy(page);
  const target = opener(page, priorityTitle);
  await target.click();
  const inspector = page.getByTestId('history-briefing-inspector');
  await expect(inspector.getByText('복기 상세를 불러오지 못했습니다')).toBeVisible();
  await expect(target).toHaveAttribute('aria-current', 'true');
  await expectBodyToExcludeForbiddenCopy(page);
  await inspector.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(inspector.getByText(priorityTitle, { exact: true })).toBeVisible();
  await expect(inspector.getByRole('heading', { name: '당시 판단' })).toBeVisible();
  await expectBodyToExcludeForbiddenCopy(page);
});

test('supports dark reduced-motion Axe and the 390px bottom-sheet geometry', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await gotoPreview(page);
  const { inspector, opener: selected } = await openHistory(page);
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
    await expect(page.getByRole('separator', { name: '복기 상세 너비 조절' })).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: '넓게 보기' })).toHaveCount(0);
    const surfaceGeometry = await selected.evaluate((node) => {
      const style = getComputedStyle(node);
      const parent = node.parentElement?.getBoundingClientRect();
      const self = node.getBoundingClientRect();
      return {
        radius: Number.parseFloat(style.borderRadius),
        widthDelta: Math.abs((parent?.width ?? self.width) - self.width),
      };
    });
    expect(surfaceGeometry.radius).toBeGreaterThanOrEqual(10);
    expect(surfaceGeometry.widthDelta).toBeLessThanOrEqual(1);
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
