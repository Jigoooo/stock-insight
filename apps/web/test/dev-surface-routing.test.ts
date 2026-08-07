import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { stockListResponseSchema } from '@stock-insight/contracts';

async function readSource(path: string) {
  return readFile(new URL(path, import.meta.url), 'utf8').catch(() => '');
}

describe('development-only visual surface gates', () => {
  it('fails closed unless development mode and the exact flag value are both present', async () => {
    const gateModule = await import('../src/shared/config/dev-surface-gate.ts').catch(() => null);
    assert.ok(gateModule, 'expected the development surface gate module to exist');
    if (!gateModule) return;

    const cases = [
      { isDev: true, flag: '1', want: true },
      { isDev: false, flag: '1', want: false },
      { isDev: true, flag: 'true', want: false },
      { isDev: true, flag: '01', want: false },
      { isDev: true, flag: '', want: false },
      { isDev: true, flag: undefined, want: false },
    ] as const;

    for (const testCase of cases) {
      assert.equal(
        gateModule.isDevSurfaceEnabled(testCase.isDev, testCase.flag),
        testCase.want,
        JSON.stringify(testCase),
      );
    }
  });
});

describe('development-only visual surface routes', () => {
  it('returns only valid discriminated preview requests and rejects cross-surface scenarios', async () => {
    const requestModule =
      await import('../src/pages/dev-preview/model/dev-preview-request.ts').catch(() => null);
    assert.ok(requestModule, 'expected the dev preview request resolver to exist');
    if (!requestModule) return;

    const resolve = requestModule.resolveDevPreviewRequest;
    assert.deepEqual(resolve({ surface: 'stocks', scenario: 'no-holdings' }), {
      surface: 'stocks',
      scenario: 'no-holdings',
    });
    assert.deepEqual(resolve({ surface: 'market-connections', scenario: 'partial' }), {
      surface: 'market-connections',
      scenario: 'partial',
    });
    assert.deepEqual(resolve({ scenario: 'empty' }), {
      surface: undefined,
      scenario: 'empty',
    });
    assert.deepEqual(resolve({ surface: 'today' }), { surface: 'today' });
    assert.deepEqual(resolve({ surface: 'admin-invitations' }), {
      surface: 'admin-invitations',
    });

    assert.throws(
      () => resolve({ surface: 'market-connections', scenario: 'no-holdings' }),
      /not valid for market-connections/,
    );
    assert.throws(
      () => resolve({ surface: 'stocks', scenario: 'no-personalized' }),
      /not valid for stocks/,
    );
    assert.throws(
      () => resolve({ surface: 'stocks', scenario: 'partial' }),
      /not valid for stocks/,
    );
    assert.throws(() => resolve({ surface: 'today', scenario: 'default' }), /not valid for today/);
  });

  it('registers product preview and UI Lab as separate public routes', async () => {
    const routeTree = await readSource('../src/routeTree.gen.ts');

    assert.match(routeTree, /path: '\/__dev-preview'/);
    assert.match(routeTree, /path: '\/__ui-lab'/);
    assert.doesNotMatch(routeTree, /_authenticated\/(?:__dev-preview|__ui-lab)/);
  });

  it('keeps both routes independently gated without touching the authenticated boundary', async () => {
    const [previewRoute, uiLabRoute, authenticatedRoute] = await Promise.all([
      readSource('../src/routes/[__dev-preview].tsx'),
      readSource('../src/routes/[__ui-lab].tsx'),
      readSource('../src/routes/_authenticated.tsx'),
    ]);

    assert.match(previewRoute, /VITE_ENABLE_DEV_PREVIEW/);
    assert.doesNotMatch(
      previewRoute,
      /VITE_ENABLE_UI_LAB|getCurrentSession|authFunctionMiddleware/,
    );
    assert.match(uiLabRoute, /VITE_ENABLE_UI_LAB/);
    assert.doesNotMatch(
      uiLabRoute,
      /VITE_ENABLE_DEV_PREVIEW|getCurrentSession|authFunctionMiddleware/,
    );
    assert.match(previewRoute, /throw notFound\(\)/);
    assert.match(uiLabRoute, /throw notFound\(\)/);
    assert.match(
      authenticatedRoute,
      /const session = await context\.authenticatedSessionCache\.load\(getCurrentSession\)/,
    );
    assert.match(authenticatedRoute, /throw redirect\(\{ to: '\/login'/);
  });

  it('uses one deterministic typed stocks fixture and the real workspace page without loaders', async () => {
    const fixtureModule =
      await import('../src/pages/dev-preview/model/stocks-preview-fixture.ts').catch(() => null);
    assert.ok(fixtureModule, 'expected the stocks preview fixture to exist');
    if (!fixtureModule) return;

    const [previewPage, previewRoute, workspacePage, stocksView] = await Promise.all([
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
      readSource('../src/routes/[__dev-preview].tsx'),
      readSource('../src/pages/research-workspace/ui/research-workspace-page.tsx'),
      readSource('../src/pages/research-workspace/ui/views/stocks-view.tsx'),
    ]);
    const fixture = fixtureModule.stocksPreviewFixture;

    assert.equal(fixture.view, 'stocks');
    assert.equal(fixture.stocks.meta.source, 'mock');
    assert.equal(stockListResponseSchema.safeParse(fixture.stocks).success, true);
    assert.ok(fixture.stocks.data.length > 0);
    assert.match(previewPage, /<ResearchWorkspacePage/);
    assert.match(previewPage, /loadStockBriefingDetail=\{stocksPreview\.loader\}/);
    assert.match(previewPage, /loader: loadPreviewStockBriefing/);
    assert.match(previewPage, /navigationMode="static"/);
    assert.match(previewPage, /개발 전용 미리보기/);
    assert.match(workspacePage, /<StocksView[\s\S]*?interactive=\{hydrated\}/);
    assert.match(stocksView, /<fieldset[^>]*disabled=\{!interactive\}/);
    assert.doesNotMatch(previewPage, /createApiClient|loadResearchWorkspaceView|getCurrentSession/);
    assert.doesNotMatch(previewRoute, /loader\s*:|createServerFn|fetch\s*\(/);
  });

  it('offers a deterministic Today preview through the real five-part workspace view', async () => {
    const fixtureModule =
      await import('../src/pages/dev-preview/model/today-preview-fixture.ts').catch(() => null);
    assert.ok(fixtureModule, 'expected the Today preview fixture to exist');
    if (!fixtureModule) return;

    const [previewPage, previewRequest] = await Promise.all([
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
      readSource('../src/pages/dev-preview/model/dev-preview-request.ts'),
    ]);
    const fixture = fixtureModule.todayPreviewFixture;

    assert.equal(fixture.view, 'today');
    assert.equal(fixture.today.meta.visibility, 'internal');
    assert.ok(fixture.today.summary.laneItemCount >= 4);
    assert.match(previewRequest, /search\.surface === 'today'/);
    assert.match(previewPage, /todayPreviewFixture/);
    assert.match(previewPage, /surface === 'today'/);
    assert.doesNotMatch(previewPage, /createApiClient|loadResearchWorkspaceView|getCurrentSession/);
  });

  it('routes deterministic Stocks preview scenarios without authenticated or network loaders', async () => {
    const [previewPage, previewRequest, previewRoute] = await Promise.all([
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
      readSource('../src/pages/dev-preview/model/dev-preview-request.ts'),
      readSource('../src/routes/[__dev-preview].tsx'),
    ]);

    assert.match(previewRequest, /search\.surface === 'stocks'/);
    assert.match(previewRequest, /'no-holdings'/);
    assert.match(previewRequest, /'empty'/);
    assert.match(previewRequest, /'detail-error'/);
    assert.match(previewRoute, /<DevPreviewPage \{\.\.\.previewRequest\} \/>/);
    assert.match(
      previewRequest,
      /type StocksPreviewScenario = 'default' \| 'no-holdings' \| 'empty' \| 'detail-error'/,
    );
    assert.match(previewPage, /scenario === 'no-holdings'/);
    assert.match(previewPage, /scenario === 'empty'/);
    assert.match(previewPage, /scenario === 'detail-error'/);
    assert.doesNotMatch(previewPage, /createApiClient|loadResearchWorkspaceView|getCurrentSession/);
    assert.doesNotMatch(previewRoute, /loader\s*:|createServerFn|fetch\s*\(/);
  });

  it('routes only the scenarios owned by the Market Connections preview surface', async () => {
    const [previewPage, previewRequest, previewRoute] = await Promise.all([
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
      readSource('../src/pages/dev-preview/model/dev-preview-request.ts'),
      readSource('../src/routes/[__dev-preview].tsx'),
    ]);

    assert.match(previewRequest, /search\.surface === 'market-connections'/);
    assert.match(previewRequest, /resolveStocksScenario/);
    assert.match(previewRequest, /resolveMarketConnectionsScenario/);
    assert.match(previewRequest, /'no-holdings'/);
    assert.match(previewRequest, /'no-personalized'/);
    assert.match(previewRequest, /'partial'/);
    assert.match(previewRoute, /validateSearch: resolveDevPreviewRequest/);
    assert.match(previewPage, /surface === 'market-connections'/);
    assert.match(previewPage, /resolveMarketConnectionsPreview\(props\.scenario \?\? 'default'\)/);
    assert.match(previewPage, /loadMarketConnectionDetail=\{preview\.loader\}/);
    assert.match(previewPage, /marketConnections=\{preview\.marketConnections\}/);
    assert.match(previewPage, /urlState=\{\{ view: 'radar' \}\}/);
    assert.match(previewRoute, /const previewRequest = Route\.useSearch\(\)/);
    assert.match(previewRoute, /<DevPreviewPage \{\.\.\.previewRequest\} \/>/);
    assert.doesNotMatch(previewPage, /requestedScenario === 'no-holdings'/);
    assert.doesNotMatch(previewPage, /requestedScenario === 'no-personalized'/);
    assert.doesNotMatch(previewPage, /requestedScenario === 'partial'/);
    assert.doesNotMatch(previewPage, /createApiClient|loadResearchWorkspaceView|getCurrentSession/);
    assert.doesNotMatch(previewRoute, /loader\s*:|createServerFn|fetch\s*\(/);
  });

  it('previews the real administrator form with local actions and no authenticated loader', async () => {
    const [previewPage, previewRoute] = await Promise.all([
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
      readSource('../src/routes/[__dev-preview].tsx'),
    ]);

    assert.match(previewRoute, /validateSearch:/);
    assert.match(previewRoute, /Route\.useSearch\(\)/);
    assert.match(previewPage, /<AdminInvitationPage/);
    assert.match(previewPage, /issueInvitationAction=\{issuePreviewInvitation\}/);
    assert.match(previewPage, /revokeInvitationAction=\{revokePreviewInvitation\}/);
    assert.match(previewPage, /logoutAction=\{previewLogout\}/);
    assert.doesNotMatch(previewPage, /admin-invitations\/model|auth-functions/);
    assert.doesNotMatch(previewPage, /await\s+(?:issueInvitation|revokeInvitation|logout)\(/);
    assert.doesNotMatch(previewRoute, /loader\s*:|createServerFn|fetch\s*\(/);
  });

  it('renders preview navigation without authenticated route links', async () => {
    const navigation = await readSource(
      '../src/widgets/workspace-shell/ui/workspace-navigation.tsx',
    );

    assert.match(navigation, /navigationMode.*'route'.*'static'/s);
    assert.match(navigation, /navigationMode === 'static'/);
    assert.match(navigation, /aria-disabled="true"/);
  });

  it('keeps UI Lab an empty Market Graphite shell rather than a product preview', async () => {
    const uiLabPage = await readSource('../src/pages/ui-lab/ui/ui-lab-page.tsx');

    assert.match(uiLabPage, /Market Graphite/);
    assert.match(uiLabPage, /향후 배치/);
    assert.doesNotMatch(uiLabPage, /ResearchWorkspacePage|stocksPreviewFixture|StocksView/);
  });

  it('keeps compact stock inspector metadata from inheriting wide property-list columns', async () => {
    const inspectorStyles = await readSource(
      '../src/pages/research-workspace/ui/stock-briefing-inspector.module.css',
    );

    assert.match(inspectorStyles, /\.summaryMeta\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(inspectorStyles, /\.summaryMeta > div,[\s\S]*?min-width:\s*0/);
    assert.match(
      inspectorStyles,
      /@media \(max-width: 767px\)[\s\S]*?\.summaryMeta,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});

describe('development server behavior', () => {
  it('never asks Vite to open an external browser', async () => {
    const viteConfig = await readSource('../vite.config.ts');

    assert.match(viteConfig, /server:\s*\{[\s\S]*?open:\s*false/);
    assert.doesNotMatch(viteConfig, /server:\s*\{[\s\S]*?open:\s*true/);
  });
});
