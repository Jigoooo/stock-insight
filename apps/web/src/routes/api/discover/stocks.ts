import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';

import {
  createPostgresDiscoverStocksReadModel,
  createReadOnlyDatabaseClient,
  getDiscoverStocks,
  type DiscoverStocksReadModel,
} from '@stock-insight/api';
import { discoverStocksQuerySchema } from '@stock-insight/contracts';

function createRouteDiscoverStocksReadModel(): DiscoverStocksReadModel | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresDiscoverStocksReadModel((sql, params) => db.queryRows(sql, params));
}

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const query = discoverStocksQuerySchema.parse({
      market: url.searchParams.get('market') ?? undefined,
      reason: url.searchParams.get('reason') ?? undefined,
    });

    return jsonResponse(
      await getDiscoverStocks({ query, readModel: createRouteDiscoverStocksReadModel() }),
    );
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/discover/stocks')({
  server: {
    handlers,
  },
});
