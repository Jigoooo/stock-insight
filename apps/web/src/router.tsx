import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

import type { ResearchWorkspaceViewPayload } from '@/pages/research-workspace/model/load-research-workspace';
import { WorkspaceViewCache } from '@/pages/research-workspace/model/workspace-view-cache';

export type StockInsightRouterContext = {
  workspaceViewCache: WorkspaceViewCache<ResearchWorkspaceViewPayload>;
};

export function getRouter() {
  return createRouter({
    context: {
      workspaceViewCache: new WorkspaceViewCache<ResearchWorkspaceViewPayload>('anonymous'),
    },
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    defaultPendingMs: 200,
    defaultPendingComponent: RoutePending,
    scrollRestoration: true,
  });
}

function RoutePending() {
  return null;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
