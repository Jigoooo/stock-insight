import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { BrainRequestError, brainRequest } from '@/server/brain-client';
import { jsonResponse } from '@/server/http';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '@/server/request-scope';

type RecordBriefingRouteContext = { params: { recordKey: string }; request: Request };

const handlers = {
  GET: async ({ params, request }: RecordBriefingRouteContext) => {
    if (!params.recordKey.trim() || params.recordKey.length > 320) {
      return jsonResponse({ error: { code: 'invalid_record_key' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await brainRequest(`/v1/records/${encodeURIComponent(params.recordKey)}/briefing`, {
          scope: { kind: 'user', userId },
        }),
      );
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      if (error instanceof BrainRequestError && error.body !== undefined) {
        return jsonResponse(error.body, { status: error.status });
      }
      throw error;
    }
  },
} satisfies Partial<
  Record<RouteMethod, (context: RecordBriefingRouteContext) => Promise<Response>>
>;

export const Route = createFileRoute('/api/records/$recordKey/briefing')({
  server: { middleware: [authRequestMiddleware], handlers },
});
