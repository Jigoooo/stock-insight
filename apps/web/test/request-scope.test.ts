import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '../src/server/request-scope.ts';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('per-request user scope resolution', () => {
  it('returns the verified session subject from the request cookie', async () => {
    const readBoundSession = mock.fn(async (_cookie: string | null) => ({
      version: 1 as const,
      sub: USER_ID,
      username: 'alice',
      iat: 1,
      exp: 2,
    }));
    const request = new Request('https://x/api/workspace', {
      headers: { cookie: '__Host-stock-insight-session=token' },
    });
    const userId = await resolveRequestUserId(request, readBoundSession);
    assert.equal(userId, USER_ID);
    assert.equal(readBoundSession.mock.callCount(), 1);
    assert.equal(
      readBoundSession.mock.calls[0]!.arguments[0],
      '__Host-stock-insight-session=token',
    );
  });

  it('throws a fail-closed RequestScopeError when there is no valid session', async () => {
    const readBoundSession = mock.fn(async () => undefined);
    const request = new Request('https://x/api/workspace');
    await assert.rejects(resolveRequestUserId(request, readBoundSession), (error: unknown) => {
      assert.ok(error instanceof RequestScopeError);
      assert.equal(error.status, 401);
      return true;
    });
  });

  it('never trusts a userId query parameter over the session subject', async () => {
    const readBoundSession = mock.fn(async () => ({
      version: 1 as const,
      sub: USER_ID,
      username: 'alice',
      iat: 1,
      exp: 2,
    }));
    const request = new Request(
      'https://x/api/workspace?userId=99999999-9999-4999-8999-999999999999',
    );
    const userId = await resolveRequestUserId(request, readBoundSession);
    assert.equal(userId, USER_ID);
  });

  it('renders a no-store 401 JSON response for an unauthorized scope', async () => {
    const response = unauthorizedScopeResponse();
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = (await response.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, 'UNAUTHORIZED');
  });
});
