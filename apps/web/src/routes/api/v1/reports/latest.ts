import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { normalizeProductLimitParam, normalizeProductTextParam } from '@stock-insight/api';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadLatestReports } from '@/server/product-api';

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const reportType = normalizeProductTextParam(url.searchParams.getAll('type'));
    const scopeKey = normalizeProductTextParam(url.searchParams.getAll('scope'));
    const limit = normalizeProductLimitParam(url.searchParams.getAll('limit'));
    return jsonResponse(await loadLatestReports({
      ...(reportType !== undefined ? { reportType } : {}),
      ...(scopeKey !== undefined ? { scopeKey } : {}),
      ...(limit !== undefined ? { limit } : {}),
    }));
  },
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/reports/latest')({
  server: { middleware: [authRequestMiddleware], handlers },
});
