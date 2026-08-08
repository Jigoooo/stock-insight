import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const inspectorUrl = new URL(
  '../src/pages/research-workspace/ui/stock-briefing-inspector.tsx',
  import.meta.url,
);

describe('stock briefing rendered feedback accessibility', () => {
  it('uses the shared status and error feedback regions for loading and failure', async () => {
    const source = await readFile(inspectorUrl, 'utf8');

    assert.match(source, /state === 'loading'[\s\S]*?<WorkspaceState/);
    assert.match(source, /kind="loading"/);
    assert.match(source, /state === 'error'[\s\S]*?<WorkspaceState/);
    assert.match(source, /kind="error"/);
    assert.match(source, /action=\{/);
    assert.match(source, /다시 불러오기/);
  });

  it('labels the ready briefing sections and uses semantic lists', async () => {
    const source = await readFile(inspectorUrl, 'utf8');

    assert.match(source, /state === 'ready' && detail/);
    assert.match(source, /aria-labelledby="stock-inspector-summary"/);
    assert.match(source, /aria-labelledby="stock-inspector-news"/);
    assert.match(source, /<StructuredList/);
    assert.match(source, /<time dateTime=/);
  });
});
