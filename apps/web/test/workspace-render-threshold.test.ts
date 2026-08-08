import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  paginateStockRows,
  STOCK_TABLE_PAGE_SIZE,
} from '../src/pages/research-workspace/model/stock-table-pagination.ts';

const stocksViewUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.tsx',
  import.meta.url,
);
const stockCssUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.module.css',
  import.meta.url,
);
const stockReadModelUrl = new URL('../../api/src/stocks/read-model.ts', import.meta.url);

describe('workspace stock table pagination', () => {
  it('keeps the 300-row read model but renders one bounded semantic page', async () => {
    const [view, stockCss, readModel] = await Promise.all([
      readFile(stocksViewUrl, 'utf8'),
      readFile(stockCssUrl, 'utf8'),
      readFile(stockReadModelUrl, 'utf8'),
    ]);

    assert.match(readModel, /LIMIT 300/);
    assert.match(view, /paginateStockRows\(visible\.holdings, currentPage\)/);
    assert.match(
      view,
      /if \(pageRows !== stocks\) \{\s*setPageRows\(stocks\);\s*setCurrentPage\(1\);\s*\}/,
    );
    assert.match(view, /items=\{page\.items\}/);
    assert.match(view, /<Pagination/);
    assert.match(stockCss, /\.stockRow\[data-slot='button-control'\]/);
    assert.doesNotMatch(stockCss, /position:\s*absolute/);
  });

  it('clamps pages and exposes at most one page of rows', () => {
    const rows = Array.from({ length: 123 }, (_, index) => index);
    const first = paginateStockRows(rows, 1);
    const last = paginateStockRows(rows, 99);

    assert.equal(STOCK_TABLE_PAGE_SIZE, 50);
    assert.equal(first.items.length, 50);
    assert.equal(last.currentPage, 3);
    assert.deepEqual(last.items, rows.slice(100));
  });

  it('renders selectable rows without a data table or JavaScript row virtualization', async () => {
    const view = await readFile(stocksViewUrl, 'utf8');

    assert.match(view, /<HoldingRows/);
    assert.doesNotMatch(view, /<DataTable|<TableRow|<thead>|<tbody>/);
    assert.doesNotMatch(view, /react-window|react-virtual|translateY\(|position:\s*absolute/);
  });
});
