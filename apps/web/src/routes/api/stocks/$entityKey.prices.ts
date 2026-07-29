import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { BrainRequestError, brainRequest } from '@/server/brain-client';
import { jsonResponse } from '@/server/http';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '@/server/request-scope';

type PriceSeriesRouteContext = {
  params: {
    entityKey: string;
  };
  request: Request;
};

const handlers = {
  GET: async ({ params, request }: PriceSeriesRouteContext) => {
    const range = new URL(request.url).searchParams.get('range') ?? undefined;
    // Price series is shared market data, but the brain still requires a
    // verified scope so any RLS-protected relation it touches stays consistent.
    let userId: string;
    try {
      userId = await resolveRequestUserId(request);
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
    try {
      return jsonResponse(
        await brainRequest(`/v1/stocks/${encodeURIComponent(params.entityKey)}/prices`, {
          scope: { kind: 'user', userId },
          ...(range === undefined ? {} : { query: { range } }),
        }),
      );
    } catch (error) {
      if (error instanceof BrainRequestError && error.body !== undefined) {
        return jsonResponse(error.body, { status: error.status });
      }
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: PriceSeriesRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/stocks/$entityKey/prices')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
