import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('P6 crypto compatibility boundary', () => {
  it('keeps the authenticated read-only API while retiring the user workspace surface', async () => {
    const [route, facade] = await Promise.all([
      read('routes/api/v1/crypto/workspace.ts'),
      read('server/research-workspace.ts'),
    ]);

    assert.match(route, /createFileRoute\('\/api\/v1\/crypto\/workspace'\)/);
    assert.match(route, /resolveRequestUserId/);
    assert.match(route, /loadCryptoResearchWorkspace/);
    assert.match(route, /GET: createCryptoWorkspaceGetHandler\(\{/);
    assert.doesNotMatch(route, /POST|PUT|PATCH|DELETE/);
    assert.match(facade, /export async function loadCryptoResearchWorkspace/);
  });
});
