import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';

import {
  createPostgresMarketNewsReadModel,
  createReadOnlyDatabaseClient,
  getMarketNews,
  type MarketNewsReadModel,
} from '@stock-insight/api';
import { marketNewsQuerySchema } from '@stock-insight/contracts';

function createRouteMarketNewsReadModel(): MarketNewsReadModel | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresMarketNewsReadModel((sql, params) => db.queryRows(sql, params));
}

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const query = marketNewsQuerySchema.parse({
      market: url.searchParams.get('market') ?? undefined,
      type: url.searchParams.get('type') ?? undefined,
    });

    return jsonResponse(
      await getMarketNews({ query, readModel: createRouteMarketNewsReadModel() }),
    );
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/market-news')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
