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
  getStockDetail,
  parseServerEnv,
  type StockReadModel,
} from '@stock-insight/api';

type StockDetailRouteContext = {
  params: {
    entityKey: string;
  };
  request: Request;
};

function createRouteStockReadModel(userId: string): StockReadModel | undefined {
  const userScope = { userId };
  const db = createScopedReadOnlyDatabaseClient(userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;

  return createPostgresStockReadModel((sql, params) => db.queryRows(sql, params), userScope);
}

const handlers = {
  GET: async ({ params, request }: StockDetailRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await getStockDetail(params.entityKey, { readModel: createRouteStockReadModel(userId) }),
      );
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<
  Record<RouteMethod, (context: StockDetailRouteContext) => Promise<Response>>
>;

export const Route = createFileRoute('/api/stocks/$entityKey')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
