import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { authRequestMiddleware } from '@/server/auth/auth-middleware';
import { handlePositionClose } from '@/server/manual-portfolio';

type PositionRouteContext = {
  request: Request;
  params: {
    entityKey: string;
  };
};

const handlers = {
  DELETE: async ({ request, params }: PositionRouteContext) =>
    handlePositionClose(request, params.entityKey),
} satisfies Partial<Record<RouteMethod, (context: PositionRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/positions/$entityKey')({
  server: {
    middleware: [authRequestMiddleware],
    handlers,
  },
});
