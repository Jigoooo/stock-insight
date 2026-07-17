import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { jsonResponse } from '@/server/http';
import { loadResearchWorkspace } from '@/server/research-workspace';

const handlers = {
  GET: async () => jsonResponse(await loadResearchWorkspace()),
} satisfies Partial<Record<RouteMethod, () => Promise<Response>>>;

export const Route = createFileRoute('/api/workspace')({
  server: { middleware: [authRequestMiddleware], handlers },
});
