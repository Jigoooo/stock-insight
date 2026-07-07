import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { handleWatchlistUpsert } from '@/server/manual-portfolio';

const handlers = {
  POST: async ({ request }: { request: Request }) => handleWatchlistUpsert(request),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/watchlist')({
  server: {
    handlers,
  },
});
