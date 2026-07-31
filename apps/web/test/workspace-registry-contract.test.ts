import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace registry source', () => {
  it('keeps Animate UI source local and attributed', async () => {
    for (const name of ['sidebar', 'sheet', 'tabs', 'tooltip', 'accordion', 'popover']) {
      const source = await read(`shared/ui/animate-ui/components/radix/${name}.tsx`);
      assert.match(source, /Upstream: https:\/\/animate-ui\.com\//);
      assert.match(source, /Registry item: @animate-ui\//);
    }
  });

  it('keeps registry state styling out of page CSS', async () => {
    const pageCss = await read(
      'pages/research-workspace/ui/research-workspace-page.module.css',
    );
    assert.doesNotMatch(pageCss, /data-\[state=|focus-visible:ring-|whileHover|whileTap/);
  });
});
