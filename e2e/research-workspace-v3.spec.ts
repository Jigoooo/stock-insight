import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type SerializedNode = {
  t?: number;
  i?: number;
  s?: unknown;
  p?: { k: string[]; v: SerializedNode[] };
  a?: SerializedNode[];
  [key: string]: unknown;
};

function findSerializedRecord(node: SerializedNode, key: string): SerializedNode | undefined {
  if (node.p?.k.includes(key)) return node;
  for (const value of node.p?.v ?? []) {
    const found = findSerializedRecord(value, key);
    if (found) return found;
  }
  for (const value of node.a ?? []) {
    const found = findSerializedRecord(value, key);
    if (found) return found;
  }
  return undefined;
}

function serializedRecordValue(node: SerializedNode, key: string): SerializedNode | undefined {
  const index = node.p?.k.indexOf(key) ?? -1;
  return index >= 0 ? node.p?.v[index] : undefined;
}

function setSerializedRecordValue(node: SerializedNode, key: string, value: SerializedNode) {
  const index = node.p?.k.indexOf(key) ?? -1;
  if (index >= 0 && node.p) node.p.v[index] = value;
}

function maxSerializedId(node: SerializedNode): number {
  let maximum = typeof node.i === 'number' ? node.i : -1;
  for (const value of node.p?.v ?? []) maximum = Math.max(maximum, maxSerializedId(value));
  for (const value of node.a ?? []) maximum = Math.max(maximum, maxSerializedId(value));
  return maximum;
}

function serializedPrimitive(value: string | number | boolean | null): SerializedNode {
  if (typeof value === 'string') return { t: 1, s: value };
  if (typeof value === 'number') return { t: 0, s: value };
  if (typeof value === 'boolean') return { t: 2, s: value ? 2 : 3 };
  return { t: 2, s: 1 };
}

function serializedRecord(
  id: number,
  record: Record<string, string | number | boolean | null>,
): SerializedNode {
  const entries = Object.entries(record);
  return {
    t: 10,
    i: id,
    p: {
      k: entries.map(([key]) => key),
      v: entries.map(([, value]) => serializedPrimitive(value)),
    },
  };
}

type RadarWireEvidence = { matched: boolean; itemCount: number; scopeTotal: number };

async function installRadarLoader(
  page: Page,
  mutate: (context: {
    radar: SerializedNode;
    shell: SerializedNode | undefined;
    items: SerializedNode | undefined;
    evidence: RadarWireEvidence;
    nextId: number;
  }) => void,
) {
  const evidence: RadarWireEvidence = { matched: false, itemCount: 0, scopeTotal: -1 };
  await page.route('**/_serverFn/**', async (route) => {
    if (!decodeURIComponent(route.request().url()).includes('radar')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    let payload: SerializedNode;
    try {
      payload = (await response.json()) as SerializedNode;
    } catch {
      await route.fulfill({ response });
      return;
    }
    const result = findSerializedRecord(payload, 'radar');
    const radar = result ? serializedRecordValue(result, 'radar') : undefined;
    if (!radar?.p?.k.includes('items')) {
      await route.fulfill({ response });
      return;
    }
    const items = serializedRecordValue(radar, 'items');
    const shell = findSerializedRecord(payload, 'radarScopeTotal');
    evidence.itemCount = items?.a?.length ?? 0;
    mutate({ radar, shell, items, evidence, nextId: maxSerializedId(payload) + 1 });
    evidence.matched = true;
    await route.fulfill({ response, json: payload });
  });
  return evidence;
}

async function installEmptyRadarLoader(page: Page) {
  return installRadarLoader(page, ({ radar, shell, items, evidence }) => {
    setSerializedRecordValue(radar, 'items', { ...(items ?? { t: 9 }), a: [] });
    setSerializedRecordValue(radar, 'scopeTotal', { t: 0, s: 0 });
    setSerializedRecordValue(radar, 'nextCursor', { t: 2, s: 1 });
    if (shell) setSerializedRecordValue(shell, 'radarScopeTotal', { t: 0, s: 0 });
    evidence.itemCount = 0;
    evidence.scopeTotal = 0;
  });
}

async function installPositiveRadarLoader(page: Page) {
  return installRadarLoader(page, ({ radar, shell, items, evidence, nextId }) => {
    const fixtureItems = [
      serializedRecord(nextId, {
        signalKey: 'p3-c-fixture-initial-holding',
        entityKey: 'US:P3CONE',
        market: 'US',
        symbol: 'P3C1',
        name: 'P3-C 초기 보유 관심 신호',
        signalType: 'price_spike',
        polarity: 'positive',
        strength: 0.8,
        summary: '결정론적 초기 행 보존과 다중 모드 렌더 검증용 신호입니다.',
        occurredAt: '2026-07-22T00:00:00.000Z',
        sourceName: 'P3-C E2E fixture',
        watched: true,
        holding: true,
      }),
      serializedRecord(nextId + 1, {
        signalKey: 'p3-c-fixture-initial-general',
        entityKey: 'KR:123456',
        market: 'KR',
        symbol: '123456',
        name: 'P3-C 초기 일반 신호',
        signalType: 'volume_spike',
        polarity: 'neutral',
        strength: 0.4,
        summary: '두 번째 유형의 결정론적 지원 모드 렌더 검증용 신호입니다.',
        occurredAt: '2026-07-21T23:00:00.000Z',
        sourceName: null,
        watched: false,
        holding: false,
      }),
    ];
    setSerializedRecordValue(radar, 'items', {
      ...(items ?? { t: 9, i: nextId + 2 }),
      a: fixtureItems,
    });
    setSerializedRecordValue(radar, 'scopeTotal', { t: 0, s: 3 });
    setSerializedRecordValue(radar, 'nextCursor', { t: 1, s: 'p3-c-fixture-cursor' });
    if (shell) setSerializedRecordValue(shell, 'radarScopeTotal', { t: 0, s: 3 });
    evidence.itemCount = fixtureItems.length;
    evidence.scopeTotal = 3;
  });
}

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
if (storageState) test.use({ storageState });

test.describe('v3 research workspace candidate', () => {
  test.beforeAll(() => {
    if (!storageState) {
      throw new Error('PLAYWRIGHT_STORAGE_STATE is required for authenticated candidate QA');
    }
  });

  test('redirects the authenticated root to the v3 workspace', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
    await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
  });

  test('clears the session on logout and protects the workspace again', async ({
    context,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'auth lifecycle is viewport-independent');
    await page.goto('/workspace');
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === '__Host-stock-insight-session')).toBe(false);

    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fworkspace$/);
  });

  test('loads every real-data section with URL state and no layout overflow', async ({
    page,
  }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });

    await page.goto('/workspace?view=today&lane=must_know');
    await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
    await expect(page.getByRole('heading', { name: '오늘 봐야 할 변화' })).toBeVisible();
    await expect(page.getByTestId('research-feed-record').first()).toBeVisible();
    const workspace = page.getByTestId('research-workspace-v3');
    for (const rawToken of ['related_ticker:', 'STAGE:', 'R/R', 'Companyfacts']) {
      await expect(workspace).not.toContainText(rawToken);
    }
    await expect(workspace).toContainText('기대 손익비');

    const sections = [
      ['radar', '세계 레이더'],
      ['stocks', '종목'],
      ['themes', '테마·관계'],
      ['research', '내 리서치'],
      ['history', '판단 이력'],
      ['status', '데이터 상태'],
    ] as const;
    for (const [id, heading] of sections) {
      if (testInfo.project.name === 'mobile') {
        await page.getByRole('button', { name: '메뉴 열기' }).click();
      }
      await page.getByTestId(`workspace-nav-${id}`).click();
      await expect(page).toHaveURL(new RegExp(`view=${id}`));
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }

    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: '메뉴 열기' }).click();
    }
    await page.getByTestId('workspace-nav-themes').click();
    await expect(page.getByTestId('relation-graph')).toBeVisible();
    await expect(page.getByText('관계를 텍스트로 보기')).toBeVisible();
    for (const rawTheme of ['ai_semi', 'megacap_ai', 'electronic_components']) {
      await expect(page.getByTestId('research-workspace-v3')).not.toContainText(rawTheme);
    }
    await expect(page.getByTestId('theme-ledger')).toBeVisible();
    const selectableThemes = page.locator('[data-testid="theme-select"]:not([disabled])');
    const targetTheme = selectableThemes.nth(1);
    const targetThemeName = (await targetTheme.getAttribute('aria-label'))?.replace(
      ' 관계 보기',
      '',
    );
    await targetTheme.click();
    await expect(targetTheme).toHaveAttribute('aria-pressed', 'true');
    if (targetThemeName)
      await expect(page.getByText(`${targetThemeName} 대표 종목에서 시작`)).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(runtimeErrors).toEqual([]);
  });

  test('opens run-bound evidence detail and keeps the inspector accessible', async ({
    page,
  }, testInfo) => {
    await page.goto('/workspace?view=today&lane=must_know');
    const firstRecord = page.getByTestId('research-feed-record').first();
    await expect(firstRecord).toBeVisible();
    await firstRecord.click();
    await expect(page).toHaveURL(/record=/);
    const inspector = page.getByTestId('evidence-inspector');
    await expect(inspector).toBeVisible();
    await expect(page.getByRole('dialog', { name: '근거 인스펙터' })).toBeVisible();
    const closeInspector = inspector.getByRole('button', { name: '인스펙터 닫기' });
    await expect(inspector.getByRole('heading').first()).toBeVisible();
    for (const rawToken of [
      'related_ticker:',
      'STAGE:',
      'R/R',
      'Companyfacts',
      'stock_candidate',
    ]) {
      await expect(inspector).not.toContainText(rawToken);
    }
    await expect(inspector).toContainText('종목 후보 분석');

    if (testInfo.project.name === 'mobile') {
      await expect(closeInspector).toBeFocused();
      await expect(page.getByTestId('workspace-content')).toHaveAttribute('inert', '');
      await expect(page.getByTestId('workspace-sidebar')).toHaveAttribute('inert', '');
      const box = await inspector.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? Infinity).toBeLessThanOrEqual(390);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    } else {
      await expect(page.getByTestId('workspace-content')).not.toHaveAttribute('inert');
      await expect(page.getByTestId('workspace-sidebar')).not.toHaveAttribute('inert');
      await expect(firstRecord).toBeFocused();
    }

    const results = await new AxeBuilder({ page })
      .include('[data-testid="research-workspace-v3"]')
      .analyze();
    expect(results.violations).toEqual([]);

    if (testInfo.project.name === 'mobile') {
      await page.keyboard.press('Shift+Tab');
      expect(await inspector.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden();
    await expect(firstRecord).toBeFocused();
    await expect(page.getByTestId('workspace-content')).not.toHaveAttribute('inert');
  });

  test('supports APG keyboard navigation across feed lanes', async ({ page }) => {
    await page.goto('/workspace');
    const tabs = page.getByRole('tablist', { name: '인사이트 분류' }).getByRole('tab');
    await expect(tabs.first()).toBeEnabled();
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/lane=for_you/);
    await page.keyboard.press('End');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('switches all eight market screens without fabricating unavailable data', async ({
    page,
  }) => {
    await page.goto('/workspace?view=today');
    const evidence = await installPositiveRadarLoader(page);
    const menuButton = page.locator('button[aria-controls="workspace-navigation"]');
    if (await menuButton.isVisible()) await menuButton.click();
    await page.getByTestId('workspace-nav-radar').click();
    await page.waitForURL(/view=radar/);
    await expect.poll(() => evidence.matched).toBe(true);
    expect(evidence).toEqual({ matched: true, itemCount: 2, scopeTotal: 3 });
    await expect(page.getByTestId('workspace-nav-radar')).toContainText('3');
    const tabs = page.getByRole('tablist', { name: '시장 화면 선택' }).getByRole('tab');
    await expect(tabs).toHaveCount(8);
    const danglingControls = await tabs.evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute('aria-controls'))
        .filter((id) => !id || !document.getElementById(id)),
    );
    expect(danglingControls).toEqual([]);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('radar-row')).toHaveCount(2);
    await expect(page.getByTestId('radar-row').first()).toContainText('보유 · 관심');

    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('note')).toContainText('인과 추정값이 아니라');
    await expect(page.getByTestId('market-factor-group')).toHaveCount(2);
    await expect(page.getByTestId('market-factor-group').first()).toContainText('건 관측');

    await tabs.nth(2).click();
    await expect(page.getByRole('note')).toContainText('인과관계를 뜻하지 않습니다');
    await expect(page.getByTestId('market-propagation-group')).toHaveCount(2);
    await expect(page.getByTestId('market-propagation-group').first()).toContainText(
      '동일 유형 관측',
    );

    await tabs.nth(3).click();
    const themePanel = page.getByTestId('market-mode-theme_community');
    await expect(themePanel).toContainText('테마 구성원 원천이 연결되지 않았습니다');
    await expect(themePanel).toHaveAttribute('data-display-state', 'missing');
    await expect(themePanel.locator(':scope > [data-kind="empty"]')).toHaveCount(1);
    await expect(themePanel.locator(':scope > :not([data-kind="empty"])')).toHaveCount(0);
    await expect(page.getByTestId('market-mode-footer')).toHaveCount(0);

    await tabs.nth(4).click();
    await expect(page.getByTestId('market-heatmap-row')).toHaveCount(2);
    await expect(page.getByTestId('market-heatmap-row').first()).toBeVisible();

    await tabs.nth(5).click();
    await expect(page.getByTestId('market-timeline-row')).toHaveCount(2);
    await expect(page.getByTestId('market-timeline-row').first()).toBeVisible();

    await tabs.nth(6).click();
    const mapPanel = page.getByTestId('market-mode-map_globe');
    await expect(mapPanel).toContainText('검증된 GeoJSON 위치 원천은 P3-D에서 연결됩니다');
    await expect(mapPanel).toHaveAttribute('data-display-state', 'missing');
    await expect(mapPanel.locator(':scope > [data-kind="empty"]')).toHaveCount(1);
    await expect(mapPanel.locator(':scope > :not([data-kind="empty"])')).toHaveCount(0);
    await expect(page.getByTestId('market-mode-footer')).toHaveCount(0);

    await tabs.last().click();
    const valueChainPanel = page.getByTestId('market-mode-value_chain');
    await expect(valueChainPanel).toContainText(
      '현재 레이더 응답에는 승인된 공급망 관계가 없습니다',
    );
    await expect(valueChainPanel).toHaveAttribute('data-display-state', 'missing');
    await expect(valueChainPanel.locator(':scope > [data-kind="empty"]')).toHaveCount(1);
    await expect(valueChainPanel.locator(':scope > :not([data-kind="empty"])')).toHaveCount(0);
    await expect(page.getByTestId('market-mode-footer')).toHaveCount(0);

    await tabs.last().focus();
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
    await expect(page.getByTestId('radar-row')).toHaveCount(2);

    const geometry = await tabs.evaluateAll((elements) => ({
      minHeight: Math.min(...elements.map((element) => element.getBoundingClientRect().height)),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(geometry.minHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.documentOverflow).toBe(0);

    const results = await new AxeBuilder({ page }).include('[aria-label="시장 시각화"]').analyze();
    expect(results.violations).toEqual([]);
  });

  test('renders controlled empty and unsupported market modes as distinct runtime states', async ({
    page,
  }) => {
    await page.goto('/workspace?view=today');
    const evidence = await installEmptyRadarLoader(page);
    const menuButton = page.locator('button[aria-controls="workspace-navigation"]');
    if (await menuButton.isVisible()) await menuButton.click();
    await page.getByRole('button', { name: /세계 레이더/ }).click();
    await page.waitForURL(/view=radar/);
    await expect.poll(() => evidence.matched).toBe(true);
    expect(evidence).toEqual({ matched: true, itemCount: 0, scopeTotal: 0 });
    await expect(page.getByTestId('workspace-nav-radar')).toContainText('0');
    await expect(page.getByTestId('radar-row')).toHaveCount(0);
    await expect(page.getByTestId('radar-load-more')).toHaveCount(0);

    const tabs = page.getByRole('tablist', { name: '시장 화면 선택' }).getByRole('tab');
    for (const [index, title] of [
      [0, '이벤트 레이더'],
      [1, '팩터 맵'],
      [2, '전파 맵'],
      [4, '히트맵 매트릭스'],
      [5, '타임라인'],
    ] as const) {
      await tabs.nth(index).click();
      const panel = page.getByRole('tabpanel');
      await expect(panel).toContainText(`${title}에 표시할 신호 없음`);
      await expect(panel).toHaveAttribute('data-display-state', 'empty');
      await expect(panel.locator(':scope > [data-kind="empty"]')).toHaveCount(1);
      await expect(panel.locator(':scope > :not([data-kind="empty"])')).toHaveCount(0);
      await expect(tabs.nth(index)).toContainText('신호 없음');
    }

    for (const [index, title] of [
      [3, '테마 커뮤니티'],
      [6, '지도·글로브'],
      [7, '밸류체인'],
    ] as const) {
      await tabs.nth(index).click();
      const panel = page.getByRole('tabpanel');
      await expect(panel).toContainText(`${title} 데이터 준비 중`);
      await expect(panel).toHaveAttribute('data-display-state', 'missing');
      await expect(panel.locator(':scope > [data-kind="empty"]')).toHaveCount(1);
      await expect(panel.locator(':scope > :not([data-kind="empty"])')).toHaveCount(0);
      await expect(tabs.nth(index)).toContainText('원천 준비 중');
      await expect(page.getByTestId('market-mode-footer')).toHaveCount(0);
    }

    const results = await new AxeBuilder({ page }).include('[aria-label="시장 시각화"]').analyze();
    expect(results.violations).toEqual([]);
  });

  test('loads a deterministic Radar cursor page and exhausts the cursor', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'cursor transport is viewport-independent');
    await page.goto('/workspace?view=today');
    const evidence = await installPositiveRadarLoader(page);
    let requestedCursor: string | null = null;
    await page.route('**/api/radar**', async (route) => {
      requestedCursor = new URL(route.request().url()).searchParams.get('cursor');
      const scopeTotal = evidence.itemCount + 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          generatedAt: '2026-07-22T00:00:00.000Z',
          signalAsOf: '2026-07-22T00:00:00.000Z',
          scopeTotal,
          items: [
            {
              signalKey: 'p3-c-fixture-page-2',
              entityKey: 'US:P3CFIX',
              market: 'US',
              symbol: 'P3C',
              name: 'P3-C 회귀 신호',
              signalType: 'price_spike',
              polarity: 'positive',
              strength: 0.42,
              summary: '결정론적 페이지 추가 회귀 검증용 신호입니다.',
              occurredAt: '2026-07-22T00:00:00.000Z',
              sourceName: 'P3-C E2E fixture',
              watched: true,
              holding: true,
            },
          ],
          nextCursor: null,
        },
      });
    });

    await page.getByTestId('workspace-nav-radar').click();
    await page.waitForURL(/view=radar/);
    await expect.poll(() => evidence.matched).toBe(true);
    expect(evidence).toEqual({ matched: true, itemCount: 2, scopeTotal: 3 });
    await expect(page.getByTestId('workspace-nav-radar')).toContainText('3');
    const radarRows = page.getByTestId('radar-row');
    await expect(radarRows).toHaveCount(2);
    const initialHolding = radarRows.filter({ hasText: 'P3-C 초기 보유 관심 신호' });
    await expect(initialHolding).toContainText('보유 · 관심');
    const radarLoadMore = page.getByTestId('radar-load-more');
    await expect(radarLoadMore).toBeVisible();
    await expect(radarLoadMore).toBeEnabled();
    await radarLoadMore.click();
    await expect(radarRows).toHaveCount(3);
    await expect(initialHolding).toBeVisible();
    const appended = radarRows.filter({ hasText: 'P3-C 회귀 신호' });
    await expect(appended).toContainText('보유 · 관심');
    expect(requestedCursor).toBe('p3-c-fixture-cursor');
    await expect(page.getByTestId('workspace-nav-radar')).toContainText('3');
    await expect(radarLoadMore).toHaveCount(0);
  });

  test('supports mobile navigation and keyboard-visible controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only interaction');
    await page.goto('/workspace');
    const sidebar = page.getByTestId('workspace-sidebar');
    const menuButton = page.locator('button[aria-controls="workspace-navigation"]');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    await expect(sidebar).not.toHaveAttribute('aria-hidden');
    await expect(sidebar).not.toHaveAttribute('inert');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => (await sidebar.boundingBox())?.x ?? -999)
      .toBeGreaterThanOrEqual(-1);
    await expect(page.getByTestId('workspace-nav-today')).toBeFocused();
    await expect(page.getByTestId('workspace-content')).toHaveAttribute('inert', '');
    await page.keyboard.press('Shift+Tab');
    expect(await sidebar.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect.poll(async () => (await sidebar.boundingBox())?.x ?? 0).toBeLessThan(-300);
    await expect(menuButton).toBeFocused();
    await expect(page.getByTestId('workspace-content')).not.toHaveAttribute('inert');

    await menuButton.click();
    await expect(page.getByTestId('workspace-nav-status')).toBeVisible();
    await page.getByTestId('workspace-nav-status').click();
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(page.getByRole('heading', { name: '데이터 상태' })).toBeVisible();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['BUTTON', 'INPUT', 'A']).toContain(focused);
  });

  test('keeps the data as-of time visible on mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only freshness contract');
    await page.goto('/workspace?view=status');
    const asOf = page.locator('main header time').first();
    await expect(asOf).toBeVisible();
    await expect(asOf).toContainText('기준 시각');
  });

  test('preserves Deep Dive focus when crossing the compact-layout breakpoint', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop breakpoint transition contract');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/workspace?view=stocks');
    const region = page.getByTestId('stock-deep-dive-region');
    await expect(region).toBeVisible();
    await page.getByRole('table').locator('tbody button').first().click();
    await expect(region).not.toHaveAttribute('data-state', 'idle');
    await region.focus();
    await expect(region).toBeFocused();

    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(page.getByTestId('stock-deep-dive-region')).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('stock-deep-dive-region')).toBeFocused();
  });

  test('reflows stock and status tables without horizontal clipping on mobile', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout contract');
    await page.goto('/workspace?view=stocks');
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    const firstStock = table
      .locator('tbody tr')
      .filter({ has: page.locator('td:not([colspan])') })
      .first();
    await expect(firstStock).toBeVisible();

    const layout = await table.evaluate((element) => {
      const wrapper = element.parentElement;
      const cells = Array.from(element.querySelectorAll<HTMLElement>('td:not([colspan])'));
      return {
        wrapperClientWidth: wrapper?.clientWidth ?? 0,
        wrapperScrollWidth: wrapper?.scrollWidth ?? Number.POSITIVE_INFINITY,
        maxRight: Math.max(...cells.map((cell) => cell.getBoundingClientRect().right)),
      };
    });
    expect(layout.wrapperScrollWidth).toBeLessThanOrEqual(layout.wrapperClientWidth + 1);
    expect(layout.maxRight).toBeLessThanOrEqual(390);

    await page.goto('/workspace?view=status');
    const statusTable = page.getByRole('table');
    await expect(statusTable).toBeVisible();
    const statusLayout = await statusTable.evaluate((element) => {
      const wrapper = element.parentElement;
      return {
        wrapperClientWidth: wrapper?.clientWidth ?? 0,
        wrapperScrollWidth: wrapper?.scrollWidth ?? Number.POSITIVE_INFINITY,
      };
    });
    expect(statusLayout.wrapperScrollWidth).toBeLessThanOrEqual(
      statusLayout.wrapperClientWidth + 1,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('renders honest empty, loading, and pagination error states', async ({ page }) => {
    await page.goto('/workspace?view=stocks');
    const search = page.getByRole('textbox', { name: '종목명 또는 티커 검색' });
    await search.fill('존재하지않는종목-qa');
    await expect(page.getByText('조건에 맞는 종목이 없습니다')).toBeVisible();

    await page.goto('/workspace?view=today&lane=for_you');
    const loadMore = page.getByRole('button', { name: '다음 변화 더 보기' });
    await expect(loadMore).toBeEnabled();
    await page.route('**/api/feed**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"qa"}' });
    });
    await loadMore.click();
    await expect(page.getByRole('button', { name: '불러오는 중' })).toBeVisible();
    await expect(page.getByText('다음 페이지를 불러오지 못했습니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });
});
