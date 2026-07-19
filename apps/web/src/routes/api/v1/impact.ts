import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadImpactSummaries } from '@/server/product-api';
import { normalizeProductLimitParam, normalizeProductTextParam } from '@stock-insight/api';

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const entityKey = normalizeProductTextParam(url.searchParams.getAll('entityKey'));
    const limit = normalizeProductLimitParam(url.searchParams.getAll('limit'));
    return jsonResponse(await loadImpactSummaries({
      ...(entityKey !== undefined ? { entityKey } : {}),
      ...(limit !== undefined ? { limit } : {}),
    }));
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/impact')({
  server: { middleware: [authRequestMiddleware], handlers },
});
