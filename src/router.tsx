import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
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
