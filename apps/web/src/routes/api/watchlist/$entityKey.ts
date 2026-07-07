import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { handleWatchlistRemove } from '@/server/manual-portfolio';

type WatchlistRouteContext = {
  params: {
    entityKey: string;
  };
};

const handlers = {
  DELETE: async ({ params }: WatchlistRouteContext) => handleWatchlistRemove(params.entityKey),
} satisfies Partial<Record<RouteMethod, ({ params }: WatchlistRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/watchlist/$entityKey')({
  server: {
    handlers,
  },
});
