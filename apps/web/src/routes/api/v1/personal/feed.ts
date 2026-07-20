import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadPersonalizedFeed } from '@/server/product-api';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '@/server/request-scope';
import { normalizeProductTextParam } from '@stock-insight/api';

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const date = normalizeProductTextParam(
      new URL(request.url).searchParams.getAll('date'),
    );
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(await loadPersonalizedFeed(userId, date));
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/personal/feed')({
  server: { middleware: [authRequestMiddleware], handlers },
});
