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

import {
  createPostgresStockReadModel,
  createScopedReadOnlyDatabaseClient,
  getStockList,
  parseServerEnv,
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

function createRouteStockReadModel(userId: string): StockReadModel | undefined {
  const userScope = { userId };
  const db = createScopedReadOnlyDatabaseClient(userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;

  return createPostgresStockReadModel((sql, params) => db.queryRows(sql, params), userScope);
}

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await getStockList({
          query: parseStockListQuery(request.url),
          readModel: createRouteStockReadModel(userId),
        }),
      );
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/stocks')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
