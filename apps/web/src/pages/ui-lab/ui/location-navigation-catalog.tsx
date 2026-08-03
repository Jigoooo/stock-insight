import { useState } from 'react';

import { BreadcrumbMockup, type BreadcrumbVariant } from './breadcrumb-mockup';
import styles from './location-navigation-catalog.module.css';
import type { RouteTabId } from './navigation-tabs-catalog';
import { PaginationMockup, type PaginationVariant } from './pagination-mockup';
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

const paginationVariants: Array<{
  description: string;
  id: PaginationVariant;
  label: string;
  title: string;
}> = [
  {
    id: 'hairline',
    label: 'A · Hairline Index',
    title: '가벼운 숫자선',
    description: '구분선과 숫자만 남겨 긴 리서치 목록에서도 탐색 위치를 조용히 유지합니다.',
  },
  {
    id: 'soft-inset',
    label: 'B · Soft Inset',
    title: '움직이는 현재 면',
    description: '현재 페이지의 낮은 선택 면이 이동해 숫자 탐색의 변화를 자연스럽게 연결합니다.',
  },
  {
    id: 'ledger',
    label: 'C · Ledger Cursor',
    title: '원장과 기록 커서',
    description:
      '숫자 페이지 상태와 다음 기록을 불러오는 cursor 상태를 서로 다른 정보로 보여줍니다.',
  },
];

export function LocationNavigationCatalog({
  initialBreadcrumb,
  initialPage,
  initialRouteTab,
  initialSideRoute,
}: LocationNavigationCatalogProps) {
  const [activeBreadcrumb, setActiveBreadcrumb] = useState(initialBreadcrumb);
  const [activePage, setActivePage] = useState(initialPage);

  return (
    <section
      className={styles.catalog}
      aria-labelledby="location-navigation-title"
      data-breadcrumb={activeBreadcrumb}
      data-catalog="location-navigation"
      data-page={activePage}
      data-route-tab={initialRouteTab}
      data-side-route={initialSideRoute}
    >
      <header className={styles.catalogHeader}>
        <div>
          <span>Batch 3C · Location Navigation</span>
          <h2 id="location-navigation-title">Breadcrumb · Pagination</h2>
        </div>
        <p>현재 위치와 데이터 탐색 범위를 화면 이동 없이 선택해 세 가지 방향으로 비교합니다.</p>
      </header>

      <section className={styles.comparison} aria-labelledby="breadcrumb-title">
        <header className={styles.comparisonHeading}>
          <span>01 · Breadcrumb</span>
          <div>
            <h3 id="breadcrumb-title">계층형 현재 위치</h3>
            <p>항목을 선택하면 세 시안의 현재 위치가 같은 화면에서 함께 바뀝니다.</p>
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
                  active={activeBreadcrumb}
                  onSelect={setActiveBreadcrumb}
                  variant={variant.id}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.comparison} aria-labelledby="pagination-title">
        <header className={styles.comparisonHeading}>
          <span>02 · Pagination</span>
          <div>
            <h3 id="pagination-title">숫자 페이지와 기록 커서</h3>
            <p>고정된 전체 페이지 탐색과 전체 수를 알 수 없는 다음 기록 상태를 분리합니다.</p>
          </div>
        </header>

        <div className={styles.comparisonGrid}>
          {paginationVariants.map((variant) => (
            <article className={styles.variantCard} key={variant.id}>
              <header>
                <span>{variant.label}</span>
                <h4>{variant.title}</h4>
                <p>{variant.description}</p>
              </header>
              <div className={styles.previewSurface}>
                <PaginationMockup
                  currentPage={activePage}
                  onPageChange={setActivePage}
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
