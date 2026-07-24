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
import { parseTemporalQuery, resolveTemporalQuery } from '@stock-insight/contracts/temporal';

type RelationRouteContext = {
  params: { entityKey: string };
  request: Request;
};

const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

const handlers = {
  GET: async ({ params, request }: RelationRouteContext) => {
    const url = new URL(request.url);
    const rawDepth = url.searchParams.get('depth') ?? '1';
    const depth = Number(rawDepth);
    if (
      !entityKeyPattern.test(params.entityKey) ||
      !Number.isInteger(depth) ||
      depth < 1 ||
      depth > 2
    ) {
      return jsonResponse({ error: { code: 'invalid_relation_query' } }, { status: 400 });
    }
    // Fail closed on an incoherent time basis (e.g. knownAt before validAt) so a
    // response can never leak information that was not yet known.
    let temporal;
    try {
      temporal = resolveTemporalQuery(parseTemporalQuery(url.searchParams));
    } catch {
      return jsonResponse({ error: { code: 'invalid_temporal_query' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      const graph = await loadEntityRelationGraph(userId, params.entityKey, depth, {
        knownAt: new Date(temporal.knownAt),
      });
      if (!graph) {
        return jsonResponse({ error: { code: 'entity_not_found' } }, { status: 404 });
      }
      // Echo the applied temporal resolution additively via a header so the
      // graph body contract is unchanged.
      return jsonResponse(graph, {
        headers: {
          'x-temporal-resolution': JSON.stringify({
            validAt: temporal.validAt,
            knownAt: temporal.knownAt,
            informationSet: temporal.informationSet,
            aliasApplied: temporal.aliasApplied,
            knownAtSource: temporal.knownAtSource,
          }),
        },
      });
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: RelationRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/entities/$entityKey/relations')({
  server: { middleware: [authRequestMiddleware], handlers },
});
