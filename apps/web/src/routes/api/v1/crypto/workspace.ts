import { createFileRoute } from '@tanstack/react-router';
import type { RouteMethod } from '@tanstack/react-start';
import '@tanstack/react-start/server-only';

import { createCryptoWorkspaceGetHandler } from '@/server/crypto-workspace-request-handler';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from '@/server/request-scope';
import { loadCryptoResearchWorkspace } from '@/server/research-workspace';

const handlers = {
  GET: createCryptoWorkspaceGetHandler({
    resolveUserId: resolveRequestUserId,
    loadWorkspace: loadCryptoResearchWorkspace,
    isRequestScopeError: (error) => error instanceof RequestScopeError,
    unauthorizedResponse: unauthorizedScopeResponse,
  }),
} satisfies Partial<Record<RouteMethod, ({ request }: { request: Request }) => Promise<Response>>>;

export const Route = createFileRoute('/api/v1/crypto/workspace')({
  server: { handlers },
});
