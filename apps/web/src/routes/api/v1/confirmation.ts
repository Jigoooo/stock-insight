import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { brainProxyGet, firstParam } from '@/server/brain-proxy';

const handlers = {
  GET: brainProxyGet('/v1/confirmation', {
    query: (params) => ({
      entityKey: firstParam(params, 'entityKey'),
      limit: firstParam(params, 'limit'),
    }),
  }),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/confirmation')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
