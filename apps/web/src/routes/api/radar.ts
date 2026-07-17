import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadRadarSignalPage } from '@/server/research-workspace';

type RadarRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: RadarRouteContext) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitText = url.searchParams.get('limit');
    const limit = limitText === null ? 20 : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor?.length ?? 0) > 1_024) {
      return jsonResponse({ error: { code: 'invalid_radar_query' } }, { status: 400 });
    }
    try {
      return jsonResponse(await loadRadarSignalPage({ cursor, limit }));
    } catch (error) {
      if (error instanceof Error && error.message === 'Radar cursor is invalid') {
        return jsonResponse({ error: { code: 'invalid_radar_cursor' } }, { status: 400 });
      }
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: RadarRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/radar')({
  server: { middleware: [authRequestMiddleware], handlers },
});
