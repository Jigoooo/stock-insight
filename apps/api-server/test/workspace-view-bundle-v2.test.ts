import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const sourceUrl = new URL('../src/read/research-workspace.controller.ts', import.meta.url);

describe('workspace view bundle V2 controller', () => {
  it('exposes one snapshot-backed endpoint with bounded view parameters', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    assert.match(source, /@Get\('workspace\/views\/:view'\)/);
    assert.match(source, /workspaceReadViewSchema\.safeParse\(viewRaw\)/);
    assert.match(source, /parseWorkspaceViewBundleQuery/);
    assert.match(source, /withSnapshot\(\(executor\)\s*=>\s*getWorkspaceViewBundleV2/);
  });

  it('keeps aggregate detail reads inside one request snapshot', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    assert.match(source, /@Get\('entities\/:entityKey\/briefing'\)/);
    assert.match(source, /getEntityBriefingV2\(executor/);
    assert.match(source, /@Get\('records\/:recordKey\/briefing'\)/);
    assert.match(source, /getRecordBriefingV2\(executor/);
  });
});
