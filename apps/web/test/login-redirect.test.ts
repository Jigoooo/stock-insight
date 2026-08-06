import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeLoginRedirect } from '../src/server/auth/login-redirect.ts';

describe('login redirect sanitization', () => {
  it('keeps only an internal absolute path', () => {
    assert.equal(
      sanitizeLoginRedirect('/workspace/stocks?selected=US%3ANVDA'),
      '/workspace/stocks?selected=US%3ANVDA',
    );
  });

  it('sends workspace entry redirects straight to the default view', () => {
    assert.equal(sanitizeLoginRedirect('/'), '/workspace/today');
    assert.equal(sanitizeLoginRedirect('/workspace'), '/workspace/today');
  });

  for (const candidate of [
    undefined,
    '',
    'workspace',
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    '/login',
    '/login?redirect=/login',
  ]) {
    it('falls back to the current dashboard for unsafe or looping redirects', () => {
      assert.equal(sanitizeLoginRedirect(candidate), '/workspace/today');
    });
  }
});
