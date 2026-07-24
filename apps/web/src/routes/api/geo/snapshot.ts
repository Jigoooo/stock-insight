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
import { loadGeoSnapshot } from '@/server/research-workspace';
import { parseTemporalQuery, resolveTemporalQuery } from '@stock-insight/contracts/temporal';

type GeoSnapshotRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: GeoSnapshotRouteContext) => {
    let temporal;
    try {
      temporal = resolveTemporalQuery(parseTemporalQuery(new URL(request.url).searchParams));
    } catch {
      return jsonResponse({ error: { code: 'invalid_temporal_query' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      const snapshot = await loadGeoSnapshot(userId, {
        knownAt: new Date(temporal.knownAt),
        validAt: new Date(temporal.validAt),
      });
      return jsonResponse(snapshot, {
        headers: {
          'cache-control': 'private, no-store',
          'x-geo-snapshot': snapshot.snapshotId,
          'x-temporal-resolution': JSON.stringify(temporal),
          vary: 'Cookie',
        },
      });
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: GeoSnapshotRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/geo/snapshot')({
  server: { middleware: [authRequestMiddleware], handlers },
});
