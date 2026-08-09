import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace read request budgets', () => {
  it('uses one BFF-to-brain request for every canonical V2 initial view', async () => {
    const source = await read('server/research-workspace.ts');
    const v2Branch = source.slice(
      source.indexOf("if (resolveWorkspaceReadMode() === 'v2')"),
      source.indexOf('const loaders = {'),
    );
    assert.equal((v2Branch.match(/brainRequest\(/g) ?? []).length, 1);
    assert.match(v2Branch, /\/v1\/workspace\/views\/\$\{options\.view\}/);
    assert.match(source, /ResearchWorkspaceViewOptions/);
  });

  it('keeps cursor pagination on one list request without another shell read', async () => {
    const source = await read('pages/research-workspace/ui/research-workspace-page.tsx');
    assert.match(source, /api\.researchFeed\(\{ lane, cursor, limit: 20 \}\)/);
    assert.match(source, /api\.radarSignals\(\{ cursor, limit: 30 \}\)/);
    assert.match(source, /api\.decisionHistory\(\{ cursor, limit: 30 \}\)/);
    const paginationBody = source.slice(source.indexOf('const loadMoreRadar'));
    assert.doesNotMatch(paginationBody, /loadResearchWorkspaceShell|workspace\/shell/);
  });

  it('opens every network-backed detail with one aggregate request', async () => {
    const [page, stocks, market] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('pages/research-workspace/ui/views/stocks-view.tsx'),
      read('pages/research-workspace/ui/views/market-connections-view.tsx'),
    ]);
    assert.equal((page.match(/api\.recordBriefing\(/g) ?? []).length, 1);
    assert.equal((stocks.match(/api\.entityBriefing\(/g) ?? []).length, 1);
    assert.equal((market.match(/api\.entityBriefing\(/g) ?? []).length, 1);
    assert.doesNotMatch(stocks, /api\.(?:stockDetail|entityRelations|impactBrief)\(/);
    assert.doesNotMatch(market, /api\.(?:entityRelations|impactBrief)\(/);
  });

  it('keeps presentation-only inspector transitions free of loaders', async () => {
    for (const path of [
      'pages/research-workspace/ui/evidence-inspector.tsx',
      'pages/research-workspace/ui/stock-briefing-inspector.tsx',
      'pages/research-workspace/ui/market-connection-inspector.tsx',
      'pages/research-workspace/ui/history-briefing-inspector.tsx',
      'pages/research-workspace/ui/reliability-inspector.tsx',
    ]) {
      const source = await read(path);
      assert.doesNotMatch(source, /createApiClient|brainRequest|fetch\(/, path);
    }
  });
});
