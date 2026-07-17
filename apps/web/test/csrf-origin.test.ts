import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSameOriginRequest } from '../src/server/auth/csrf-origin.ts';

describe('authentication same-origin boundary', () => {
  it('allows safe methods without an Origin header', () => {
    assert.equal(isSameOriginRequest('GET', null, 'https://stock.jigooo.com'), true);
    assert.equal(isSameOriginRequest('HEAD', null, 'https://stock.jigooo.com'), true);
  });

  it('allows a non-GET request only from the exact configured origin', () => {
    assert.equal(
      isSameOriginRequest('POST', 'https://stock.jigooo.com', 'https://stock.jigooo.com'),
      true,
    );
    assert.equal(
      isSameOriginRequest('POST', 'http://127.0.0.1:8092', 'http://127.0.0.1:8092'),
      true,
    );
  });

  for (const origin of [
    null,
    'http://stock.jigooo.com',
    'https://evil.stock.jigooo.com',
    'https://stock.jigooo.com:444',
    'not-a-url',
  ]) {
    it('rejects missing, malformed, or non-matching mutation origins', () => {
      assert.equal(isSameOriginRequest('POST', origin, 'https://stock.jigooo.com'), false);
    });
  }
});
