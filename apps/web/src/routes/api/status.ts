import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadResearchStatus } from '@/server/research-workspace';

const handlers = {
  GET: async () => jsonResponse(await loadResearchStatus()),
} satisfies Partial<Record<RouteMethod, () => Promise<Response>>>;

export const Route = createFileRoute('/api/status')({
  server: { middleware: [authRequestMiddleware], handlers },
});
