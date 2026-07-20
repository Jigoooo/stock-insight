import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '@/server/request-scope';
import { loadResearchStatus } from '@/server/research-workspace';

type StatusRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: StatusRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(await loadResearchStatus(userId));
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: StatusRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/status')({
  server: { middleware: [authRequestMiddleware], handlers },
});
