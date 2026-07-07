import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';

import {
  createPostgresDashboardReadModel,
  createReadOnlyDatabaseClient,
  getDashboardBootstrap,
  type DashboardReadModel,
} from '@stock-insight/api';

function createRouteDashboardReadModel(): DashboardReadModel | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresDashboardReadModel((sql, params) => db.queryRows(sql, params));
}

const handlers = {
  GET: async () =>
    jsonResponse(await getDashboardBootstrap({ readModel: createRouteDashboardReadModel() })),
} satisfies Partial<Record<RouteMethod, () => Promise<Response>>>;

export const Route = createFileRoute('/api/dashboard/today')({
  server: {
    handlers,
  },
});
