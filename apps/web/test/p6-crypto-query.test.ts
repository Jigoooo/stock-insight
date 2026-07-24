import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCryptoWorkspaceQuery } from '../src/pages/research-workspace/model/crypto-query.ts';
import { createCryptoWorkspaceGetHandler } from '../src/server/crypto-workspace-request-handler.ts';
import { jsonResponse } from '../src/server/http.ts';

describe('P6 crypto workspace HTTP query boundary', () => {
  it('parses the exact PIT timestamp and integer limit', () => {
    const result = parseCryptoWorkspaceQuery(
      new URL(
        'https://stock-insight.invalid/api/v1/crypto/workspace?knownAt=2026-07-23T00%3A00%3A00.000Z&limit=40',
      ),
    );
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.knownAt.toISOString(), '2026-07-23T00:00:00.000Z');
    assert.equal(result.limit, 40);
  });

  it('rejects unknown, duplicate, empty, exponent, decimal, and out-of-range inputs', () => {
    for (const query of [
      '?knownAT=2026-07-23T00%3A00%3A00.000Z',
      '?typo=1',
      '?limit=40&limit=41',
      '?knownAt=2026-07-23T00%3A00%3A00.000Z&knownAt=2026-07-24T00%3A00%3A00.000Z',
      '?knownAt=',
      '?knownAt=2026-07-23',
      '?limit=',
      '?limit=01',
      '?limit=1e2',
      '?limit=40.5',
      '?limit=101',
    ]) {
      assert.deepEqual(
        parseCryptoWorkspaceQuery(
          new URL(`https://stock-insight.invalid/api/v1/crypto/workspace${query}`),
        ),
        { success: false },
        query,
      );
    }
  });

  it('sets no-store on success and error JSON responses', async () => {
    for (const response of [
      jsonResponse({ ok: true }),
      jsonResponse({ error: 'invalid_query' }, { status: 400 }),
    ]) {
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
      await response.text();
    }
  });
});

describe('P6 crypto workspace GET handler', () => {
  it('returns 400 before auth for unknown or duplicate query parameters', async () => {
    let authCalls = 0;
    const handler = createCryptoWorkspaceGetHandler({
      resolveUserId: async () => {
        authCalls += 1;
        return 'user-1';
      },
      loadWorkspace: async () => ({ ok: true }),
      isRequestScopeError: () => false,
      unauthorizedResponse: () => jsonResponse({ error: 'unauthorized' }, { status: 401 }),
    });
    for (const query of ['?typo=1', '?limit=40&limit=41']) {
      const response = await handler({
        request: new Request(`https://stock-insight.invalid/api/v1/crypto/workspace${query}`),
      });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'invalid_query' });
    }
    assert.equal(authCalls, 0);
  });

  it('passes exact PIT options to the read-only loader and returns no-store JSON', async () => {
    const calls: unknown[] = [];
    const handler = createCryptoWorkspaceGetHandler({
      resolveUserId: async () => 'user-1',
      loadWorkspace: async (userId, options) => {
        calls.push({ userId, knownAt: options.knownAt.toISOString(), limit: options.limit });
        return { schemaVersion: 'p6.v1', readOnly: true, orderExecutable: false };
      },
      isRequestScopeError: () => false,
      unauthorizedResponse: () => jsonResponse({ error: 'unauthorized' }, { status: 401 }),
    });
    const response = await handler({
      request: new Request(
        'https://stock-insight.invalid/api/v1/crypto/workspace?knownAt=2026-07-23T00%3A00%3A00.000Z&limit=40',
      ),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(calls, [{ userId: 'user-1', knownAt: '2026-07-23T00:00:00.000Z', limit: 40 }]);
    assert.deepEqual(await response.json(), {
      schemaVersion: 'p6.v1',
      readOnly: true,
      orderExecutable: false,
    });
  });

  it('maps request-scope failures to a no-store 401', async () => {
    const scopeError = new Error('scope');
    const handler = createCryptoWorkspaceGetHandler({
      resolveUserId: async () => {
        throw scopeError;
      },
      loadWorkspace: async () => ({ ok: true }),
      isRequestScopeError: (error) => error === scopeError,
      unauthorizedResponse: () => jsonResponse({ error: 'unauthorized' }, { status: 401 }),
    });
    const response = await handler({
      request: new Request('https://stock-insight.invalid/api/v1/crypto/workspace'),
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
