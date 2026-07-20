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
  createPostgresDashboardReadModel,
  createScopedReadOnlyDatabaseClient,
  getDashboardBootstrap,
  parseServerEnv,
  type DashboardReadModel,
} from '@stock-insight/api';

function createRouteDashboardReadModel(userId: string): DashboardReadModel | undefined {
  const userScope = { userId };
  const db = createScopedReadOnlyDatabaseClient(userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;

  return createPostgresDashboardReadModel((sql, params) => db.queryRows(sql, params), userScope);
}

type DashboardRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: DashboardRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await getDashboardBootstrap({ readModel: createRouteDashboardReadModel(userId) }),
      );
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: DashboardRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/dashboard/today')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
