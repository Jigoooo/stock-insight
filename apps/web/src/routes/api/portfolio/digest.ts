import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';

import {
  createPostgresPortfolioDigestReadModel,
  createReadOnlyDatabaseClient,
  getPortfolioDigest,
  parseServerEnv,
  requireUserScope,
  type PortfolioDigestReadModel,
} from '@stock-insight/api';

function createRoutePortfolioDigestReadModel(): PortfolioDigestReadModel | undefined {
  const userScope = requireUserScope(parseServerEnv());
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  return createPostgresPortfolioDigestReadModel(
    (sql, params) => db.queryRows(sql, params),
    userScope,
  );
}

const handlers = {
  GET: async () =>
    jsonResponse(await getPortfolioDigest({ readModel: createRoutePortfolioDigestReadModel() })),
} satisfies Partial<Record<RouteMethod, () => Promise<Response>>>;

export const Route = createFileRoute('/api/portfolio/digest')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
