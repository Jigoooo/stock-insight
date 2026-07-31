import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const uiRoot = new URL('../src/pages/research-workspace/ui/', import.meta.url);
const read = (path: string) => readFile(new URL(path, uiRoot), 'utf8');

const viewFiles = [
  ['TodayView', 'views/today-view.tsx'],
  ['RadarView', 'views/radar-view.tsx'],
  ['StocksView', 'views/stocks-view.tsx'],
  ['CryptoWorkspaceView', 'views/crypto-workspace-view.tsx'],
  ['ThemesView', 'views/themes-view.tsx'],
  ['MyResearchView', 'views/my-research-view.tsx'],
  ['HistoryView', 'views/history-view.tsx'],
  ['StatusView', 'views/status-view.tsx'],
] as const;

describe('workspace shell and keyed view-region contract', () => {
  it('extracts every workspace view from the orchestration page', async () => {
    const [page, ...views] = await Promise.all([
      read('research-workspace-page.tsx'),
      ...viewFiles.map(([, path]) => read(path)),
    ]);

    for (const [index, [component, path]] of viewFiles.entries()) {
      assert.match(views[index], new RegExp(`export function ${component}`), path);
      assert.match(page, new RegExp(`import\\('./${path.replace(/\.tsx$/, '')}'\\)`), path);
      assert.doesNotMatch(page, new RegExp(`function ${component}\\(`), path);
    }
  });

  it('keeps shell chrome outside the keyed view subtree', async () => {
    const [page, shell] = await Promise.all([
      read('research-workspace-page.tsx'),
      read('../../../widgets/workspace-shell/ui/workspace-shell.tsx'),
    ]);

    assert.match(page, /WorkspaceShell/);
    assert.match(page, /WorkspaceViewRegion/);
    assert.match(shell, /data-workspace-shell/);
    assert.match(shell, /children/);
  });

  it('uses one persistent view layer without page-wide opacity or translation animation', async () => {
    const region = await read('workspace-view-region.tsx');

    assert.doesNotMatch(region, /useGSAP|\bgsap\b/);
    assert.doesNotMatch(region, /layers\.exiting|exitingLayer/);
    assert.doesNotMatch(region, /opacity|translate|transform|fromTo/);
    assert.match(region, /data-workspace-view-layer="current"/);
    assert.match(region, /aria-busy=\{pending \|\| undefined\}/);
    assert.match(region, /data-workspace-view-heading/);
    assert.match(region, /focus\(/);
    assert.match(region, /navigationFocusOwnerRef/);
    assert.match(region, /closest\('\[data-testid\^="workspace-nav-"\]'/);
    assert.match(region, /currentRef\.current\?\.contains\(activeFocus\)/);
    assert.match(region, /resolvedViewKey/);
    assert.match(region, /resolveWorkspaceViewFocus/);
    assert.match(region, /isWorkspaceFocusStillOwned/);
  });

  it('uses APG manual activation: arrows move roving focus without committing a lane', async () => {
    const [today, tabs, e2e] = await Promise.all([
      read('views/today-view.tsx'),
      read('../../../shared/ui/animate-ui/primitives/radix/tabs.tsx'),
      readFile(new URL('../../../e2e/research-workspace-v3.spec.ts', import.meta.url), 'utf8'),
    ]);

    assert.doesNotMatch(today, /requestAnimationFrame/);
    assert.match(today, /activationMode="manual"/);
    assert.match(tabs, /type TabsProps = React\.ComponentProps<typeof TabsPrimitive\.Root>/);
    assert.match(tabs, /<TabsPrimitive\.Root[\s\S]*?\{\.\.\.props\}/);
    assert.doesNotMatch(today, /rovingIntent|rovingLane|onKeyDown|tabIndex|aria-selected/);
    assert.match(e2e, /supports APG keyboard navigation across feed lanes/);
    assert.match(e2e, /await expect\(tabs\.nth\(2\)\)\.toBeFocused\(\)/);
    assert.match(
      e2e,
      /await expect\(tabs\.first\(\)\)\.toHaveAttribute\('aria-selected', 'true'\)/,
    );
    assert.match(e2e, /await expect\(page\)\.not\.toHaveURL\(\/lane=explore\/\)/);
    assert.match(e2e, /await page\.keyboard\.press\('Enter'\)/);
  });

  it('exposes navigation progress in persistent chrome while keeping committed content authoritative', async () => {
    const [page, topbar] = await Promise.all([
      read('research-workspace-page.tsx'),
      read('../../../widgets/workspace-shell/ui/workspace-topbar.tsx'),
    ]);

    assert.match(page, /const viewNavigationPending =/);
    assert.match(topbar, /<output/);
    assert.match(topbar, /aria-live="polite"/);
    assert.match(topbar, /data-testid="workspace-navigation-status"/);
    assert.match(topbar, /여는 중/);
    assert.match(page, /pending=\{viewNavigationPending\}/);
  });

  it('does not let mobile-menu cleanup steal focus from the committed view heading', async () => {
    const region = await read('workspace-view-region.tsx');

    assert.match(region, /const activeFocus = document\.activeElement/);
    assert.match(region, /current\.contains\(activeFocus\)/);
    assert.match(region, /activeFocus === document\.body/);
  });
});
