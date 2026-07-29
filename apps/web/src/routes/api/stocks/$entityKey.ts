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

type StockDetailRouteContext = {
  params: {
    entityKey: string;
  };
  request: Request;
};

const handlers = {
  GET: async ({ params, request }: StockDetailRouteContext) => {
    let userId: string;
    try {
      userId = await resolveRequestUserId(request);
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
    try {
      return jsonResponse(
        await brainRequest(`/v1/stocks/${encodeURIComponent(params.entityKey)}`, {
          scope: { kind: 'user', userId },
        }),
      );
    } catch (error) {
      if (error instanceof BrainRequestError && error.body !== undefined) {
        return jsonResponse(error.body, { status: error.status });
      }
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: StockDetailRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/stocks/$entityKey')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
