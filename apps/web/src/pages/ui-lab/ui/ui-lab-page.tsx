import { useState } from 'react';

import { CompletedComponentsCatalog } from './completed-components-catalog';
import { InputActionCatalog } from './input-action-catalog';
import { LocationNavigationCatalog, type BreadcrumbPreviewId } from './location-navigation-catalog';
import { NavigationTabsCatalog, type RouteTabId } from './navigation-tabs-catalog';
import { SideNavigationCatalog, type SideRouteId } from './side-navigation-catalog';
import { StepperCommandCatalog } from './stepper-command-catalog';
import styles from './ui-lab-page.module.css';

import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/tabs';

const futureBatches = [
  'DropdownMenu · ContextMenu · Popover',
  'Drawer · Sheet · BottomSheet',
  'Avatar · Badge · Status',
  'List · Timeline · Carousel',
  'DataGrid · Progress · Skeleton',
  'ChartFrame · Market Tape · Evidence Band · Candle Ledger',
];

interface UiLabPageProps {
  initialBreadcrumb: BreadcrumbPreviewId;
  initialPage: number;
  initialRouteTab: RouteTabId;
  initialSideRoute: SideRouteId;
}

export function UiLabPage({
  initialBreadcrumb,
  initialPage,
  initialRouteTab,
  initialSideRoute,
}: UiLabPageProps) {
  const [activeStatus, setActiveStatus] = useState('completed');

  return (
    <main className={styles.page} data-testid="ui-lab-page">
      <section className={styles.shell} aria-labelledby="ui-lab-title">
        <header className={styles.header}>
          <p className={styles.kicker}>Market Graphite</p>
          <h1 id="ui-lab-title">Stock Insight UI Lab</h1>
          <p>제품 화면과 분리된 공용 컴포넌트 목업 비교 공간입니다.</p>
        </header>
        <Tabs
          className={styles.statusTabs}
          fullWidth
          value={activeStatus}
          variant="soft-inset"
          onValueChange={setActiveStatus}
        >
          <TabsHighlight>
            <TabsList aria-label="UI Lab 진행 상태" className={styles.statusTabList}>
              <TabsHighlightItem value="completed">
                <TabsTrigger className={styles.statusTab} value="completed">
                  완료
                </TabsTrigger>
              </TabsHighlightItem>
              <TabsHighlightItem value="in-progress">
                <TabsTrigger className={styles.statusTab} value="in-progress">
                  목업 진행 중
                </TabsTrigger>
              </TabsHighlightItem>
              <TabsHighlightItem value="planned">
                <TabsTrigger className={styles.statusTab} value="planned">
                  예정
                </TabsTrigger>
              </TabsHighlightItem>
            </TabsList>
          </TabsHighlight>

          <TabsContents>
            <TabsContent value="completed">
              <div className={styles.statusIntro}>
                <span>Completed</span>
                <h2>확정·공용화 완료</h2>
                <p>승인된 공용 컴포넌트와 이전 내비게이션 묶음을 다시 확인합니다.</p>
              </div>
              <CompletedComponentsCatalog />
              <InputActionCatalog />
              <NavigationTabsCatalog initialRouteTab={initialRouteTab} />
              <SideNavigationCatalog
                initialRouteTab={initialRouteTab}
                initialSideRoute={initialSideRoute}
              />
              <LocationNavigationCatalog
                initialBreadcrumb={initialBreadcrumb}
                initialPage={initialPage}
                initialRouteTab={initialRouteTab}
                initialSideRoute={initialSideRoute}
              />
            </TabsContent>

            <TabsContent value="in-progress">
              <div className={styles.statusIntro}>
                <span>In progress</span>
                <h2>Stepper · CommandPalette</h2>
                <p>단계 진행과 빠른 명령 탐색을 세 가지 정보 밀도로 비교합니다.</p>
              </div>
              <StepperCommandCatalog />
            </TabsContent>

            <TabsContent value="planned">
              <div className={styles.statusIntro}>
                <span>Planned</span>
                <h2>다음 비교 묶음</h2>
                <p>현재 묶음 승인 후 순서대로 목업을 준비합니다.</p>
              </div>
              <div className={styles.grid} aria-label="향후 배치">
                {futureBatches.map((batch, index) => (
                  <article className={styles.placeholder} key={batch}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{batch}</strong>
                    <small>향후 배치에서 시안을 비교합니다.</small>
                  </article>
                ))}
              </div>
            </TabsContent>
          </TabsContents>
        </Tabs>
      </section>
    </main>
  );
}
