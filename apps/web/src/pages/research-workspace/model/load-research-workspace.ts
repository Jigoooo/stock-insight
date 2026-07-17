import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@/server/auth/auth-middleware';

export const loadResearchWorkspaceInitial = createServerFn({ method: 'GET' })
  .middleware([authFunctionMiddleware])
  .handler(async () => {
    const { loadResearchWorkspaceInitial: loadDirect } =
      await import('@/server/research-workspace');
    return loadDirect();
  });
