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
import { loadEntityRelationGraph } from '@/server/research-workspace';

type RelationRouteContext = {
  params: { entityKey: string };
  request: Request;
};

const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

const handlers = {
  GET: async ({ params, request }: RelationRouteContext) => {
    const rawDepth = new URL(request.url).searchParams.get('depth') ?? '1';
    const depth = Number(rawDepth);
    if (
      !entityKeyPattern.test(params.entityKey) ||
      !Number.isInteger(depth) ||
      depth < 1 ||
      depth > 2
    ) {
      return jsonResponse({ error: { code: 'invalid_relation_query' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      const graph = await loadEntityRelationGraph(userId, params.entityKey, depth);
      return graph
        ? jsonResponse(graph)
        : jsonResponse({ error: { code: 'entity_not_found' } }, { status: 404 });
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: RelationRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/entities/$entityKey/relations')({
  server: { middleware: [authRequestMiddleware], handlers },
});
