import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';

import {
  createPostgresPriceSeriesReadModel,
  createReadOnlyDatabaseClient,
  getPriceSeries,
  type PriceSeriesDatabaseRow,
  type PriceSeriesReadModel,
} from '@stock-insight/api';

type PriceSeriesRouteContext = {
  params: {
    entityKey: string;
  };
  request: Request;
};

function createRoutePriceSeriesReadModel(): PriceSeriesReadModel | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresPriceSeriesReadModel((sql, params) =>
    db.queryRows<PriceSeriesDatabaseRow & Record<string, unknown>>(sql, params),
  );
}

const handlers = {
  GET: async ({ params, request }: PriceSeriesRouteContext) => {
    const range = new URL(request.url).searchParams.get('range') ?? undefined;
    return jsonResponse(
      await getPriceSeries(params.entityKey, {
        ...(range === undefined ? {} : { range }),
        readModel: createRoutePriceSeriesReadModel(),
      }),
    );
  },
} satisfies Partial<Record<RouteMethod, (context: PriceSeriesRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/stocks/$entityKey/prices')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
