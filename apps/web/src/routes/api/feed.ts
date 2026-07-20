import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '@/server/request-scope';
import { loadResearchFeedPage } from '@/server/research-workspace';

type FeedRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: FeedRouteContext) => {
    const params = new URL(request.url).searchParams;
    const lane = params.get('lane') ?? 'for_you';
    const limit = Number(params.get('limit') ?? '24');
    const cursor = params.get('cursor') ?? undefined;
    if (
      (lane !== 'must_know' && lane !== 'for_you' && lane !== 'explore') ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (cursor !== undefined && cursor.length > 1_024)
    ) {
      return jsonResponse({ error: { code: 'invalid_feed_query' } }, { status: 400 });
    }
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(await loadResearchFeedPage(userId, { lane, limit, cursor }));
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      if (error instanceof Error && error.message.toLowerCase().includes('cursor')) {
        return jsonResponse({ error: { code: 'invalid_feed_cursor' } }, { status: 400 });
      }
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: FeedRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/feed')({
  server: { middleware: [authRequestMiddleware], handlers },
});
