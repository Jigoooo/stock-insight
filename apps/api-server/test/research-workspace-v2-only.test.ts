import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controllerUrl = new URL('../src/read/research-workspace.controller.ts', import.meta.url);

test('relation endpoint is V2-only and cannot call the legacy read model', async () => {
  const source = await readFile(controllerUrl, 'utf8');

  assert.match(source, /getEntityRelationsWithV2Preference/);
  assert.doesNotMatch(source, /\bgetEntityRelations\s*\(/);
  assert.match(source, /result\.graph/);
});
