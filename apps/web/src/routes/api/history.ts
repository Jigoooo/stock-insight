import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadDecisionHistoryPage } from '@/server/research-workspace';

type HistoryRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: HistoryRouteContext) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitText = url.searchParams.get('limit');
    const limit = limitText === null ? 20 : Number(limitText);

    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor?.length ?? 0) > 1_024) {
      return jsonResponse({ error: { code: 'invalid_history_query' } }, { status: 400 });
    }
    try {
      return jsonResponse(await loadDecisionHistoryPage({ cursor, limit }));
    } catch (error) {
      if (error instanceof Error && error.message === 'History cursor is invalid') {
        return jsonResponse({ error: { code: 'invalid_history_cursor' } }, { status: 400 });
      }
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: HistoryRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/history')({
  server: { middleware: [authRequestMiddleware], handlers },
});
