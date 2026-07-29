import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { brainProxyGet, firstParam } from '@/server/brain-proxy';

const handlers = {
  GET: brainProxyGet('/v1/reports/latest', {
    query: (params) => ({
      type: firstParam(params, 'type'),
      scope: firstParam(params, 'scope'),
      limit: firstParam(params, 'limit'),
    }),
  }),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/reports/latest')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
