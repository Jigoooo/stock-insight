import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { handlePositionUpsert } from '@/server/manual-portfolio';

const handlers = {
  POST: async ({ request }: { request: Request }) => handlePositionUpsert(request),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/positions')({
  server: {
    handlers,
  },
});
