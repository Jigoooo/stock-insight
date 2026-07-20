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
  createPostgresPortfolioDigestReadModel,
  createScopedReadOnlyDatabaseClient,
  getPortfolioDigest,
  parseServerEnv,
  type PortfolioDigestReadModel,
} from '@stock-insight/api';

function createRoutePortfolioDigestReadModel(userId: string): PortfolioDigestReadModel | undefined {
  const userScope = { userId };
  const db = createScopedReadOnlyDatabaseClient(userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;

  return createPostgresPortfolioDigestReadModel(
    (sql, params) => db.queryRows(sql, params),
    userScope,
  );
}

type PortfolioDigestRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: PortfolioDigestRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await getPortfolioDigest({ readModel: createRoutePortfolioDigestReadModel(userId) }),
      );
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: PortfolioDigestRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/portfolio/digest')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
