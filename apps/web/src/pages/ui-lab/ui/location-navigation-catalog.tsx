import type { RouteTabId } from './navigation-tabs-catalog';
import type { SideRouteId } from './side-navigation-catalog';

export type BreadcrumbPreviewId = 'workspace' | 'stocks' | 'nvda' | 'evidence';

export interface LocationNavigationCatalogProps {
  initialBreadcrumb: BreadcrumbPreviewId;
  initialPage: number;
  initialRouteTab: RouteTabId;
  initialSideRoute: SideRouteId;
}

export function LocationNavigationCatalog({
  initialBreadcrumb,
  initialPage,
  initialRouteTab,
  initialSideRoute,
}: LocationNavigationCatalogProps) {
  return (
    <section
      aria-labelledby="location-navigation-title"
      data-breadcrumb={initialBreadcrumb}
      data-catalog="location-navigation"
      data-page={initialPage}
      data-route-tab={initialRouteTab}
      data-side-route={initialSideRoute}
    >
      <h2 id="location-navigation-title">Breadcrumb · Pagination</h2>
    </section>
  );
}
