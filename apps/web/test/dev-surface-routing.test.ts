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

    const [previewPage, previewRoute] = await Promise.all([
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
      readSource('../src/routes/[__dev-preview].tsx'),
    ]);
    const fixture = fixtureModule.stocksPreviewFixture;

    assert.equal(fixture.view, 'stocks');
    assert.equal(fixture.stocks.meta.source, 'mock');
    assert.equal(stockListResponseSchema.safeParse(fixture.stocks).success, true);
    assert.ok(fixture.stocks.data.length > 0);
    assert.match(previewPage, /<ResearchWorkspacePage/);
    assert.match(previewPage, /loadStockDeepDive=/);
    assert.match(previewPage, /navigationMode="static"/);
    assert.match(previewPage, /개발 전용 미리보기/);
    assert.doesNotMatch(previewPage, /createApiClient|loadResearchWorkspaceView|getCurrentSession/);
    assert.doesNotMatch(previewRoute, /loader\s*:|createServerFn|fetch\s*\(/);
  });

  it('offers a deterministic Today preview through the real five-part workspace view', async () => {
    const fixtureModule =
      await import('../src/pages/dev-preview/model/today-preview-fixture.ts').catch(() => null);
    assert.ok(fixtureModule, 'expected the Today preview fixture to exist');
    if (!fixtureModule) return;

    const [previewPage, previewRoute] = await Promise.all([
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
      readSource('../src/routes/[__dev-preview].tsx'),
    ]);
    const fixture = fixtureModule.todayPreviewFixture;

    assert.equal(fixture.view, 'today');
    assert.equal(fixture.today.meta.visibility, 'internal');
    assert.ok(fixture.today.summary.laneItemCount >= 4);
    assert.match(previewRoute, /search\.surface === 'today'/);
    assert.match(previewPage, /todayPreviewFixture/);
    assert.match(previewPage, /surface === 'today'/);
    assert.doesNotMatch(previewPage, /createApiClient|loadResearchWorkspaceView|getCurrentSession/);
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

  it('keeps compact Deep Dive metadata from inheriting wide property-list columns', async () => {
    const deepDiveStyles = await readSource(
      '../src/pages/research-workspace/ui/stock-deep-dive-panel.module.css',
    );

    assert.match(
      deepDiveStyles,
      /\.headerMeta div\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
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
