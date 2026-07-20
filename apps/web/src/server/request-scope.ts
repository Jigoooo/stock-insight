import '@tanstack/react-start/server-only';

import type { SessionClaims } from './auth/session-core.ts';

// Thrown when a private request has no valid authenticated session. Handlers
// translate this into a fail-closed 401 without leaking user existence.
export class RequestScopeError extends Error {
  readonly status: number;
  constructor(message = 'Unauthorized', status = 401) {
    super(message);
    this.name = 'RequestScopeError';
    this.status = status;
  }
}

type SessionReader = (
  cookieHeader: string | null | undefined,
) => Promise<SessionClaims | undefined>;

async function defaultSessionReader(
  cookieHeader: string | null | undefined,
): Promise<SessionClaims | undefined> {
  const { readBoundSession } = await import('./auth/auth-runtime.ts');
  return readBoundSession(cookieHeader);
}

// Resolve the server-owned user scope for a request purely from its signed
// session cookie. A userId query/body parameter is never consulted, so a caller
// cannot request another user's data. Missing/invalid sessions fail closed.
export async function resolveRequestUserId(
  request: Request,
  readSession: SessionReader = defaultSessionReader,
): Promise<string> {
  const session = await readSession(request.headers.get('cookie'));
  if (!session) throw new RequestScopeError();
  return session.sub;
}

const unauthorizedBody = JSON.stringify({
  error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
});

// Fail-closed 401 for a request without a valid authenticated scope. Matches the
// shape emitted by authRequestMiddleware so clients see one consistent contract.
export function unauthorizedScopeResponse(): Response {
  return new Response(unauthorizedBody, {
    status: 401,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
