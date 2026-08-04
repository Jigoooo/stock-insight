import { useState, type ReactElement, type ReactNode } from 'react';

import styles from './data-feedback-catalog.module.css';
import {
  DataFeedbackGridPreview,
  initialDataGridWidths,
} from './data-feedback-grid-preview';
import {
  createDataRows,
  dataFeedbackTabs,
  dataFeedbackVariants,
  type DataFeedbackTabId,
  type DataFeedbackVariant,
  type DataColumnKey,
  type SortState,
} from './data-feedback-model';
import { DataFeedbackTablePreview } from './data-feedback-table-preview';

import {
  Tabs,
  TabsContent,
  TabsContents,
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
  const [columnWidths, setColumnWidths] =
    useState<Record<DataColumnKey, number>>(initialDataGridWidths);

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
        <p>
          정렬·선택·편집 규칙은 공유하고, 각 컴포넌트의 A/B/C 표현을 독립적으로
          확인합니다.
        </p>
      </header>

      <Tabs
        className={styles.componentTabs}
        value={activeTab}
        variant="sliding-underline"
        onValueChange={(value) => setActiveTab(value as DataFeedbackTabId)}
      >
        <TabsHighlight className={styles.componentTabViewport}>
          <TabsList
            aria-label="Data & Feedback 목업 종류"
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

        <TabsContents>
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
                        sort={gridSort}
                        variantId={variant.id}
                        onColumnWidthsChange={setColumnWidths}
                        onRowsChange={setGridRows}
                        onSelectedIdsChange={setSelectedGridIds}
                        onSortChange={setGridSort}
                      />
                    ) : (
                      <div className={styles.previewPlaceholder}>상호작용 목업 구현 중</div>
                    )}
                  </VariantCard>
                ))}
              </div>
            </TabsContent>
          ))}
        </TabsContents>
      </Tabs>

      <p className={styles.liveRegion} aria-live="polite" data-slot="data-feedback-status" />
    </section>
  );
}
