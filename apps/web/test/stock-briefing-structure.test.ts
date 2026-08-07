import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  stocksBriefingPreviewFixture,
  stocksPreviewFixture,
} from '../src/pages/dev-preview/model/stocks-preview-fixture.ts';

const visibilityModelUrl = new URL(
  '../src/pages/research-workspace/ui/stock-briefing-sections-model.ts',
  import.meta.url,
);
const sectionsUrl = new URL(
  '../src/pages/research-workspace/ui/stock-briefing-sections.tsx',
  import.meta.url,
);
const stocksViewUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.tsx',
  import.meta.url,
);
const stocksStylesUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.module.css',
  import.meta.url,
);
const workspacePageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);
const previewPageUrl = new URL('../src/pages/dev-preview/ui/dev-preview-page.tsx', import.meta.url);

async function loadVisibilityModel() {
  return import(visibilityModelUrl.href).catch(() => null);
}

describe('stock briefing view structure', () => {
  it('filters all briefing lanes by the searched entity keys and reveals watched non-holdings only on demand', async () => {
    const visibilityModel = await loadVisibilityModel();
    assert.ok(visibilityModel, 'stock briefing visibility model must exist');
    assert.equal(typeof visibilityModel.selectVisibleStockBriefing, 'function');

    const filteredStocks = stocksPreviewFixture.stocks.data.filter(({ entityKey }) =>
      ['KR:005930', 'KR:005380', 'US:NVDA', 'US:MSFT'].includes(entityKey),
    );
    const changedOnly = visibilityModel.selectVisibleStockBriefing(
      stocksBriefingPreviewFixture,
      filteredStocks,
      false,
    );
    const allWatched = visibilityModel.selectVisibleStockBriefing(
      stocksBriefingPreviewFixture,
      filteredStocks,
      true,
    );

    assert.deepEqual(
      changedOnly.priorityHoldings.map(({ stock }) => stock.entityKey),
      ['KR:005930'],
    );
    assert.deepEqual(
      changedOnly.holdings.map(({ entityKey }) => entityKey),
      ['KR:005930', 'KR:005380'],
    );
    assert.deepEqual(
      changedOnly.watchlist.map(({ stock }) => stock.entityKey),
      ['US:NVDA'],
    );
    assert.deepEqual(
      allWatched.watchlist.map(({ stock }) => stock.entityKey),
      ['US:NVDA', 'US:MSFT'],
    );
    assert.equal(allWatched.watchlist[1]?.briefing, undefined);
  });

  it('caps priority holdings at three and never admits a non-holding into that lane', async () => {
    const visibilityModel = await loadVisibilityModel();
    assert.ok(visibilityModel, 'stock briefing visibility model must exist');

    const rows = stocksPreviewFixture.stocks.data;
    const model = {
      ...stocksBriefingPreviewFixture,
      priorityHoldings: [
        ...stocksBriefingPreviewFixture.priorityHoldings,
        {
          entityKey: 'KR:005380',
          changeSummary: '추가 보유 변화',
          connectionReason: '추가 보유 연결',
          newsCount: 1,
        },
        {
          entityKey: 'US:NVDA',
          changeSummary: '비보유 변화',
          connectionReason: '비보유 연결',
          newsCount: 1,
        },
      ],
    };
    const result = visibilityModel.selectVisibleStockBriefing(model, rows, false);

    assert.deepEqual(
      result.priorityHoldings.map(({ stock }) => stock.entityKey),
      ['KR:005930', 'KR:000660', 'KR:035420'],
    );
  });

  it('wires the unfiltered aggregate model into the page and the complete fixture into preview', async () => {
    const [page, preview] = await Promise.all([
      readFile(workspacePageUrl, 'utf8'),
      readFile(previewPageUrl, 'utf8'),
    ]);

    assert.match(page, /stocksBriefing\?: StocksBriefingModel/);
    assert.match(page, /stocksBriefing \?\? buildStocksBriefingModel\(data\.stocks\)/);
    assert.match(page, /briefing=\{resolvedStocksBriefing\}/);
    assert.match(preview, /stocksBriefingPreviewFixture/);
    assert.match(preview, /stocksBriefing=\{stocksBriefingPreviewFixture\}/);
  });

  it('renders summary, priority, holdings, watchlist, and honest unavailable states without a data table', async () => {
    const [view, sections] = await Promise.all([
      readFile(stocksViewUrl, 'utf8'),
      readFile(sectionsUrl, 'utf8').catch(() => ''),
    ]);
    const source = `${view}\n${sections}`;

    assert.match(source, /내 종목 브리핑/);
    assert.match(source, /우선 확인할 보유종목/);
    assert.match(source, /전체 보유종목/);
    assert.match(source, /변화가 있는 관심종목/);
    assert.match(source, /전체 관심종목 보기/);
    assert.match(source, /관심종목 접기/);
    assert.match(source, /집계 데이터 없음/);
    assert.match(source, /조건에 맞는 종목이 없습니다/);
    assert.match(view, /paginateStockRows\(visible\.holdings, currentPage\)/);
    assert.doesNotMatch(source, /<DataTable|<TableRow|TableSelectionHead/);
  });

  it('uses one aria-current selected surface and stacks all sections at 1240px', async () => {
    const [view, sections, css] = await Promise.all([
      readFile(stocksViewUrl, 'utf8'),
      readFile(sectionsUrl, 'utf8').catch(() => ''),
      readFile(stocksStylesUrl, 'utf8').catch(() => ''),
    ]);
    const source = `${view}\n${sections}`;

    assert.match(view, /selectedStockKey/);
    assert.match(source, /aria-current=\{selected \? 'true' : undefined\}/);
    assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    assert.match(
      css,
      /@media \(max-width: 1240px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    assert.match(
      css,
      /\.stockRow\[data-slot='button-control'\]\[aria-current='true'\]\s*\{[\s\S]*?border-color:[\s\S]*?background:[\s\S]*?box-shadow:/,
    );
    assert.doesNotMatch(
      css,
      /\.stockRow\[data-slot='button-control'\]\[aria-current='true'\][\s\S]{0,320}?border-left/,
    );
  });
});
