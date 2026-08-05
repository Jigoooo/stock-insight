import { useRef } from 'react';

import styles from '../feed-ledger.module.css';
import {
  confidenceLabel,
  formatDate,
  formatNumber,
  laneLabels,
  marketLabel,
  whySurfacedLabel,
} from '../research-workspace-page';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/button';
import {
  CursorPagination,
  CursorPaginationAction,
  CursorPaginationMessage,
} from '@/shared/ui/pagination';
import { Tabs, TabsHighlight, TabsHighlightItem, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import {
  AvailabilityNotice,
  MetricStrip,
  PageHeader,
  Panel,
  PanelHeader,
  StructuredList,
  WorkspaceState,
} from '@/shared/ui/workspace';
import type {
  ResearchFeedItem,
  ResearchFeedLaneId,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export function TodayView({
  data,
  interactive,
  lane,
  pendingLane,
  items,
  nextCursor,
  cursorLoading,
  cursorError,
  selectedRecordKey,
  onLaneChange: onLaneChangeProp,
  onLoadMore,
  onSelectRecord,
}: {
  data: WorkspaceToday;
  interactive: boolean;
  lane: ResearchFeedLaneId;
  pendingLane?: ResearchFeedLaneId | null;
  items: ResearchFeedItem[];
  nextCursor: string | null;
  cursorLoading: boolean;
  cursorError: boolean;
  selectedRecordKey?: string;
  onLaneChange: (lane: ResearchFeedLaneId) => void;
  onLoadMore: () => void;
  onSelectRecord: (item: ResearchFeedItem) => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  useWorkspaceAppendReveal({
    keys: items.map((item) => item.recordKey),
    resetKey: lane,
    scopeRef: feedRef,
  });
  const onLaneChange = (nextLane: string) => {
    if (data.lanes.some((item) => item.lane === nextLane)) {
      onLaneChangeProp(nextLane as ResearchFeedLaneId);
    }
  };

  return (
    <>
      <PageHeader
        title="오늘 봐야 할 변화"
        description="중요도·개인 연결·근거 수준을 함께 확인합니다."
        asOf={data.meta.contentSnapshot.analysisCutoffAt}
      />
      <AvailabilityNotice availability={data.meta.freshness} />
      <MetricStrip
        label="데이터 현황"
        items={[
          { label: '오늘의 신호', value: data.summary.laneItemCount },
          { label: '관계 경로', value: formatNumber(data.summary.relationCount) },
          { label: '관심종목', value: data.summary.watchlistCount },
          { label: '연결 출처', value: data.summary.sourceCount },
        ]}
      />
      <Panel>
        <PanelHeader
          meta={`${data.meta.sourceCoverage.clickable}/${data.meta.sourceCoverage.total} 출처 연결`}
        >
          <h2>시장 변화</h2>
        </PanelHeader>
        <Tabs
          fullWidth
          value={lane}
          variant="sliding-underline"
          onValueChange={onLaneChange}
          activationMode="manual"
        >
          <TabsHighlight>
            <TabsList className={styles.laneTabs} aria-label="인사이트 분류">
              {data.lanes.map((item) => (
                <TabsHighlightItem key={item.lane} value={item.lane}>
                  <TabsTrigger
                    id={`lane-tab-${item.lane}`}
                    type="button"
                    value={item.lane}
                    className={styles.laneTab}
                    data-pending={pendingLane === item.lane || undefined}
                    aria-busy={pendingLane === item.lane || undefined}
                    aria-controls="research-feed-panel"
                    disabled={!interactive}
                  >
                    {laneLabels[item.lane]} <small>{item.scopeTotal}</small>
                  </TabsTrigger>
                </TabsHighlightItem>
              ))}
            </TabsList>
          </TabsHighlight>
        </Tabs>
        <div
          ref={feedRef}
          id="research-feed-panel"
          className={styles.feed}
          data-testid="research-feed"
          role="tabpanel"
          aria-labelledby={`lane-tab-${lane}`}
        >
          {items.length === 0 ? (
            <WorkspaceState
              kind="empty"
              title="이 분류에는 아직 변화가 없습니다"
              description="다른 분류를 확인하거나 새 신호가 들어올 때 다시 살펴보세요."
            />
          ) : (
            <StructuredList className={styles.feedList} aria-label="오늘의 시장 변화">
              {items.map((item) => (
                <li key={item.recordKey}>
                  <Button
                    type="button"
                    motion="quiet"
                    data-append-key={item.recordKey}
                    data-testid="research-feed-record"
                    className={styles.feedRow}
                    aria-current={selectedRecordKey === item.recordKey}
                    disabled={!interactive}
                    onClick={() => onSelectRecord(item)}
                  >
                    <span className={styles.feedRowLayout}>
                      <span className={styles.market}>{marketLabel(item.market)}</span>
                      <span>
                        <strong>{item.title}</strong>
                        <span className={styles.summary}>
                          {presentResearchSummary(item.summary)}
                        </span>
                        <small>{whySurfacedLabel(item)}</small>
                      </span>
                      <span className={styles.rowMeta}>
                        <span>{confidenceLabel(item.confidence)}</span>
                        <time>{formatDate(item.publishedAt, true)}</time>
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </StructuredList>
          )}
        </div>
        {(nextCursor || cursorLoading || cursorError) && (
          <CursorPagination>
            {cursorError && (
              <CursorPaginationMessage>다음 페이지를 불러오지 못했습니다.</CursorPaginationMessage>
            )}
            <CursorPaginationAction
              disabled={!interactive || cursorLoading || !nextCursor}
              onClick={onLoadMore}
            >
              {cursorLoading ? '불러오는 중' : cursorError ? '다시 시도' : '다음 변화 더 보기'}
            </CursorPaginationAction>
          </CursorPagination>
        )}
      </Panel>
    </>
  );
}
