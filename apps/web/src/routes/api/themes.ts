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
import { loadThemeResearch } from '@/server/research-workspace';

type ThemesRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: ThemesRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(await loadThemeResearch(userId));
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: ThemesRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/themes')({
  server: { middleware: [authRequestMiddleware], handlers },
});
