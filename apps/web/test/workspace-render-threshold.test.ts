import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const stocksViewUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.tsx',
  import.meta.url,
);
const stockCssUrl = new URL(
  '../src/pages/research-workspace/ui/stock-deep-dive-panel.module.css',
  import.meta.url,
);
const stockReadModelUrl = new URL('../../api/src/stocks/read-model.ts', import.meta.url);

describe('workspace threshold-based rendering optimization', () => {
  it('enables row skipping only after the stock query can exceed 100 rows', async () => {
    const [view, stockCss, readModel] = await Promise.all([
      readFile(stocksViewUrl, 'utf8'),
      readFile(stockCssUrl, 'utf8'),
      readFile(stockReadModelUrl, 'utf8'),
    ]);

    assert.match(readModel, /LIMIT 300/);
    assert.match(view, /stocks\.length > 100 \? stockStyles\.deferredTableRow : undefined/);
    assert.match(stockCss, /\.deferredTableRow\s*\{[\s\S]*?content-visibility:\s*auto/);
    assert.match(stockCss, /contain-intrinsic-size:\s*auto 62px/);
    assert.match(stockCss, /\.stockTable\s*\{[\s\S]*?min-width:\s*720px/);
    assert.doesNotMatch(stockCss, /\.stockTable(?:\s*,|\s+tbody|\s+tr)\s*\{\s*display:\s*block/);
  });

  it('preserves the semantic table and does not introduce JavaScript row virtualization', async () => {
    const view = await readFile(stocksViewUrl, 'utf8');

    assert.match(view, /<DataTable/);
    assert.match(view, /className=\{stockStyles\.stockTable\}/);
    assert.match(view, /containerProps=\{\{/);
    assert.match(view, /<thead>/);
    assert.match(view, /<tbody>/);
    assert.doesNotMatch(view, /react-window|react-virtual|translateY\(|position:\s*absolute/);
  });
});
