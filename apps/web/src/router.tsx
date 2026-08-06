import './zod-jitless';

import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

import {
  AuthenticatedSessionCache,
  type AuthenticatedSession,
} from '@/pages/auth/model/authenticated-session-cache';
import type { ResearchWorkspaceViewPayload } from '@/pages/research-workspace/model/load-research-workspace';
import { WorkspaceViewCache } from '@/pages/research-workspace/model/workspace-view-cache';
import { RoutePendingScreen } from '@/shared/ui/route-status';

export type StockInsightRouterContext = {
  authenticatedSessionCache: AuthenticatedSessionCache<AuthenticatedSession>;
  workspaceViewCache: WorkspaceViewCache<ResearchWorkspaceViewPayload>;
};

export function getRouter() {
  return createRouter({
    context: {
      authenticatedSessionCache: new AuthenticatedSessionCache<AuthenticatedSession>(),
      workspaceViewCache: new WorkspaceViewCache<ResearchWorkspaceViewPayload>('anonymous'),
    },
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    defaultPendingMs: 200,
    defaultPendingComponent: RoutePendingScreen,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
