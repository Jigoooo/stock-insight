import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('brain request failures identify the internal path without exposing the target URL', async () => {
  const source = await readFile(new URL('../src/server/brain-client.ts', import.meta.url), 'utf8');

  assert.match(source, /Brain request failed \(\$\{response\.status\}\) for \$\{signedPath\}/);
  assert.doesNotMatch(source, /Brain request failed \([^\n]+\) for \$\{url\}/);
});
