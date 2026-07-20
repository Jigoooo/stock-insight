import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadResearchRecord } from '@/server/research-workspace';

type RecordRouteContext = { params: { recordKey: string }; request: Request };

const handlers = {
  GET: async ({ params, request }: RecordRouteContext) => {
    if (!params.recordKey.trim() || params.recordKey.length > 320) {
      return jsonResponse({ error: { code: 'invalid_record_key' } }, { status: 400 });
    }
    const search = new URL(request.url).searchParams;
    const analysisRunId = search.get('analysisRunId');
    const rawRevision = search.get('analysisRevision');
    const analysisRevision = rawRevision === null ? undefined : Number(rawRevision);
    if (
      (analysisRunId === null) !== (analysisRevision === undefined) ||
      (analysisRunId !== null && (analysisRunId.trim().length < 1 || analysisRunId.length > 128)) ||
      (rawRevision !== null && rawRevision.trim().length < 1) ||
      (analysisRevision !== undefined &&
        (!Number.isInteger(analysisRevision) || analysisRevision < 0))
    ) {
      return jsonResponse({ error: { code: 'invalid_record_snapshot' } }, { status: 400 });
    }
    const snapshot =
      analysisRunId !== null && analysisRevision !== undefined
        ? { analysisRunId, analysisRevision }
        : undefined;
    const detail = await loadResearchRecord(params.recordKey, snapshot);
    return detail
      ? jsonResponse(detail)
      : jsonResponse({ error: { code: 'record_not_found' } }, { status: 404 });
  },
} satisfies Partial<Record<RouteMethod, (context: RecordRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/records/$recordKey')({
  server: { middleware: [authRequestMiddleware], handlers },
});
