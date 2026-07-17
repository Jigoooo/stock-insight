import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadResearchRecord } from '@/server/research-workspace';

type RecordRouteContext = { params: { recordKey: string } };

const handlers = {
  GET: async ({ params }: RecordRouteContext) => {
    if (!params.recordKey.trim() || params.recordKey.length > 320) {
      return jsonResponse({ error: { code: 'invalid_record_key' } }, { status: 400 });
    }
    const detail = await loadResearchRecord(params.recordKey);
    return detail
      ? jsonResponse(detail)
      : jsonResponse({ error: { code: 'record_not_found' } }, { status: 404 });
  },
} satisfies Partial<Record<RouteMethod, (context: RecordRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/records/$recordKey')({
  server: { middleware: [authRequestMiddleware], handlers },
});
