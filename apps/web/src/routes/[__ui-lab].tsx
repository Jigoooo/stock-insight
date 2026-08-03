import { createFileRoute, notFound, type SearchSchemaInput } from '@tanstack/react-router';

import type { BreadcrumbPreviewId } from '@/pages/ui-lab/ui/location-navigation-catalog';
import type { SideRouteId } from '@/pages/ui-lab/ui/side-navigation-catalog';
import { UiLabPage } from '@/pages/ui-lab/ui/ui-lab-page';
import { isDevSurfaceEnabled } from '@/shared/config/dev-surface-gate';

const routeTabs = ['overview', 'evidence', 'timeline'] as const;
const sideRoutes = ['today', 'holdings', 'themes'] as const;
const breadcrumbPreviews = ['workspace', 'stocks', 'nvda', 'evidence'] as const;

type UiLabSearchInput = SearchSchemaInput & {
  'route-tab'?: unknown;
  'side-route'?: unknown;
  breadcrumb?: unknown;
  page?: unknown;
};

function isRouteTab(value: unknown): value is (typeof routeTabs)[number] {
  return typeof value === 'string' && routeTabs.some((routeTab) => routeTab === value);
}

function isSideRoute(value: unknown): value is SideRouteId {
  return typeof value === 'string' && sideRoutes.some((sideRoute) => sideRoute === value);
}

function isBreadcrumbPreview(value: unknown): value is BreadcrumbPreviewId {
  return typeof value === 'string' && breadcrumbPreviews.some((breadcrumb) => breadcrumb === value);
}

function isPageNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
}

export const Route = createFileRoute('/__ui-lab')({
  validateSearch: (search: UiLabSearchInput) => ({
    'route-tab': isRouteTab(search['route-tab']) ? search['route-tab'] : 'overview',
    'side-route': isSideRoute(search['side-route']) ? search['side-route'] : 'today',
    breadcrumb: isBreadcrumbPreview(search.breadcrumb) ? search.breadcrumb : 'evidence',
    page: isPageNumber(search.page) ? search.page : 3,
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
    <UiLabPage
      initialBreadcrumb={search.breadcrumb}
      initialPage={search.page}
      initialRouteTab={search['route-tab']}
      initialSideRoute={search['side-route']}
    />
  );
}
