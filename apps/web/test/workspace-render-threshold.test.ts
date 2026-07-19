import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const stocksViewUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.tsx',
  import.meta.url,
);
const cssUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.module.css',
  import.meta.url,
);
const stockReadModelUrl = new URL('../../api/src/stocks/read-model.ts', import.meta.url);

describe('workspace threshold-based rendering optimization', () => {
  it('enables row skipping only after the stock query can exceed 100 rows', async () => {
    const [view, css, readModel] = await Promise.all([
      readFile(stocksViewUrl, 'utf8'),
      readFile(cssUrl, 'utf8'),
      readFile(stockReadModelUrl, 'utf8'),
    ]);

    assert.match(readModel, /LIMIT 300/);
    assert.match(view, /stocks\.length > 100 \? styles\.deferredTableRow : undefined/);
    assert.match(css, /\.deferredTableRow\s*\{[\s\S]*?content-visibility:\s*auto/);
    assert.match(css, /contain-intrinsic-size:\s*auto 62px/);
    assert.match(css, /contain-intrinsic-size:\s*auto 246px/);
  });

  it('preserves the semantic table and does not introduce JavaScript row virtualization', async () => {
    const view = await readFile(stocksViewUrl, 'utf8');

    assert.match(view, /<table className=\{styles\.stockTable\}>/);
    assert.match(view, /<thead>/);
    assert.match(view, /<tbody>/);
    assert.doesNotMatch(view, /react-window|react-virtual|translateY\(|position:\s*absolute/);
  });
});
