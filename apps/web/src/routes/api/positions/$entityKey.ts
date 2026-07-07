import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { handlePositionClose } from '@/server/manual-portfolio';

type PositionRouteContext = {
  params: {
    entityKey: string;
  };
};

const handlers = {
  DELETE: async ({ params }: PositionRouteContext) => handlePositionClose(params.entityKey),
} satisfies Partial<Record<RouteMethod, ({ params }: PositionRouteContext) => Promise<Response>>>;

export const Route = createFileRoute('/api/positions/$entityKey')({
  server: {
    handlers,
  },
});
