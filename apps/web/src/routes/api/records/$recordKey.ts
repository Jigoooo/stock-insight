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
import { loadResearchRecord } from '@/server/research-workspace';

type RecordRouteContext = { params: { recordKey: string }; request: Request };

const handlers = {
  GET: async ({ params, request }: RecordRouteContext) => {
    if (!params.recordKey.trim() || params.recordKey.length > 320) {
      return jsonResponse({ error: { code: 'invalid_record_key' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      const detail = await loadResearchRecord(userId, params.recordKey);
      return detail
        ? jsonResponse(detail)
        : jsonResponse({ error: { code: 'record_not_found' } }, { status: 404 });
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: RecordRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/records/$recordKey')({
  server: { middleware: [authRequestMiddleware], handlers },
});
