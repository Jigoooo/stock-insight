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
import { loadGeoMvtTile } from '@/server/research-workspace';
import { parseTemporalQuery, resolveTemporalQuery } from '@stock-insight/contracts/temporal';

type GeoMvtRouteContext = {
  params: { z: string; x: string; y: string };
  request: Request;
};

const handlers = {
  GET: async ({ params, request }: GeoMvtRouteContext) => {
    const url = new URL(request.url);
    const snapshotId = url.searchParams.get('snapshot') ?? '';
    let temporal;
    try {
      temporal = resolveTemporalQuery(parseTemporalQuery(url.searchParams));
    } catch {
      return jsonResponse({ error: { code: 'invalid_temporal_query' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      const tile = await loadGeoMvtTile(userId, {
        z: Number(params.z),
        x: Number(params.x),
        y: Number(params.y),
        snapshotId,
        knownAt: new Date(temporal.knownAt),
        validAt: new Date(temporal.validAt),
      });
      const body = tile.buffer.slice(
        tile.byteOffset,
        tile.byteOffset + tile.byteLength,
      ) as ArrayBuffer;
      return new Response(body, {
        status: 200,
        headers: {
          'cache-control': 'private, max-age=31536000, immutable',
          'content-type': 'application/vnd.mapbox-vector-tile',
          'x-content-type-options': 'nosniff',
          'x-geo-snapshot': snapshotId,
          vary: 'Cookie',
        },
      });
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      if (error instanceof Error && /Geo MVT .*invalid/.test(error.message)) {
        return jsonResponse({ error: { code: 'invalid_geo_tile_query' } }, { status: 400 });
      }
      if (error instanceof Error && /Geo MVT snapshot mismatch/.test(error.message)) {
        return jsonResponse({ error: { code: 'geo_snapshot_mismatch' } }, { status: 409 });
      }
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: GeoMvtRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/geo/tiles/$z/$x/$y')({
  server: { middleware: [authRequestMiddleware], handlers },
});
