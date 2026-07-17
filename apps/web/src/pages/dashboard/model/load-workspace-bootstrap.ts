import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@/server/auth/auth-middleware';

export const loadWorkspaceBootstrap = createServerFn({ method: 'GET' })
  .middleware([authFunctionMiddleware])
  .handler(async () => {
    const { loadWorkspaceBootstrapDirect } = await import('@/server/workspace-bootstrap');
    return loadWorkspaceBootstrapDirect();
  });
