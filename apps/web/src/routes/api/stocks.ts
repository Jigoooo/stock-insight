import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { brainProxyGet, firstParam } from '@/server/brain-proxy';

const handlers = {
  GET: brainProxyGet('/v1/stocks', {
    query: (params) => {
      const query: Record<string, string | undefined> = {};
      const market = params.get('market');
      if (market === 'KR' || market === 'US') query.market = market;
      const scope = params.get('scope');
      if (scope === 'watchlist' || scope === 'holding' || scope === 'discover' || scope === 'all') {
        query.scope = scope;
      }
      const q = firstParam(params, 'q');
      if (q) query.q = q.trim();
      return query;
    },
  }),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/stocks')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
