import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';
import { healthStatusSchema } from '@stock-insight/contracts';

// Liveness for the BFF process itself, NOT the brain. It must stay dependency
// free: an unauthenticated probe should report that this container is up even
// when the brain is unreachable, otherwise a brain outage would make the
// orchestrator restart a perfectly healthy web container.
const handlers = {
  GET: () =>
    jsonResponse(
      healthStatusSchema.parse({
        ok: true,
        service: 'stock-insight-web',
        checkedAt: new Date().toISOString(),
      }),
    ),
} satisfies Partial<Record<RouteMethod, () => Response>>;

export const Route = createFileRoute('/api/health')({
  server: {
    handlers,
  },
});
