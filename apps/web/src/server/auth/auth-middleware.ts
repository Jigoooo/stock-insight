import { createMiddleware } from '@tanstack/react-start';

import { isSameOriginRequest } from './csrf-origin.ts';

const unauthorizedBody = JSON.stringify({
  error: {
    code: 'UNAUTHORIZED',
    message: '로그인이 필요합니다.',
  },
});

const forbiddenOriginBody = JSON.stringify({
  error: {
    code: 'FORBIDDEN_ORIGIN',
    message: '허용되지 않은 요청 출처입니다.',
  },
});

export const authFunctionMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const [{ getRequestHeader, setResponseHeader, setResponseStatus }, { readBoundSession }] =
      await Promise.all([import('@tanstack/react-start/server'), import('./auth-runtime.ts')]);
    const session = await readBoundSession(getRequestHeader('cookie'));
    if (!session) {
      setResponseStatus(401);
      setResponseHeader('Cache-Control', 'no-store');
      throw new Error('Unauthorized');
    }
    return next({ context: { session } });
  },
);

export const authRequestMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    const { getAuthenticationOrigin, readBoundSession } = await import('./auth-runtime.ts');
    const session = await readBoundSession(request.headers.get('cookie'));
    if (!session) {
      return new Response(unauthorizedBody, {
        status: 401,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }
    if (
      !isSameOriginRequest(
        request.method,
        request.headers.get('origin'),
        await getAuthenticationOrigin(),
      )
    ) {
      return new Response(forbiddenOriginBody, {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }
    return next({ context: { session } });
  },
);
