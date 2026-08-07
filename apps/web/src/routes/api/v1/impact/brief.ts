import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { brainProxyGet, firstParam } from '@/server/brain-proxy';

// The v2 impact plane. The sibling /api/v1/impact route proxies the v1 summary,
// which is empty by construction — see docs/architecture/operations/impact-plane-v1-v2.md.
// entityKey is required here because a content pack is built for one holding.
const handlers = {
  GET: brainProxyGet('/v1/impact/brief', {
    query: (params) => ({ entityKey: firstParam(params, 'entityKey') }),
  }),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/impact/brief')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
