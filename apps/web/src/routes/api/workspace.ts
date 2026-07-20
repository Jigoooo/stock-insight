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
import { loadResearchWorkspace } from '@/server/research-workspace';

type WorkspaceRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: WorkspaceRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(await loadResearchWorkspace(userId));
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: WorkspaceRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/workspace')({
  server: { middleware: [authRequestMiddleware], handlers },
});
