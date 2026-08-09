import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Response as PlaywrightResponse,
} from '@playwright/test';

import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';

import { hashProductionArtifact } from '../scripts/production-artifact-hash.mjs';

const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === '1';
const expectedArtifactSha256 = process.env.PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256;

const actualArtifactSha256 = useProductionBuild
  ? hashProductionArtifact(new URL('../apps/web/.output/', import.meta.url))
  : undefined;

const edgeHeaders = readFileSync(
  new URL('../deploy/stock-edge/security-headers.conf', import.meta.url),
  'utf8',
);
const edgeCsp = edgeHeaders.match(/Content-Security-Policy "([^"]+)"/)?.[1];
if (!edgeCsp) throw new Error('Stock edge CSP is missing');

type RuntimeProbe = {
  workerCount: number;
  workerSchemes: string[];
  cspViolations: Array<{ blockedUri: string; directive: string }>;
};

async function installEdgeCspProbe(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const probeScript = `<script>
      (() => {
        const NativeWorker = window.Worker;
        window.__relationCspViolations = [];
        window.__relationWorkerCount = 0;
        window.__relationWorkerSchemes = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__relationCspViolations.push({
            blockedUri: event.blockedURI,
            directive: event.effectiveDirective,
          });
        });
        Object.defineProperty(window, 'Worker', {
          configurable: true,
          value: class TrackingWorker extends NativeWorker {
            constructor(url, options) {
              window.__relationWorkerCount += 1;
              window.__relationWorkerSchemes.push(new URL(url, window.location.href).protocol);
              super(url, options);
            }
          },
        });
      })();
    </script>`;
    const body = (await response.text()).replace('</head>', `${probeScript}</head>`);
    await route.fulfill({
      response,
      body,
      headers: {
        ...response.headers(),
        'content-security-policy': edgeCsp,
      },
    });
  });
}

async function readRuntimeProbe(page: Page): Promise<RuntimeProbe> {
  return page.evaluate(() => {
    const probeWindow = window as typeof window & {
      __relationCspViolations?: RuntimeProbe['cspViolations'];
      __relationWorkerCount?: number;
      __relationWorkerSchemes?: string[];
    };
    return {
      workerCount: probeWindow.__relationWorkerCount ?? 0,
      workerSchemes: probeWindow.__relationWorkerSchemes ?? [],
      cspViolations: probeWindow.__relationCspViolations ?? [],
    };
  });
}

function relationFixture(verified = true, rootEntityKey = 'US:FROM'): Record<string, unknown> {
  const timestamp = '2026-07-20T00:00:00.000Z';
  const baseNodes = [
    { entityKey: 'US:FROM', label: '발신기업', market: 'US', watched: false, holding: false },
    { entityKey: 'US:TO', label: '수신기업', market: 'US', watched: false, holding: false },
    { entityKey: 'US:PEER', label: '동료기업', market: 'US', watched: false, holding: false },
  ];
  // The root must be one of the returned nodes; if a caller requests an entity
  // outside the base set, surface it so an identity mismatch cannot hide.
  const nodes = baseNodes.some((node) => node.entityKey === rootEntityKey)
    ? baseNodes
    : [
        {
          entityKey: rootEntityKey,
          label: rootEntityKey,
          market: 'US',
          watched: false,
          holding: false,
        },
        ...baseNodes,
      ];
  return {
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt: timestamp,
      freshness: 'available',
      contentSnapshot: {
        analysisRunId: 'sigma-production-run',
        analysisRevision: 1,
        analysisCutoffAt: timestamp,
        sourceWatermarkAt: timestamp,
        freshUntil: '2026-07-21T00:00:00.000Z',
      },
      graphSnapshot: {
        requestedAsOf: timestamp,
        knownThroughAt: timestamp,
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: { marketDataAsOf: null },
      sourceCoverage: { linked: 3, clickable: 2, total: 3 },
      qualityFlags: [],
    },
    rootEntityKey,
    depth: 1,
    nodes,
    edges: [
      {
        edgeId: 'directed-edge',
        from: 'US:FROM',
        to: 'US:TO',
        relationType: 'news_co_mention',
        direction: 'directed',
        weight: 0.8,
        approved: verified,
        inferred: !verified,
        evidenceQuality: 'high',
        evidenceCount: 2,
        clickableSourceCount: 1,
      },
      {
        edgeId: 'undirected-edge',
        from: 'US:FROM',
        to: 'US:PEER',
        relationType: 'peer',
        direction: 'undirected',
        weight: 0.6,
        approved: true,
        inferred: false,
        evidenceQuality: 'medium',
        evidenceCount: 1,
        clickableSourceCount: 1,
      },
    ],
    evidenceSummary: {
      evidenceCount: 3,
      clickableSourceCount: 2,
      limitation: '검증된 fixture 관계만 표시합니다.',
    },
  };
}

const REQUEST_ENTITY_PATTERN = /\/api\/entities\/([^/]+)\/briefing/;

// The retired themes workspace no longer owns the relation graph. Exercise the
// production Radar -> market connection inspector boundary and echo the exact
// briefing identity as the graph root.
async function installRootEchoingFixture(page: Page, verified = true): Promise<void> {
  await page.route('**/api/entities/**/briefing**', async (route) => {
    const match = REQUEST_ENTITY_PATTERN.exec(route.request().url());
    const requestedKey = match ? decodeURIComponent(match[1]!) : 'US:FROM';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        entityKey: requestedKey,
        surface: 'market_connections',
        stockDetail: null,
        relation: relationFixture(verified, requestedKey),
        impactBrief: null,
        partialFailures: {
          impact: 'Sigma fixture intentionally omits impact-brief data.',
        },
      }),
    });
  });
}

const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const sharedAuthState = process.env.PLAYWRIGHT_SIGMA_AUTH_STATE;
let authenticatedCookies: Parameters<BrowserContext['addCookies']>[0] = [];
if (storageState) test.use({ storageState });

test.describe('Sigma relationship graph', () => {
  test.skip(!useProductionBuild, 'Sigma CSP tests run only against the production artifact');
  test.skip(
    !storageState && (!username || !password),
    'Stock Insight E2E credentials or storage state are required',
  );

  test.beforeAll(async ({ browser }, testInfo) => {
    expect(expectedArtifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(actualArtifactSha256).toBe(expectedArtifactSha256);
    if (storageState) return;
    if (sharedAuthState && existsSync(sharedAuthState) && statSync(sharedAuthState).size > 0) {
      try {
        const shared = JSON.parse(readFileSync(sharedAuthState, 'utf8'));
        if (Array.isArray(shared.cookies) && shared.cookies.length > 0) {
          authenticatedCookies = shared.cookies;
          return;
        }
      } catch {
        // A partially written shared file (parallel-project race) is ignored;
        // this project logs in fresh below.
      }
    }

    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
    const page = await context.newPage();
    await page.goto('/login?redirect=%2Fworkspace%2Fradar');
    await page.getByLabel('사용자 이름').fill(username!);
    await page.locator('#login-password').fill(password!);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/radar(?:\?|$)/);
    const authenticatedState = await context.storageState();
    authenticatedCookies = authenticatedState.cookies;
    if (sharedAuthState) {
      // Atomic publish: write to a per-project temp path then rename, so a
      // concurrent project never reads a half-written cookie jar.
      const tempPath = `${sharedAuthState}.${testInfo.project.name}.tmp`;
      writeFileSync(tempPath, JSON.stringify(authenticatedState), { mode: 0o600 });
      chmodSync(tempPath, 0o600);
      renameSync(tempPath, sharedAuthState);
    }
    await context.close();
  });

  test.beforeEach(async ({ context, page }, testInfo) => {
    testInfo.annotations.push({
      type: 'production-artifact-sha256',
      description: actualArtifactSha256!,
    });
    if (!storageState) await context.addCookies(authenticatedCookies);
    await installEdgeCspProbe(page);
  });

  // Navigate to a workspace view and, if the session cookie was rejected (a
  // parallel-project auth race or SSR session-check timing), log in inline and
  // retry once so a live-data first test is not flaky.
  async function gotoWorkspace(page: Page, path: string): Promise<PlaywrightResponse | null> {
    const response = await page.goto(path);
    if (!/\/login/.test(page.url())) return response;
    if (storageState) return response;
    await page.getByLabel('사용자 이름').fill(username!);
    await page.locator('#login-password').fill(password!);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace/);
    return page.goto(path);
  }

  async function openRadarRelationGraph(
    page: Page,
    projectName: string,
    verified = true,
  ): Promise<{
    graph: ReturnType<Page['getByTestId']>;
    inspector: ReturnType<Page['getByTestId']>;
    response: PlaywrightResponse | null;
  }> {
    await installRootEchoingFixture(page, verified);
    const response = await gotoWorkspace(page, '/workspace/radar');
    await expect(page).toHaveURL(/\/workspace\/radar(?:\?|$)/);
    const briefingResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/entities/') && candidate.url().includes('/briefing'),
    );
    const detailButton = page.getByRole('button', { name: /시장 변화 상세 열기/ }).first();
    await expect(detailButton).toBeVisible();
    await detailButton.click();
    await briefingResponse;
    const inspector = page.getByTestId('market-connection-inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector.getByRole('heading', { name: '시장 변화 요약' })).toBeVisible();
    if (projectName !== 'mobile') {
      await inspector.getByRole('button', { name: '넓게 보기' }).click();
    }
    const graph = inspector.getByTestId('relation-graph');
    return { graph, inspector, response };
  }

  test('renders WebGL and keeps search, camera, and keyboard paths interactive', async ({
    page,
  }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });

    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);
      const pendingInitialStops = new Map<number, () => void>();
      let nextSyntheticTimer = -1;
      window.setTimeout = ((handler: TimerHandler, timeout = 0, ...args: unknown[]) => {
        if (timeout === 1_400 && typeof handler === 'function') {
          const timer = nextSyntheticTimer--;
          pendingInitialStops.set(timer, () => handler(...args));
          return timer;
        }
        return nativeSetTimeout(handler, timeout, ...args);
      }) as typeof window.setTimeout;
      window.clearTimeout = ((timer?: number) => {
        if (timer !== undefined && pendingInitialStops.delete(timer)) return;
        nativeClearTimeout(timer);
      }) as typeof window.clearTimeout;
      Object.assign(window, {
        __firePendingSigmaInitialStop: () => {
          let fired = 0;
          for (const [timer, callback] of pendingInitialStops) {
            pendingInitialStops.delete(timer);
            callback();
            fired += 1;
          }
          return fired;
        },
      });
    });

    const { graph, response } = await openRadarRelationGraph(page, testInfo.project.name);
    expect(response?.headers()['content-security-policy']).toBe(edgeCsp);

    const map = graph.locator('section[aria-label$="관계 지도"]');
    await expect(map).toHaveAttribute('data-layout-mode', 'force');
    await expect(map.locator('canvas')).toHaveCount(7);
    await expect(graph.getByLabel('관계 노드 검색')).toBeVisible();
    await expect(graph.getByLabel('확대')).toBeVisible();
    await expect(graph.getByLabel('축소')).toBeVisible();
    await expect(graph.getByLabel('관계 지도 원위치')).toBeVisible();
    if (testInfo.project.name === 'mobile') {
      await page.setViewportSize({ width: 320, height: 844 });
      const searchBox = await graph.getByTestId('relation-graph-search').boundingBox();
      const controlsBox = await graph.getByTestId('relation-graph-controls').boundingBox();
      const controlButtons = graph.getByTestId('relation-graph-controls').getByRole('button');
      expect(searchBox).not.toBeNull();
      expect(controlsBox).not.toBeNull();
      expect(searchBox!.x + searchBox!.width + 8).toBeLessThanOrEqual(controlsBox!.x + 0.5);
      for (let index = 0; index < (await controlButtons.count()); index += 1) {
        const controlBox = await controlButtons.nth(index).boundingBox();
        expect(controlBox!.width).toBeGreaterThanOrEqual(44);
        expect(controlBox!.height).toBeGreaterThanOrEqual(44);
      }
      await graph.getByLabel('확대').tap();
      await graph.getByLabel('관계 지도 원위치').tap();
      await page.setViewportSize({ width: 390, height: 844 });
    }

    await page.waitForTimeout(1_900);
    const screenshotPath = `/tmp/stock-insight-p1-sigma-${testInfo.project.name}.png`;
    await graph.screenshot({ path: screenshotPath });
    await testInfo.attach(`sigma-production-${testInfo.project.name}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
    const backgrounds = await graph.evaluate((element) => {
      const surfaceProbe = document.createElement('span');
      surfaceProbe.style.backgroundColor = 'var(--color-surface)';
      element.append(surfaceProbe);
      const result = {
        frame: getComputedStyle(element).backgroundColor,
        canvas: getComputedStyle(element.querySelector('[data-layout-mode]')!).backgroundColor,
        surface: getComputedStyle(surfaceProbe).backgroundColor,
      };
      surfaceProbe.remove();
      return result;
    });
    expect(backgrounds.frame).toBe(backgrounds.surface);
    expect(backgrounds.canvas).toBe(backgrounds.surface);

    const nodeList = graph.getByRole('navigation', { name: '관계 노드 목록' });
    const nodeButtons = nodeList.getByRole('button');
    await expect(nodeButtons.first()).toBeVisible();
    const nodeLabel = (
      await nodeButtons.first().locator('[data-slot="button-label"] > span').textContent()
    )?.trim();
    expect(nodeLabel).toBeTruthy();

    await graph.getByLabel('관계 노드 검색').fill(nodeLabel!);
    await graph.getByLabel('관계 노드 검색').press('Enter');
    await expect(nodeButtons.first()).toHaveAttribute('aria-current', 'true');

    await graph.getByLabel('확대').click();
    await graph.getByLabel('축소').click();
    await graph.getByLabel('관계 지도 원위치').click();
    await page.waitForTimeout(480);

    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    const status = graph.getByTestId('relation-interaction-status');
    let nodePoint: { x: number; y: number } | undefined;
    for (let row = 1; row <= 18 && !nodePoint; row += 1) {
      for (let column = 1; column <= 24; column += 1) {
        const x = box!.x + (box!.width * column) / 25;
        const y = box!.y + (box!.height * row) / 19;
        await page.mouse.move(x, y);
        await page.waitForTimeout(12);
        if ((await status.textContent())?.includes('강조')) {
          nodePoint = { x, y };
          break;
        }
      }
    }
    expect(nodePoint).toBeTruthy();
    await page.mouse.move(nodePoint!.x, nodePoint!.y);
    await page.mouse.down();
    await expect(status).toContainText('이동 중');
    await expect(map).toHaveAttribute('data-custom-bbox', 'fixed');
    const staleInitialStops = await page.evaluate(() =>
      (
        window as unknown as Window & {
          __firePendingSigmaInitialStop: () => number;
        }
      ).__firePendingSigmaInitialStop(),
    );
    expect(staleInitialStops).toBe(0);
    await page.mouse.move(nodePoint!.x + 26, nodePoint!.y + 18, { steps: 4 });
    await page.mouse.up();
    await expect(status).toContainText('배치 조정 완료');
    await expect(map).toHaveAttribute('data-custom-bbox', 'released');
    const postDragButton = nodeButtons.nth(1);
    if (testInfo.project.name === 'mobile') await postDragButton.tap();
    else await postDragButton.click();
    await expect(postDragButton).toHaveAttribute('aria-current', 'true');
    const postDragLabel = (
      await postDragButton.locator('[data-slot="button-label"] > span').textContent()
    )?.trim();
    expect(postDragLabel).toBeTruthy();
    await expect(graph.getByLabel('관계 노드 검색')).toHaveValue(postDragLabel!);

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    const probe = await readRuntimeProbe(page);
    expect(probe.workerCount).toBeGreaterThan(0);
    expect(probe.workerSchemes).toEqual(Array(probe.workerCount).fill('blob:'));
    expect(probe.cspViolations).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });

  test('fails closed before graph DOM when an API edge is unverified', async ({
    page,
  }, testInfo) => {
    const { graph, inspector } = await openRadarRelationGraph(page, testInfo.project.name, false);

    await expect(graph).toHaveCount(0);
    await expect(inspector.getByRole('heading', { name: '관계 그래프' })).toBeVisible();
    await expect(inspector.getByText('관계 그래프를 확인하지 못했습니다')).toBeVisible();
    await expect(inspector.getByRole('navigation', { name: '관계 노드 목록' })).toHaveCount(0);
    await expect(inspector.getByRole('heading', { name: '시장 변화 요약' })).toBeVisible();
    expect((await readRuntimeProbe(page)).cspViolations).toEqual([]);
  });

  test('renders directed and undirected semantics and preserves local node selection', async ({
    page,
  }, testInfo) => {
    const { graph } = await openRadarRelationGraph(page, testInfo.project.name);
    // The rendered canvas — not just a text projection — carries directionality.
    const canvas = graph.locator('section[aria-label$="관계 지도"]');
    await expect(canvas).toHaveAttribute('data-directed-edges', '1');
    await expect(canvas).toHaveAttribute('data-undirected-edges', '1');

    const targetButton = graph.getByRole('button', { name: /수신기업/ });
    if (testInfo.project.name === 'mobile') await targetButton.tap();
    else await targetButton.click();
    await expect(targetButton).toHaveAttribute('aria-current', 'true');
    await expect(graph.getByLabel('관계 노드 검색')).toHaveValue('수신기업');
    expect((await readRuntimeProbe(page)).cspViolations).toEqual([]);
  });

  test('disables worker motion when reduced motion is requested', async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { graph, response } = await openRadarRelationGraph(page, testInfo.project.name);
    expect(response?.headers()['content-security-policy']).toBe(edgeCsp);

    await expect(graph.locator('section[aria-label$="관계 지도"]')).toHaveAttribute(
      'data-layout-mode',
      'static',
    );
    await expect(graph.locator('canvas')).toHaveCount(7);
    const probe = await readRuntimeProbe(page);
    expect(probe.workerCount).toBe(0);
    expect(probe.workerSchemes).toEqual([]);
    expect(probe.cspViolations).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });

  test('keeps text-node selection working when WebGL initialization fails', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value(type: string, ...args: unknown[]) {
          if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
          return Reflect.apply(originalGetContext, this, [type, ...args]);
        },
      });
    });

    const { graph } = await openRadarRelationGraph(page, testInfo.project.name);
    await expect(graph.getByRole('alert')).toContainText('관계 지도를 표시하지 못했습니다');
    const targetButton = graph.getByRole('button', { name: /수신기업/ });
    if (testInfo.project.name === 'mobile') await targetButton.tap();
    else await targetButton.click();
    await expect(targetButton).toHaveAttribute('aria-current', 'true');
    await expect(graph.getByLabel('관계 노드 검색')).toHaveValue('수신기업');
  });
});
