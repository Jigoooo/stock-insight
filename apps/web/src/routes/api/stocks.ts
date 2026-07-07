import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';

import {
  createPostgresStockReadModel,
  createReadOnlyDatabaseClient,
  getStockList,
  type StockReadModel,
} from '@stock-insight/api';
import type { StockListQuery } from '@stock-insight/contracts';

function parseStockListQuery(url: string): StockListQuery {
  const params = new URL(url).searchParams;
  const query: StockListQuery = {};

  const market = params.get('market');
  if (market === 'KR' || market === 'US') query.market = market;

  const scope = params.get('scope');
  if (scope === 'watchlist' || scope === 'holding' || scope === 'discover' || scope === 'all') {
    query.scope = scope;
  }

  const q = params.get('q')?.trim();
  if (q) query.q = q;

  return query;
}

function createRouteStockReadModel(): StockReadModel | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresStockReadModel((sql, params) => db.queryRows(sql, params));
}

const handlers = {
  GET: async ({ request }: { request: Request }) =>
    jsonResponse(
      await getStockList({
        query: parseStockListQuery(request.url),
        readModel: createRouteStockReadModel(),
      }),
    ),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/stocks')({
  server: {
    handlers,
  },
});
