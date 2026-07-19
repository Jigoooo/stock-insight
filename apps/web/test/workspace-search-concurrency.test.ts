import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';

import { filterWorkspaceStocks } from '../src/pages/research-workspace/model/workspace-search-filter.ts';
import type { StockListResponse } from '@stock-insight/contracts';

const sourceUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-search.tsx',
  import.meta.url,
);
const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);
const stocksViewUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.tsx',
  import.meta.url,
);

type Stock = StockListResponse['data'][number];

function stock(index: number): Stock {
  return {
    analysisStatus: 'none',
    currency: index % 2 === 0 ? 'KRW' : 'USD',
    displayName: index % 100 === 0 ? `삼성 전자 ${index}` : `Synthetic Company ${index}`,
    entityKey: `stock-${index}`,
    isHolding: false,
    isWatched: false,
    market: index % 2 === 0 ? 'KR' : 'US',
    name: index % 100 === 0 ? `Samsung Electronics ${index}` : `Synthetic Company ${index}`,
    ticker: index % 100 === 0 ? `005930-${index}` : `SYN${index}`,
  };
}

describe('workspace search concurrency', () => {
  it('keeps the controlled value urgent and derives only result work from useDeferredValue', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /useDeferredValue\(query\)/);
    assert.match(source, /onChange:\s*\(event\) => onQueryChange\(event\.target\.value\)/);
    assert.match(source, /const pending = query !== deferredQuery/);
    assert.match(source, /data-pending=\{pending \|\| undefined\}/);
    assert.match(source, /aria-busy=\{pending \|\| undefined\}/);
    assert.doesNotMatch(source, /startTransition\([\s\S]*onQueryChange/);
  });

  it('normalizes settled filtering across display name and ticker without mutating input', () => {
    const rows = [stock(0), stock(1), stock(100)];

    assert.deepEqual(
      filterWorkspaceStocks(rows, '  삼성  ').map((row) => row.entityKey),
      ['stock-0', 'stock-100'],
    );
    assert.deepEqual(
      filterWorkspaceStocks(rows, 'syn1').map((row) => row.entityKey),
      ['stock-1'],
    );
    assert.deepEqual(filterWorkspaceStocks(rows, ''), rows);
    assert.equal(rows.length, 3);
  });

  it('benchmarks 100, 1,000, and 10,000 synthetic rows below the no-virtualization filter budget', () => {
    for (const size of [100, 1_000, 10_000]) {
      const rows = Array.from({ length: size }, (_, index) => stock(index));
      const startedAt = performance.now();
      const result = filterWorkspaceStocks(rows, '005930');
      const elapsed = performance.now() - startedAt;

      assert.equal(result.length, Math.ceil(size / 100));
      assert.equal(elapsed < 1_000, true, `${size} rows took ${elapsed.toFixed(1)}ms`);
    }
  });

  it('keeps old rows authoritative while deferred results are pending and settles empty afterward', async () => {
    const [page, stocksView] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(stocksViewUrl, 'utf8'),
    ]);

    assert.match(page, /useDeferredWorkspaceSearch\(query\)/);
    assert.match(
      page,
      /data\.view === 'stocks' \? filterWorkspaceStocks\(data\.stocks\.data, deferredQuery\) : \[\]/,
    );
    assert.match(page, /<WorkspaceSearch/);
    assert.doesNotMatch(page, /const normalizedQuery = query/);
    assert.match(stocksView, /pending:\s*boolean/);
    assert.match(stocksView, /data-pending=\{pending \|\| undefined\}/);
    assert.match(stocksView, /aria-busy=\{pending \|\| undefined\}/);
    assert.match(stocksView, /!pending && stocks\.length === 0/);
  });
});
