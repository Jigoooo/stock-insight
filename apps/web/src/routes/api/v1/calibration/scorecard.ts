import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadCalibrationScorecard } from '@/server/product-api';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '@/server/request-scope';

type ScorecardRouteContext = { request: Request };

const handlers = {
  GET: async ({ request }: ScorecardRouteContext) => {
    try {
      const userId = await resolveRequestUserId(request);
      return jsonResponse(await loadCalibrationScorecard(userId));
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }
  },
} satisfies Partial<Record<RouteMethod, (context: ScorecardRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/calibration/scorecard')({
  server: { middleware: [authRequestMiddleware], handlers },
});
