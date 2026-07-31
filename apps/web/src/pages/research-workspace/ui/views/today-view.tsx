import { useRef, useState } from 'react';

import {
  confidenceLabel,
  formatDate,
  formatNumber,
  laneLabels,
  marketLabel,
  whySurfacedLabel,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/primitives';
import {
  AvailabilityNotice,
  MetricStrip,
  PageHeader,
  Panel,
  PanelHeader,
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
  onLaneChange,
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
  const laneTabRefs = useRef<Partial<Record<ResearchFeedLaneId, HTMLButtonElement | null>>>({});
  const [rovingIntent, setRovingIntent] = useState({ baseLane: lane, targetLane: lane });
  const rovingLane = rovingIntent.baseLane === lane ? rovingIntent.targetLane : lane;
  const setRovingLane = (nextLane: ResearchFeedLaneId) =>
    setRovingIntent({ baseLane: lane, targetLane: nextLane });
  const feedRef = useRef<HTMLDivElement>(null);
  useWorkspaceAppendReveal({
    keys: items.map((item) => item.recordKey),
    resetKey: lane,
    scopeRef: feedRef,
  });
  const moveLaneFocus = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const lastIndex = data.lanes.length - 1;
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextLane = data.lanes[nextIndex]?.lane;
    if (!nextLane) return;
    setRovingLane(nextLane);
    laneTabRefs.current[nextLane]?.focus({ preventScroll: true });
  };
  const activeLaneIndex = Math.max(
    0,
    data.lanes.findIndex((item) => item.lane === lane),
  );

  return (
    <>
      <PageHeader
        eyebrow={formatDate(data.meta.generatedAt)}
        title="오늘 봐야 할 변화"
        description="중요도와 개인 연결도를 분리해, 영향 경로와 근거 수준을 함께 보여줍니다."
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
          <h2>시장 인텔리전스</h2>
          <p>각 레코드는 하나의 분류에만 노출됩니다.</p>
        </PanelHeader>
        <div className={styles.laneTabs} role="tablist" aria-label="인사이트 분류">
          <span
            className={styles.laneIndicator}
            aria-hidden="true"
            style={{
              transform: `translate3d(calc(${activeLaneIndex * 100}% + ${activeLaneIndex * 24}px), 0, 0)`,
            }}
          />
          {data.lanes.map((item, index) => (
            <Button
              key={item.lane}
              id={`lane-tab-${item.lane}`}
              ref={(element) => {
                laneTabRefs.current[item.lane] = element;
              }}
              type="button"
              motion="quiet"
              role="tab"
              data-pending={pendingLane === item.lane || undefined}
              aria-busy={pendingLane === item.lane || undefined}
              aria-selected={lane === item.lane}
              aria-controls="research-feed-panel"
              tabIndex={rovingLane === item.lane ? 0 : -1}
              disabled={!interactive}
              onKeyDown={(event) => moveLaneFocus(event, index)}
              onClick={() => {
                setRovingLane(item.lane);
                onLaneChange(item.lane);
              }}
            >
              {laneLabels[item.lane]} <small>{item.scopeTotal}</small>
            </Button>
          ))}
        </div>
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
            items.map((item) => (
              <Button
                key={item.recordKey}
                type="button"
                motion="quiet"
                data-append-key={item.recordKey}
                data-testid="research-feed-record"
                className={styles.feedRow}
                aria-current={selectedRecordKey === item.recordKey}
                disabled={!interactive}
                onClick={() => onSelectRecord(item)}
              >
                <span className={styles.market}>{marketLabel(item.market)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{presentResearchSummary(item.summary)}</p>
                  <small>{whySurfacedLabel(item)}</small>
                </div>
                <div className={styles.rowMeta}>
                  <span>{confidenceLabel(item.confidence)}</span>
                  <time>{formatDate(item.publishedAt, true)}</time>
                </div>
              </Button>
            ))
          )}
        </div>
        {(nextCursor || cursorLoading || cursorError) && (
          <div className={styles.feedPager}>
            {cursorError && <span>다음 페이지를 불러오지 못했습니다.</span>}
            <Button
              type="button"
              motion="quiet"
              disabled={!interactive || cursorLoading || !nextCursor}
              onClick={onLoadMore}
            >
              {cursorLoading ? '불러오는 중' : cursorError ? '다시 시도' : '다음 변화 더 보기'}
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
