import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);
const read = (path: string) => readFile(new URL(path, sourceRoot), 'utf8');

describe('2A-D product UI convergence', () => {
  it('keeps workspace search and selection on shared public UI', async () => {
    const [search, graph, stocks, stockSections] = await Promise.all([
      read('pages/research-workspace/ui/workspace-search.tsx'),
      read('pages/research-workspace/ui/relation-sigma-graph.tsx'),
      read('pages/research-workspace/ui/views/stocks-view.tsx'),
      read('pages/research-workspace/ui/stock-briefing-sections.tsx'),
    ]);

    assert.match(search, /from '@\/shared\/ui\/input'/);
    assert.match(search, /<SearchField/);
    assert.match(graph, /from '@\/shared\/ui\/combobox'/);
    assert.match(graph, /<Combobox/);
    assert.match(stockSections, /<Button/);
    assert.match(stockSections, /aria-current=\{selected \? 'true' : undefined\}/);
    assert.doesNotMatch(`${search}\n${graph}\n${stocks}\n${stockSections}`, /<(?:input|select)\b/);
  });

  it('keeps stock layout and interaction states in one owning stylesheet', async () => {
    const [pageCss, stockCss, briefingCss] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.module.css'),
      read('pages/research-workspace/ui/stock-deep-dive-panel.module.css'),
      read('pages/research-workspace/ui/views/stocks-view.module.css'),
    ]);

    assert.doesNotMatch(pageCss, /\.(?:stocksWorkspace|deepDiveRegion|stockTable|tableWrap)\b/);
    for (const selector of ['.stocksWorkspace', '.deepDiveRegion:focus-visible']) {
      assert.match(stockCss, new RegExp(selector.replaceAll('.', '\\.')));
    }
    assert.match(briefingCss, /\.briefingColumns/);
    assert.match(briefingCss, /\.stockRow\[data-slot='button-control'\]\[aria-current='true'\]/);
  });

  it('removes showcase copy and keeps compact logout behavior', async () => {
    const [shell, topbar, pageHeader, views] = await Promise.all([
      read('widgets/workspace-shell/ui/workspace-shell.tsx'),
      read('widgets/workspace-shell/ui/workspace-topbar.tsx'),
      read('shared/ui/workspace/page-header.tsx'),
      Promise.all([
        read('pages/research-workspace/ui/views/crypto-workspace-view.tsx'),
        read('pages/research-workspace/ui/views/today-view.tsx'),
        read('pages/research-workspace/ui/views/themes-view.tsx'),
        read('pages/research-workspace/ui/views/my-research-view.tsx'),
      ]).then((sources) => sources.join('\n')),
    ]);

    assert.doesNotMatch(shell, /Research workspace/);
    assert.match(topbar, /<WorkspaceLogoutAction compact/);
    assert.match(topbar, /<IconButton[\s\S]*?aria-label="로그아웃"/);
    assert.doesNotMatch(topbar, /ChevronRight|리서치 워크스페이스/);
    assert.match(pageHeader, /eyebrow\?: string/);
    assert.match(pageHeader, /description\?: string/);
    assert.doesNotMatch(
      views,
      /eyebrow=|Crypto × Equity|Canonical identity|Cross-domain graph|Truth ledger|Impact chain|Read-only boundary|출처 revision/,
    );
  });

  it('does not invent product usage for UI Lab-only controls', async () => {
    const productSources = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('pages/research-workspace/ui/views/stocks-view.tsx'),
      read('pages/research-workspace/ui/views/today-view.tsx'),
      read('widgets/workspace-shell/ui/workspace-shell.tsx'),
    ]).then((sources) => sources.join('\n'));

    assert.doesNotMatch(
      productSources,
      /@\/shared\/ui\/(?:radio-group|slider|date-picker|file-upload|otp|split-button)/,
    );
  });
});
