import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';

import {
  createPostgresDashboardReadModel,
  createReadOnlyDatabaseClient,
  getDashboardBootstrap,
  parseServerEnv,
  requireUserScope,
  type DashboardReadModel,
} from '@stock-insight/api';

function createRouteDashboardReadModel(): DashboardReadModel | undefined {
  const userScope = requireUserScope(parseServerEnv());
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresDashboardReadModel((sql, params) => db.queryRows(sql, params), userScope);
}

const handlers = {
  GET: async () =>
    jsonResponse(await getDashboardBootstrap({ readModel: createRouteDashboardReadModel() })),
} satisfies Partial<Record<RouteMethod, () => Promise<Response>>>;

export const Route = createFileRoute('/api/dashboard/today')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
