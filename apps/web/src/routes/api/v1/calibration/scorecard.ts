import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadCalibrationScorecard } from '@/server/product-api';

const handlers = {
  GET: async () => jsonResponse(await loadCalibrationScorecard()),
} satisfies Partial<Record<RouteMethod, () => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/calibration/scorecard')({
  server: { middleware: [authRequestMiddleware], handlers },
});
