import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { handleWatchlistRemove } from '@/server/manual-portfolio';

type WatchlistRouteContext = {
  request: Request;
  params: {
    entityKey: string;
  };
};

const handlers = {
  DELETE: async ({ request, params }: WatchlistRouteContext) =>
    handleWatchlistRemove(request, params.entityKey),
} satisfies Partial<Record<RouteMethod, (context: WatchlistRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/watchlist/$entityKey')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
