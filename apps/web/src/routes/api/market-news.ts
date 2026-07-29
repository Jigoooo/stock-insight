import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { brainProxyGet, firstParam } from '@/server/brain-proxy';

const handlers = {
  GET: brainProxyGet('/v1/market-news', {
    // Legacy parity: marketNewsQuerySchema.parse() ran here and threw on bad
    // input; the brain re-validates, so we forward the raw values verbatim.
    query: (params) => ({
      market: firstParam(params, 'market'),
      type: firstParam(params, 'type'),
    }),
  }),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/market-news')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
