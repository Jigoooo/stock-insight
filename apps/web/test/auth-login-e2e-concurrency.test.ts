import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const authSpecUrl = new URL('../../../e2e/auth-login.spec.ts', import.meta.url);

describe('credentialed auth E2E concurrency', () => {
  it('serializes login tests within each browser project', async () => {
    const source = await readFile(authSpecUrl, 'utf8');
    assert.match(
      source,
      /test\.describe\('private workspace authentication',[\s\S]{0,160}test\.describe\.configure\(\{\s*mode:\s*'serial'\s*\}\)/,
    );
  });

  it('uses a retry-scoped client identity for every auth test', async () => {
    const source = await readFile(authSpecUrl, 'utf8');
    assert.match(source, /testInfo\.testId/);
    assert.match(source, /testInfo\.retry/);
    assert.match(source, /cf-connecting-ip['"]?:\s*authClientIp\(testInfo\)/);
    assert.doesNotMatch(source, /project\.name\s*===\s*'mobile'\s*\?\s*'2001:db8::2'/);
  });
});
