import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace compositions', () => {
  it('preserves native data semantics', async () => {
    assert.match(await read('shared/ui/workspace/metric-strip.tsx'), /<dl/);
    assert.match(await read('shared/ui/workspace/property-list.tsx'), /<dl/);
    assert.match(await read('shared/ui/workspace/data-table.tsx'), /<Table/);
    assert.match(await read('shared/ui/workspace/structured-list.tsx'), /<ul/);
    assert.match(await read('shared/ui/workspace/timeline.tsx'), /<ol/);
  });

  it('owns shared visual states outside route CSS', async () => {
    const state = await read('shared/ui/workspace/workspace-state.tsx');
    const pageCss = await read('pages/research-workspace/ui/research-workspace-page.module.css');
    assert.match(state, /loading.*empty.*error.*stale.*partial.*unavailable/s);
    assert.doesNotMatch(pageCss, /\.panel\s*\{|\.pageHeader\s*\{|\.stateSurface\s*\{/);
  });
});
