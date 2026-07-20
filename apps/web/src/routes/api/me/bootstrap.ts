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
  createPostgresMeBootstrapReadModel,
  createScopedReadOnlyDatabaseClient,
  getMeBootstrap,
  parseServerEnv,
  type MeBootstrapReadModel,
} from '@stock-insight/api';

function createRouteMeBootstrapReadModel(userId: string): MeBootstrapReadModel | undefined {
  const userScope = { userId };
  const db = createScopedReadOnlyDatabaseClient(userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;

  return createPostgresMeBootstrapReadModel((sql, params) => db.queryRows(sql, params), userScope);
}

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(
        await getMeBootstrap({ readModel: createRouteMeBootstrapReadModel(userId) }),
      );
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/me/bootstrap')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
