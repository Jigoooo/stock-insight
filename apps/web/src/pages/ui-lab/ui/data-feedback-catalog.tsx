import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import styles from './data-feedback-catalog.module.css';
import { DataFeedbackGridPreview, initialDataGridWidths } from './data-feedback-grid-preview';
import {
  createDataRows,
  dataFeedbackTabs,
  dataFeedbackVariants,
  type DataFeedbackTabId,
  type DataFeedbackVariant,
  type DataColumnKey,
  type SortState,
} from './data-feedback-model';
import {
  DataFeedbackStatePreview,
  type LoadingPreviewState,
  type RecoveryState,
} from './data-feedback-state-previews';
import { DataFeedbackTablePreview } from './data-feedback-table-preview';

import {
  Tabs,
  TabsContent,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/tabs';

export function VariantCard({
  children,
  component,
  variant,
}: {
  children: ReactNode;
  component: DataFeedbackTabId;
  variant: DataFeedbackVariant;
}): ReactElement {
  return (
    <article className={styles.variantCard} data-component={component} data-variant={variant.id}>
      <header className={styles.variantHeader}>
        <span>{variant.label}</span>
        <p>{variant.description}</p>
      </header>
      <div className={styles.preview}>{children}</div>
    </article>
  );
}

export function DataFeedbackCatalog(): ReactElement {
  const [activeTab, setActiveTab] = useState<DataFeedbackTabId>('table');
  const [tableRows] = useState(() => createDataRows(6));
  const [tableSort, setTableSort] = useState<SortState>({ key: 'ticker', direction: 'none' });
  const [selectedTableIds, setSelectedTableIds] = useState<readonly string[]>([]);
  const [expandedTableId, setExpandedTableId] = useState<string>();
  const [gridRows, setGridRows] = useState(() => createDataRows(1_000));
  const [gridSort, setGridSort] = useState<SortState>({ key: 'ticker', direction: 'none' });
  const [selectedGridIds, setSelectedGridIds] = useState<readonly string[]>([]);
  const [showGridColumnBorders, setShowGridColumnBorders] = useState(false);
  const [columnWidths, setColumnWidths] =
    useState<Record<DataColumnKey, number>>(initialDataGridWidths);
  const progressSteps = [0, 36, 68, 100] as const;
  const [progressIndex, setProgressIndex] = useState(0);
  const [loadingState, setLoadingState] = useState<LoadingPreviewState>('idle');
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('idle');
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  useEffect(() => {
    if (loadingState !== 'pending') return;
    const timeout = window.setTimeout(() => {
      setLoadingState('complete');
      setPoliteMessage('리서치 데이터 불러오기를 완료했습니다');
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [loadingState]);

  useEffect(() => {
    if (recoveryState !== 'retrying') return;
    const timeout = window.setTimeout(() => {
      setRecoveryState('recovered');
      setAssertiveMessage('데이터 연결이 복구됨');
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [recoveryState]);

  return (
    <section
      aria-labelledby="data-feedback-title"
      className={styles.catalog}
      data-slot="data-feedback-catalog"
    >
      <header className={styles.catalogHeader}>
        <div>
          <span>06 · Data & Feedback</span>
          <h2 id="data-feedback-title">데이터 상태와 피드백을 따로 비교</h2>
        </div>
        <p>정렬·선택·편집 규칙은 공유하고, 각 컴포넌트의 A/B/C 표현을 독립적으로 확인합니다.</p>
      </header>

      <Tabs
        className={styles.componentTabs}
        value={activeTab}
        variant="sliding-underline"
        onValueChange={(value) => setActiveTab(value as DataFeedbackTabId)}
      >
        <TabsHighlight className={styles.componentTabViewport}>
          <TabsList
            aria-label="Data & Feedback 공용 컴포넌트 종류"
            className={styles.componentTabList}
            data-slot="data-feedback-tabs"
          >
            {dataFeedbackTabs.map((tab) => (
              <TabsHighlightItem value={tab.id} key={tab.id}>
                <TabsTrigger className={styles.componentTab} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              </TabsHighlightItem>
            ))}
          </TabsList>
        </TabsHighlight>

        <div className={styles.componentTabContents} data-slot="data-feedback-contents">
          {dataFeedbackTabs.map((tab) => (
            <TabsContent value={tab.id} key={tab.id}>
              <div className={styles.variantGrid}>
                {dataFeedbackVariants[tab.id].map((variant) => (
                  <VariantCard component={tab.id} variant={variant} key={variant.id}>
                    {tab.id === 'table' ? (
                      <DataFeedbackTablePreview
                        expandedId={expandedTableId}
                        rows={tableRows}
                        selectedIds={selectedTableIds}
                        sort={tableSort}
                        variantId={variant.id}
                        onExpandedIdChange={setExpandedTableId}
                        onSelectedIdsChange={setSelectedTableIds}
                        onSortChange={setTableSort}
                      />
                    ) : tab.id === 'data-grid' ? (
                      <DataFeedbackGridPreview
                        columnWidths={columnWidths}
                        rows={gridRows}
                        selectedIds={selectedGridIds}
                        showColumnBorders={showGridColumnBorders}
                        sort={gridSort}
                        variantId={variant.id}
                        onColumnWidthsChange={setColumnWidths}
                        onRowsChange={setGridRows}
                        onSelectedIdsChange={setSelectedGridIds}
                        onShowColumnBordersChange={setShowGridColumnBorders}
                        onSortChange={setGridSort}
                      />
                    ) : (
                      <DataFeedbackStatePreview
                        component={tab.id}
                        loadingState={loadingState}
                        progress={progressSteps[progressIndex]!}
                        recoveryState={recoveryState}
                        statusMessage={politeMessage}
                        variantId={variant.id}
                        onAdvanceProgress={() => {
                          const nextIndex = (progressIndex + 1) % progressSteps.length;
                          setProgressIndex(nextIndex);
                          setPoliteMessage(`진행률 ${progressSteps[nextIndex]}%`);
                        }}
                        onClearEmpty={() => setPoliteMessage('필터 초기화됨')}
                        onRetryError={() => {
                          setRecoveryState('retrying');
                          setAssertiveMessage('데이터 연결 다시 시도 중');
                        }}
                        onStartLoading={() => {
                          setLoadingState('pending');
                          setPoliteMessage('리서치 데이터 불러오기를 시작했습니다');
                        }}
                      />
                    )}
                  </VariantCard>
                ))}
              </div>
            </TabsContent>
          ))}
        </div>
      </Tabs>

      <p className={styles.liveRegion} aria-live="polite" data-slot="data-feedback-status">
        {politeMessage}
      </p>
      <p className={styles.liveRegion} data-slot="data-feedback-alert" role="alert">
        {assertiveMessage}
      </p>
    </section>
  );
}
