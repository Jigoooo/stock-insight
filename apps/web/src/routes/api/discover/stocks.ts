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
  createPostgresDiscoverStocksReadModel,
  createScopedReadOnlyDatabaseClient,
  getDiscoverStocks,
  parseServerEnv,
  type DiscoverStocksReadModel,
} from '@stock-insight/api';
import { discoverStocksQuerySchema } from '@stock-insight/contracts';

function createRouteDiscoverStocksReadModel(userId: string): DiscoverStocksReadModel | undefined {
  const userScope = { userId };
  const db = createScopedReadOnlyDatabaseClient(userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;

  return createPostgresDiscoverStocksReadModel(
    (sql, params) => db.queryRows(sql, params),
    userScope,
  );
}

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const query = discoverStocksQuerySchema.parse({
      market: url.searchParams.get('market') ?? undefined,
      reason: url.searchParams.get('reason') ?? undefined,
    });

    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await getDiscoverStocks({ query, readModel: createRouteDiscoverStocksReadModel(userId) }),
      );
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/discover/stocks')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
