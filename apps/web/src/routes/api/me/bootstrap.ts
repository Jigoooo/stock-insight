import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';

import {
  createPostgresMeBootstrapReadModel,
  createReadOnlyDatabaseClient,
  getMeBootstrap,
  type MeBootstrapReadModel,
} from '@stock-insight/api';

function createRouteMeBootstrapReadModel(): MeBootstrapReadModel | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresMeBootstrapReadModel((sql, params) => db.queryRows(sql, params));
}

const handlers = {
  GET: async () =>
    jsonResponse(await getMeBootstrap({ readModel: createRouteMeBootstrapReadModel() })),
} satisfies Partial<Record<RouteMethod, () => Promise<Response>>>;

export const Route = createFileRoute('/api/me/bootstrap')({
  server: {
    handlers,
  },
});
