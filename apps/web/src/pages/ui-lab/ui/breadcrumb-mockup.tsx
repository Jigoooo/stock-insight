import { Link } from '@tanstack/react-router';

import type { BreadcrumbPreviewId } from './location-navigation-catalog';
import type { RouteTabId } from './navigation-tabs-catalog';
import type { SideRouteId } from './side-navigation-catalog';
import styles from './location-navigation-catalog.module.css';

const breadcrumbItems = [
  { id: 'workspace', label: '워크스페이스' },
  { id: 'stocks', label: '종목' },
  { id: 'nvda', label: 'NVDA' },
  { id: 'evidence', label: '근거 기록' },
] as const;

export type BreadcrumbVariant = 'hairline' | 'soft-inset' | 'ledger';

export interface BreadcrumbMockupProps {
  active: BreadcrumbPreviewId;
  variant: BreadcrumbVariant;
  searchContext: {
    page: number;
    routeTab: RouteTabId;
    sideRoute: SideRouteId;
  };
}

export function BreadcrumbMockup({ active, searchContext, variant }: BreadcrumbMockupProps) {
  const activeIndex = breadcrumbItems.findIndex((item) => item.id === active);
  const visibleItems = breadcrumbItems.slice(0, activeIndex + 1);
  const collapsedItems =
    variant === 'ledger' && visibleItems.length > 2
      ? visibleItems.filter((_, index) => index !== 1)
      : visibleItems;
  const hasCollapsedItem = collapsedItems.length !== visibleItems.length;

  return (
    <nav aria-label={`Breadcrumb 비교 · ${variant}`} data-breadcrumb-variant={variant}>
      <ol className={styles.breadcrumbList}>
        {collapsedItems.map((item, index) => {
          const isCurrent = item.id === active;

          return (
            <li className={styles.breadcrumbItem} key={item.id}>
              {hasCollapsedItem && index === 1 ? (
                <>
                  <span className={styles.breadcrumbSeparator} aria-hidden="true">
                    /
                  </span>
                  <span className={styles.breadcrumbEllipsis}>
                    <span aria-hidden="true">…</span>
                    <span className="sr-only">중간 경로 1개 생략</span>
                  </span>
                </>
              ) : null}
              {index > 0 ? (
                <span className={styles.breadcrumbSeparator} aria-hidden="true">
                  {variant === 'ledger' ? '/' : '›'}
                </span>
              ) : null}
              {isCurrent ? (
                <span className={styles.breadcrumbCurrent} aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link
                  className={styles.breadcrumbLink}
                  search={{
                    'route-tab': searchContext.routeTab,
                    'side-route': searchContext.sideRoute,
                    breadcrumb: item.id,
                    page: searchContext.page,
                  }}
                  to="/__ui-lab"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
