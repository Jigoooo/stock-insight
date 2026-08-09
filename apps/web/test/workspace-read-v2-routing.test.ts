import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace V2 BFF routing', () => {
  it('uses one brain request when the V2 server flag is enabled and preserves legacy fallback', async () => {
    const source = await read('server/research-workspace.ts');
    assert.match(source, /STOCK_INSIGHT_WORKSPACE_READ_V2/);
    assert.match(source, /\/v1\/workspace\/views\/\$\{options\.view\}/);
    assert.match(source, /orchestrateResearchWorkspaceView/);
    assert.match(source, /legacy|v2/);
  });
});
