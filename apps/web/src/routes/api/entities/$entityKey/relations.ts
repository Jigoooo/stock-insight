import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadEntityRelationGraph } from '@/server/research-workspace';

type RelationRouteContext = {
  params: { entityKey: string };
  request: Request;
};

const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

const handlers = {
  GET: async ({ params, request }: RelationRouteContext) => {
    const search = new URL(request.url).searchParams;
    const rawDepth = search.get('depth') ?? '1';
    const depth = Number(rawDepth);
    const analysisRunId = search.get('analysisRunId');
    const rawRevision = search.get('analysisRevision');
    const analysisRevision = rawRevision === null ? undefined : Number(rawRevision);
    if (
      !entityKeyPattern.test(params.entityKey) ||
      !Number.isInteger(depth) ||
      depth < 1 ||
      depth > 2 ||
      (analysisRunId === null) !== (analysisRevision === undefined) ||
      (analysisRunId !== null && (analysisRunId.trim().length < 1 || analysisRunId.length > 128)) ||
      (rawRevision !== null && rawRevision.trim().length < 1) ||
      (analysisRevision !== undefined &&
        (!Number.isInteger(analysisRevision) || analysisRevision < 0))
    ) {
      return jsonResponse({ error: { code: 'invalid_relation_query' } }, { status: 400 });
    }
    const snapshot =
      analysisRunId !== null && analysisRevision !== undefined
        ? { analysisRunId, analysisRevision }
        : undefined;
    const graph = await loadEntityRelationGraph(params.entityKey, depth, snapshot);
    return graph
      ? jsonResponse(graph)
      : jsonResponse({ error: { code: 'entity_not_found' } }, { status: 404 });
  },
} satisfies Partial<Record<RouteMethod, (context: RelationRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/entities/$entityKey/relations')({
  server: { middleware: [authRequestMiddleware], handlers },
});
