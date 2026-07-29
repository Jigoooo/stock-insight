import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { brainProxyGet } from '@/server/brain-proxy';

const handlers = {
  GET: brainProxyGet('/v1/dashboard/today'),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/dashboard/today')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
