import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';

import {
  createPostgresStockReadModel,
  createReadOnlyDatabaseClient,
  getStockDetail,
  type StockReadModel,
} from '@stock-insight/api';

type StockDetailRouteContext = {
  params: {
    entityKey: string;
  };
};

function createRouteStockReadModel(): StockReadModel | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresStockReadModel((sql, params) => db.queryRows(sql, params));
}

const handlers = {
  GET: async ({ params }: StockDetailRouteContext) =>
    jsonResponse(
      await getStockDetail(params.entityKey, { readModel: createRouteStockReadModel() }),
    ),
} satisfies Partial<
  Record<RouteMethod, ({ params }: StockDetailRouteContext) => Promise<Response>>
>;

export const Route = createFileRoute('/api/stocks/$entityKey')({
  server: {
    handlers,
  },
});
