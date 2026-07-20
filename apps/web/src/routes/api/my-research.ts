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
import { loadMyResearchOverview } from '@/server/research-workspace';

type MyResearchRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: MyResearchRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(await loadMyResearchOverview(userId));
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: MyResearchRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/my-research')({
  server: { middleware: [authRequestMiddleware], handlers },
});
