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
import { entityBriefingSurfaceSchema } from '@stock-insight/contracts/workspace-read-v2';

type EntityBriefingRouteContext = {
  params: { entityKey: string };
  request: Request;
};

const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

const handlers = {
  GET: async ({ params, request }: EntityBriefingRouteContext) => {
    const surface = entityBriefingSurfaceSchema.safeParse(
      new URL(request.url).searchParams.get('surface'),
    );
    if (!entityKeyPattern.test(params.entityKey) || !surface.success) {
      return jsonResponse({ error: { code: 'invalid_entity_briefing_query' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await brainRequest(`/v1/entities/${encodeURIComponent(params.entityKey)}/briefing`, {
          scope: { kind: 'user', userId },
          query: { surface: surface.data },
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
  Record<RouteMethod, (context: EntityBriefingRouteContext) => Promise<Response>>
>;

export const Route = createFileRoute('/api/entities/$entityKey/briefing')({
  server: { middleware: [authRequestMiddleware], handlers },
});
