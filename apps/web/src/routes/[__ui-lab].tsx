import { createFileRoute, notFound } from '@tanstack/react-router';

import { UiLabPage } from '@/pages/ui-lab/ui/ui-lab-page';
import type { SideRouteId } from '@/pages/ui-lab/ui/side-navigation-catalog';
import { isDevSurfaceEnabled } from '@/shared/config/dev-surface-gate';

const routeTabs = ['overview', 'evidence', 'timeline'] as const;
const sideRoutes = ['today', 'holdings', 'themes'] as const;

function isRouteTab(value: unknown): value is (typeof routeTabs)[number] {
  return typeof value === 'string' && routeTabs.some((routeTab) => routeTab === value);
}

function isSideRoute(value: unknown): value is SideRouteId {
  return typeof value === 'string' && sideRoutes.some((sideRoute) => sideRoute === value);
}

export const Route = createFileRoute('/__ui-lab')({
  validateSearch: (search: Record<string, unknown>) => ({
    'route-tab': isRouteTab(search['route-tab']) ? search['route-tab'] : 'overview',
    'side-route': isSideRoute(search['side-route']) ? search['side-route'] : 'today',
  }),
  beforeLoad: () => {
    if (!isDevSurfaceEnabled(import.meta.env.DEV, import.meta.env.VITE_ENABLE_UI_LAB)) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'UI Lab | Stock Insight' }] }),
  component: UiLabRoute,
});

function UiLabRoute() {
  const search = Route.useSearch();

  return (
    <UiLabPage initialRouteTab={search['route-tab']} initialSideRoute={search['side-route']} />
  );
}
