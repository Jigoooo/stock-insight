import { BreadcrumbMockup, type BreadcrumbVariant } from './breadcrumb-mockup';
import styles from './location-navigation-catalog.module.css';
import type { RouteTabId } from './navigation-tabs-catalog';
import type { SideRouteId } from './side-navigation-catalog';

export type BreadcrumbPreviewId = 'workspace' | 'stocks' | 'nvda' | 'evidence';

export interface LocationNavigationCatalogProps {
  initialBreadcrumb: BreadcrumbPreviewId;
  initialPage: number;
  initialRouteTab: RouteTabId;
  initialSideRoute: SideRouteId;
}

const breadcrumbVariants: Array<{
  description: string;
  id: BreadcrumbVariant;
  label: string;
  title: string;
}> = [
  {
    id: 'hairline',
    label: 'A · Hairline Trail',
    title: '가벼운 경로선',
    description: '텍스트와 작은 구분선만 남겨 고밀도 화면에서도 현재 위치를 조용히 보여줍니다.',
  },
  {
    id: 'soft-inset',
    label: 'B · Soft Current',
    title: '낮은 현재 면',
    description: '현재 항목에만 낮은 선택 면을 적용해 경로의 마지막 위치를 빠르게 구분합니다.',
  },
  {
    id: 'ledger',
    label: 'C · Compact Ledger',
    title: '압축 원장',
    description: '긴 경로의 중간 항목을 줄이고 짧은 하단선으로 데이터 탐색 위치를 표시합니다.',
  },
];

export function LocationNavigationCatalog({
  initialBreadcrumb,
  initialPage,
  initialRouteTab,
  initialSideRoute,
}: LocationNavigationCatalogProps) {
  return (
    <section
      className={styles.catalog}
      aria-labelledby="location-navigation-title"
      data-breadcrumb={initialBreadcrumb}
      data-catalog="location-navigation"
      data-page={initialPage}
      data-route-tab={initialRouteTab}
      data-side-route={initialSideRoute}
    >
      <header className={styles.catalogHeader}>
        <div>
          <span>Batch 3C · Location Navigation</span>
          <h2 id="location-navigation-title">Breadcrumb · Pagination</h2>
        </div>
        <p>현재 위치와 데이터 탐색 범위를 실제 URL 의미를 보존하는 세 가지 방향으로 비교합니다.</p>
      </header>

      <section className={styles.comparison} aria-labelledby="breadcrumb-title">
        <header className={styles.comparisonHeading}>
          <span>01 · Breadcrumb</span>
          <div>
            <h3 id="breadcrumb-title">계층형 현재 위치</h3>
            <p>이전 항목은 실제 링크이고 마지막 항목은 현재 페이지로만 표시합니다.</p>
          </div>
        </header>

        <div className={styles.comparisonGrid}>
          {breadcrumbVariants.map((variant) => (
            <article className={styles.variantCard} key={variant.id}>
              <header>
                <span>{variant.label}</span>
                <h4>{variant.title}</h4>
                <p>{variant.description}</p>
              </header>
              <div className={styles.previewSurface}>
                <BreadcrumbMockup
                  active={initialBreadcrumb}
                  searchContext={{
                    page: initialPage,
                    routeTab: initialRouteTab,
                    sideRoute: initialSideRoute,
                  }}
                  variant={variant.id}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
