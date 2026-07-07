import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';

import { getHealthStatus } from '@stock-insight/api';

const handlers = {
  GET: () => jsonResponse(getHealthStatus()),
} satisfies Partial<Record<RouteMethod, () => Response>>;

export const Route = createFileRoute('/api/health')({
  server: {
    handlers,
  },
});
