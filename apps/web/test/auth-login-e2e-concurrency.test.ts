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
});
