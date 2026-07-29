import { Controller, Get, Param, Query, Res } from '@nestjs/common';

import { researchContext } from './read-context.ts';
import { apiError, firstParam } from '../common/http.ts';

import { getGeoMvtTile, getGeoSnapshot } from '@stock-insight/api';

type ReplyLike = {
  header: (name: string, value: string) => void;
  send: (payload: Buffer) => void;
};

// The web/BFF owns temporal-query parsing (it answers 400 invalid_temporal_query
// before it ever reaches us) and forwards the already-resolved instants as ISO
// strings. We re-validate here so a malformed internal call fails closed rather
// than silently reading "now".
function requireInstant(raw: string | string[] | undefined, code: string): Date {
  const text = firstParam(raw);
  if (text === undefined || text === '') throw apiError(code, 400);
  const value = new Date(text);
  if (!Number.isFinite(value.getTime())) throw apiError(code, 400);
  return value;
}

function requireTileCoordinate(raw: string, code: string): number {
  if (!/^\d{1,10}$/.test(raw)) throw apiError(code, 400);
  return Number(raw);
}

@Controller('geo')
export class GeoController {
  @Get('snapshot')
  async snapshot(
    @Query('knownAt') knownAtRaw?: string | string[],
    @Query('validAt') validAtRaw?: string | string[],
  ) {
    const knownAt = requireInstant(knownAtRaw, 'invalid_temporal_query');
    const validAt = requireInstant(validAtRaw, 'invalid_temporal_query');
    const { withSnapshot } = researchContext();
    const requestNow = new Date();
    return withSnapshot((executor) =>
      getGeoSnapshot(executor, { knownAt, validAt, now: requestNow }),
    );
  }

  // Vector tiles are binary; bypass the JSON serializer and mirror the byte-exact
  // body plus content-type the browser expects. Caching headers stay with the
  // web/BFF, which is the only surface a browser actually talks to.
  @Get('tiles/:z/:x/:y')
  async tile(
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Res({ passthrough: false }) reply: ReplyLike,
    @Query('snapshot') snapshotRaw?: string | string[],
    @Query('knownAt') knownAtRaw?: string | string[],
    @Query('validAt') validAtRaw?: string | string[],
  ): Promise<void> {
    const knownAt = requireInstant(knownAtRaw, 'invalid_temporal_query');
    const validAt = requireInstant(validAtRaw, 'invalid_temporal_query');
    const snapshotId = firstParam(snapshotRaw) ?? '';
    const { withSnapshot } = researchContext();

    let tile: Uint8Array;
    try {
      tile = await withSnapshot((executor) =>
        getGeoMvtTile(executor, {
          z: requireTileCoordinate(z, 'invalid_geo_tile_query'),
          x: requireTileCoordinate(x, 'invalid_geo_tile_query'),
          y: requireTileCoordinate(y, 'invalid_geo_tile_query'),
          snapshotId,
          knownAt,
          validAt,
        }),
      );
    } catch (error) {
      // Legacy parity with apps/web/src/routes/api/geo/tiles/$z/$x/$y.ts: the
      // read model signals these two cases through message text only.
      if (error instanceof Error && /Geo MVT snapshot mismatch/.test(error.message)) {
        throw apiError('geo_snapshot_mismatch', 409);
      }
      if (error instanceof Error && /Geo MVT .*invalid/.test(error.message)) {
        throw apiError('invalid_geo_tile_query', 400);
      }
      throw error;
    }

    reply.header('content-type', 'application/vnd.mapbox-vector-tile');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-geo-snapshot', snapshotId);
    reply.send(Buffer.from(tile.buffer, tile.byteOffset, tile.byteLength));
  }
}
