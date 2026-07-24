import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  computeGeoSnapshotDigest,
  deriveGeoSnapshotId,
  type GeoSnapshot,
} from '../packages/contracts/src/geo-api-contract.ts';

import { hashProductionArtifact } from '../scripts/production-artifact-hash.mjs';

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

function serializedValue(value: unknown, allocateId: () => number): SerializedNode {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return serializedPrimitive(value);
  }
  if (Array.isArray(value)) {
    return { t: 9, i: allocateId(), a: value.map((item) => serializedValue(item, allocateId)) };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      t: 10,
      i: allocateId(),
      p: {
        k: entries.map(([key]) => key),
        v: entries.map(([, item]) => serializedValue(item, allocateId)),
      },
    };
  }
  throw new Error(`Unsupported E2E fixture value: ${typeof value}`);
}

type RadarWireEvidence = { matched: boolean; itemCount: number; scopeTotal: number };

async function installRadarLoader(
  page: Page,
  mutate: (context: {
    result: SerializedNode;
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
    if (!result || !radar?.p?.k.includes('items')) {
      await route.fulfill({ response });
      return;
    }
    const items = serializedRecordValue(radar, 'items');
    const shell = findSerializedRecord(payload, 'radarScopeTotal');
    evidence.itemCount = items?.a?.length ?? 0;
    mutate({ result, radar, shell, items, evidence, nextId: maxSerializedId(payload) + 1 });
    evidence.matched = true;
    await route.fulfill({ response, json: payload });
  });
  return evidence;
}

async function installEmptyRadarLoader(page: Page) {
  return installRadarLoader(page, ({ radar, shell, items, evidence, nextId }) => {
    setSerializedRecordValue(radar, 'items', { ...(items ?? { t: 9 }), a: [] });
    setSerializedRecordValue(radar, 'scopeTotal', { t: 0, s: 0 });
    setSerializedRecordValue(radar, 'nextCursor', { t: 2, s: 1 });
    let allocatedId = nextId;
    const empty = { availability: 'empty', watermarkAt: null, rowCount: 0 };
    const missing = { availability: 'missing', watermarkAt: null, rowCount: 0 };
    setSerializedRecordValue(
      radar,
      'componentWatermarks',
      serializedValue(
        {
          event_radar: empty,
          factor_map: empty,
          propagation_map: empty,
          theme_community: missing,
          heatmap_matrix: empty,
          timeline: empty,
          map_globe: missing,
          value_chain: missing,
        },
        () => allocatedId++,
      ),
    );
    if (shell) setSerializedRecordValue(shell, 'radarScopeTotal', { t: 0, s: 0 });
    evidence.itemCount = 0;
    evidence.scopeTotal = 0;
  });
}

function positiveGeoSnapshotFixture() {
  const provisionalSnapshotId = 'geo_bbbbbbbbbbbbbbbbbbbbbbbb';
  const fixture: GeoSnapshot = {
    version: 1,
    snapshotId: provisionalSnapshotId,
    digest: 'b'.repeat(64),
    generatedAt: '2026-07-22T05:00:00.000Z',
    knownAt: '2026-07-22T05:00:00.000Z',
    validAt: '2026-07-22T05:00:00.000Z',
    sourceAsOf: '2026-07-22T04:55:00.000Z',
    availability: 'available',
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [127.0276, 37.4979] },
          properties: {
            geoEntityKey: 'geo:facility:seoul',
            label: '서울 데이터센터',
            geoKind: 'facility',
            precisionClass: 'exact',
            longitude: 127.0276,
            latitude: 37.4979,
            uncertaintyRadiusKm: 0.2,
            evidenceLocator: {
              geoEntityRevisionId: 1001,
              sourceRevisionId: 101,
              sourceId: 'p3-d-e2e',
            },
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-97.7431, 30.2672] },
          properties: {
            geoEntityKey: 'geo:facility:austin',
            label: '오스틴 반도체 시설',
            geoKind: 'facility',
            precisionClass: 'approximate',
            longitude: -97.7431,
            latitude: 30.2672,
            uncertaintyRadiusKm: 4.5,
            evidenceLocator: {
              geoEntityRevisionId: 1002,
              sourceRevisionId: 102,
              sourceId: 'p3-d-e2e',
            },
          },
        },
      ],
    },
    mvt: {
      available: true,
      contentType: 'application/vnd.mapbox-vector-tile',
      minZoom: 0,
      maxZoom: 14,
      urlTemplate: `/api/geo/tiles/{z}/{x}/{y}?snapshot=${provisionalSnapshotId}&validAt=2026-07-22T05%3A00%3A00.000Z&knownAt=2026-07-22T05%3A00%3A00.000Z`,
    },
    h3: {
      resolution: 3,
      cells: [
        {
          cellId: '83489efffffffff',
          featureCount: 1,
          geoEntityKeys: ['geo:facility:austin'],
        },
        {
          cellId: '8330e1fffffffff',
          featureCount: 1,
          geoEntityKeys: ['geo:facility:seoul'],
        },
      ],
    },
    rejected: { count: 0, reasons: [] },
    limitations: [
      'H3 셀은 화면 집계용 파생 투영이며 정본 위치를 대체하지 않습니다.',
      '지도 기준점은 실제 시설 범위를 과장하지 않습니다.',
    ],
  };
  const digest = computeGeoSnapshotDigest({
    version: fixture.version,
    knownAt: fixture.knownAt,
    validAt: fixture.validAt,
    sourceAsOf: fixture.sourceAsOf,
    availability: fixture.availability,
    geojson: fixture.geojson,
    mvt: {
      contentType: fixture.mvt.contentType,
      minZoom: fixture.mvt.minZoom,
      maxZoom: fixture.mvt.maxZoom,
    },
    h3: fixture.h3,
    rejected: fixture.rejected,
    limitations: fixture.limitations,
  });
  const snapshotId = deriveGeoSnapshotId(digest);
  return {
    ...fixture,
    snapshotId,
    digest,
    mvt: {
      ...fixture.mvt,
      urlTemplate: fixture.mvt.urlTemplate?.replace(provisionalSnapshotId, snapshotId) ?? null,
    },
  };
}

async function installPositiveRadarLoader(page: Page) {
  return installRadarLoader(page, ({ result, radar, shell, items, evidence, nextId }) => {
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
    let allocatedId = nextId + fixtureItems.length;
    setSerializedRecordValue(
      radar,
      'componentWatermarks',
      serializedValue(
        {
          event_radar: {
            availability: 'available',
            watermarkAt: '2026-07-22T00:00:00.000Z',
            rowCount: 3,
          },
          factor_map: {
            availability: 'partial',
            watermarkAt: '2026-07-22T00:00:00.000Z',
            rowCount: 3,
          },
          propagation_map: {
            availability: 'partial',
            watermarkAt: '2026-07-22T00:00:00.000Z',
            rowCount: 3,
          },
          theme_community: { availability: 'missing', watermarkAt: null, rowCount: 0 },
          heatmap_matrix: {
            availability: 'available',
            watermarkAt: '2026-07-22T00:00:00.000Z',
            rowCount: 3,
          },
          timeline: {
            availability: 'available',
            watermarkAt: '2026-07-22T00:00:00.000Z',
            rowCount: 3,
          },
          map_globe: { availability: 'missing', watermarkAt: null, rowCount: 0 },
          value_chain: { availability: 'missing', watermarkAt: null, rowCount: 0 },
        },
        () => allocatedId++,
      ),
    );
    if (!result.p?.k.includes('geoSnapshot')) {
      throw new Error('Radar payload is missing geoSnapshot');
    }
    setSerializedRecordValue(
      result,
      'geoSnapshot',
      serializedValue(positiveGeoSnapshotFixture(), () => allocatedId++),
    );
    evidence.itemCount = fixtureItems.length;
    evidence.scopeTotal = 3;
  });
}

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;
const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === '1';
const expectedArtifactSha256 = process.env.PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256;
let authenticatedCookies: Parameters<BrowserContext['addCookies']>[0] = [];

function assertProductionArtifactIdentity(): void {
  if (!useProductionBuild) return;
  if (!expectedArtifactSha256 || !/^[0-9a-f]{64}$/.test(expectedArtifactSha256)) {
    throw new Error('PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256 is required for production QA');
  }
  const actual = hashProductionArtifact(new URL('../apps/web/.output/', import.meta.url));
  if (actual !== expectedArtifactSha256) {
    throw new Error(
      `Production artifact mismatch: expected ${expectedArtifactSha256}, got ${actual}`,
    );
  }
}

if (storageState) test.use({ storageState });

test.describe('v3 research workspace candidate', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    assertProductionArtifactIdentity();
    if (storageState) return;
    if (!username || !password) {
      throw new Error('Stock Insight E2E credentials or storage state are required');
    }
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
    const page = await context.newPage();
    await page.goto('/login?redirect=%2Fworkspace%3Fview%3Dradar');
    await page.getByLabel('사용자 이름').fill(username);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\?view=radar/);
    authenticatedCookies = (await context.storageState()).cookies;
    await context.close();
  });

  test.beforeEach(async ({ context }, testInfo) => {
    testInfo.annotations.push({
      type: 'production-artifact-sha256',
      description: expectedArtifactSha256 ?? 'development',
    });
    if (!storageState) await context.addCookies(authenticatedCookies);
  });

  test.afterAll(() => assertProductionArtifactIdentity());

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
  }, testInfo) => {
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
    const componentWatermark = page.getByTestId('market-component-watermark');
    await expect(componentWatermark).toHaveAttribute('data-component-availability', 'available');
    await expect(componentWatermark).toContainText('3건');

    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(componentWatermark).toHaveAttribute('data-component-availability', 'partial');
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
    await expect(componentWatermark).toHaveAttribute('data-component-availability', 'missing');
    const themePanel = page.getByTestId('market-mode-theme_community');
    await expect(themePanel).toContainText('테마 구성원 원천이 연결되지 않았습니다');
    await expect(themePanel).toHaveAttribute('data-display-state', 'missing');
    await expect(themePanel.locator(':scope > [data-kind="empty"]')).toHaveCount(1);
    await expect(themePanel.locator(':scope > :not([data-kind="empty"])')).toHaveCount(0);
    await expect(page.getByTestId('market-mode-footer')).toHaveCount(0);

    await tabs.nth(4).click();
    await expect(componentWatermark).toHaveAttribute('data-component-availability', 'available');
    await expect(page.getByTestId('market-heatmap-row')).toHaveCount(2);
    await expect(page.getByTestId('market-heatmap-row').first()).toBeVisible();

    await tabs.nth(5).click();
    await expect(page.getByTestId('market-timeline-row')).toHaveCount(2);
    await expect(page.getByTestId('market-timeline-row').first()).toBeVisible();

    await tabs.nth(6).click();
    await expect(componentWatermark).toHaveAttribute('data-component-availability', 'available');
    const mapPanel = page.getByTestId('market-mode-map_globe');
    await expect(mapPanel).toHaveAttribute('data-display-state', 'content');
    await expect(page.getByTestId('geo-map-canvas')).toBeVisible();
    await expect(page.getByTestId('geo-fallback-row')).toHaveCount(2);
    await expect(mapPanel).toContainText(positiveGeoSnapshotFixture().snapshotId);
    await expect(mapPanel).toContainText('H3 파생 셀 2개');
    await expect(page.getByRole('button', { name: '지도 확대' })).toBeEnabled();
    await expect(mapPanel.getByRole('status')).toContainText('지도 렌더링 준비됨');
    await expect(mapPanel.locator('[data-map-generation]')).toHaveAttribute(
      'data-visible-feature-count',
      '2',
    );
    if (process.env.P3D_CAPTURE_SCREENSHOTS === '1') {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      await page.screenshot({
        path: testInfo.outputPath('p3-d-map.png'),
        fullPage: true,
        animations: 'disabled',
      });
    }
    if (testInfo.project.name === 'desktop') {
      const desktopViewport = page.viewportSize();
      expect(desktopViewport).not.toBeNull();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(mapPanel.locator('[data-map-generation]')).toHaveAttribute(
        'data-visible-feature-count',
        '2',
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.setViewportSize(desktopViewport!);
      await expect(mapPanel.locator('[data-map-generation]')).toHaveAttribute(
        'data-visible-feature-count',
        '2',
      );
    }
    await expect(page.getByTestId('market-mode-footer')).toHaveCount(0);

    await tabs.last().click();
    await expect(componentWatermark).toHaveAttribute('data-component-availability', 'missing');
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

  test('keeps sealed geo evidence visible when WebGL is unavailable', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'WebGL fallback is viewport-independent');
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
          if (['webgl', 'webgl2', 'experimental-webgl'].includes(contextId)) return null;
          return Reflect.apply(original, this, [contextId, ...args]);
        },
      });
    });
    await page.goto('/workspace?view=today');
    const evidence = await installPositiveRadarLoader(page);
    await page.getByTestId('workspace-nav-radar').click();
    await page.waitForURL(/view=radar/);
    await expect.poll(() => evidence.matched).toBe(true);
    const tabs = page.getByRole('tablist', { name: '시장 화면 선택' }).getByRole('tab');
    await tabs.nth(6).click();
    const mapPanel = page.getByTestId('market-mode-map_globe');
    await expect(mapPanel.getByRole('status')).toContainText(
      '지도 렌더링을 사용할 수 없어 근거 표를 유지합니다',
    );
    await expect(page.getByTestId('geo-fallback-row')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '지도 확대' })).toHaveCount(0);
    await expect(mapPanel).toContainText('geo revision 1001 · source revision 101');
    if (process.env.P3D_CAPTURE_SCREENSHOTS === '1') {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      await page.screenshot({
        path: testInfo.outputPath('p3-d-map-webgl-fallback.png'),
        fullPage: true,
        animations: 'disabled',
      });
    }
    const results = await new AxeBuilder({ page })
      .include('[data-testid="market-mode-map_globe"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('settles the geo camera without motion when reduced motion is requested', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop covers the reduced-motion branch');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/workspace?view=today');
    const evidence = await installPositiveRadarLoader(page);
    await page.getByTestId('workspace-nav-radar').click();
    await page.waitForURL(/view=radar/);
    await expect.poll(() => evidence.matched).toBe(true);

    const tabs = page.getByRole('tablist', { name: '시장 화면 선택' }).getByRole('tab');
    await tabs.nth(6).click();
    const mapPanel = page.getByTestId('market-mode-map_globe');
    await expect(mapPanel.getByRole('status')).toContainText('지도 렌더링 준비됨');
    const mapStage = mapPanel.locator('[data-map-generation]');
    const initialGeneration = await mapStage.getAttribute('data-map-generation');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(mapStage).toHaveAttribute('data-map-generation', /:reduced$/);
    expect(await mapStage.getAttribute('data-map-generation')).not.toBe(initialGeneration);
    await expect(mapPanel.getByRole('status')).toContainText('지도 렌더링 준비됨');
    await expect(page.getByTestId('geo-fallback-row')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '지도 확대' })).toBeEnabled();
    const motionDurations = await page.getByTestId('geo-map-canvas').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        transitionSeconds: Number.parseFloat(style.transitionDuration),
        animationSeconds: Number.parseFloat(style.animationDuration),
      };
    });
    expect(motionDurations.transitionSeconds).toBe(0);
    expect(motionDurations.animationSeconds).toBeLessThanOrEqual(0.000001);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
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
          componentWatermarks: {
            event_radar: {
              availability: 'available',
              watermarkAt: '2026-07-22T00:00:00.000Z',
              rowCount: 3,
            },
            factor_map: {
              availability: 'partial',
              watermarkAt: '2026-07-22T00:00:00.000Z',
              rowCount: 3,
            },
            propagation_map: {
              availability: 'partial',
              watermarkAt: '2026-07-22T00:00:00.000Z',
              rowCount: 3,
            },
            theme_community: { availability: 'missing', watermarkAt: null, rowCount: 0 },
            heatmap_matrix: {
              availability: 'available',
              watermarkAt: '2026-07-22T00:00:00.000Z',
              rowCount: 3,
            },
            timeline: {
              availability: 'available',
              watermarkAt: '2026-07-22T00:00:00.000Z',
              rowCount: 3,
            },
            map_globe: { availability: 'missing', watermarkAt: null, rowCount: 0 },
            value_chain: { availability: 'missing', watermarkAt: null, rowCount: 0 },
          },
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

    await page.evaluate(() => {
      const target = window as typeof window & {
        __stockInsightNativeRaf?: typeof window.requestAnimationFrame;
      };
      target.__stockInsightNativeRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
        window.setTimeout(
          () => callback(performance.now()),
          250,
        )) as typeof window.requestAnimationFrame;
    });
    await page.setViewportSize({ width: 1200, height: 900 });
    const search = page.getByRole('textbox', { name: '종목명 또는 티커 검색' });
    await search.focus();
    await expect(search).toBeFocused();
    await page.waitForTimeout(650);
    await expect(search).toBeFocused();
    await page.evaluate(() => {
      const target = window as typeof window & {
        __stockInsightNativeRaf?: typeof window.requestAnimationFrame;
      };
      if (target.__stockInsightNativeRaf) {
        window.requestAnimationFrame = target.__stockInsightNativeRaf;
        delete target.__stockInsightNativeRaf;
      }
    });
  });

  test('keeps the relation panel reachable at short desktop heights and narrow widths', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop sticky-panel contract');
    await page.setViewportSize({ width: 1366, height: 480 });
    await page.goto('/workspace?view=themes');
    const panel = page.getByTestId('relation-ledger');
    await expect(panel).toBeVisible();
    await panel.evaluate((element) => {
      const probe = document.createElement('div');
      probe.dataset.relationScrollProbe = 'true';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.height = '900px';
      element.append(probe);
    });
    await panel.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 64));

    const desktop = await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const rect = element.getBoundingClientRect();
      const last = element.lastElementChild?.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        clientHeight: element.clientHeight,
        lastBottom: last?.bottom ?? Number.POSITIVE_INFINITY,
        position: getComputedStyle(element).position,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        viewportHeight: window.innerHeight,
      };
    });
    expect(desktop.position).toBe('sticky');
    expect(desktop.bottom).toBeLessThanOrEqual(desktop.viewportHeight + 1);
    expect(desktop.scrollHeight).toBeGreaterThan(desktop.clientHeight);
    expect(desktop.scrollTop).toBeGreaterThan(0);
    expect(desktop.lastBottom).toBeLessThanOrEqual(desktop.bottom + 1);

    await page.setViewportSize({ width: 1100, height: 480 });
    await panel
      .locator(':scope > :last-child')
      .evaluate((element) => element.scrollIntoView({ block: 'end' }));
    const narrow = await panel.evaluate((element) => {
      const last = element.lastElementChild?.getBoundingClientRect();
      return {
        clientHeight: element.clientHeight,
        lastBottom: last?.bottom ?? Number.POSITIVE_INFINITY,
        maxHeight: getComputedStyle(element).maxHeight,
        position: getComputedStyle(element).position,
        scrollHeight: element.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    expect(narrow.position).toBe('static');
    expect(narrow.maxHeight).toBe('none');
    expect(narrow.scrollHeight).toBeLessThanOrEqual(narrow.clientHeight + 1);
    expect(narrow.lastBottom).toBeLessThanOrEqual(narrow.viewportHeight + 1);
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
