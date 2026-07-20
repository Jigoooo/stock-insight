import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtimeFiles = [
  '../src/status/read-model.ts',
  '../src/themes/read-model.ts',
  '../src/workspace/read-model.ts',
] as const;

test('P0-5 runtime status, themes, and workspace are V2 graph-only', async () => {
  for (const relativePath of runtimeFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /ops\.current_temporal_graph_edge/, relativePath);
    assert.match(source, /analytics\.graph_snapshot/, relativePath);
  }
});

test('P0-5 public API cannot import the legacy relation read model', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /export \{ getEntityRelations \}/);
  assert.doesNotMatch(source, /GetEntityRelationsOptions/);
  assert.match(source, /getEntityRelationsWithV2Preference/);
});
