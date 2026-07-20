import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const controllerUrl = new URL('../src/read/research-workspace.controller.ts', import.meta.url);

describe('independent research API snapshot contract', () => {
  it('validates and forwards one run/revision pair for record and relation reads', async () => {
    const source = await readFile(controllerUrl, 'utf8');

    assert.match(source, /function parseSnapshot\(/);
    assert.match(source, /\(analysisRunId === undefined\) !== \(rawRevision === undefined\)/);
    assert.match(source, /analysisRunId\.trim\(\)\.length < 1/);
    assert.match(source, /rawRevision\.trim\(\)\.length < 1/);
    assert.match(source, /@Query\('analysisRunId'\) analysisRunIdRaw/);
    assert.match(source, /@Query\('analysisRevision'\) analysisRevisionRaw/);
    assert.match(
      source,
      /getResearchRecordDetail\(executor, \{ userScope, recordKey, snapshot \}\)/,
    );
    assert.match(
      source,
      /getEntityRelations\(executor, \{ userScope, entityKey, depth, snapshot \}\)/,
    );
  });
});
