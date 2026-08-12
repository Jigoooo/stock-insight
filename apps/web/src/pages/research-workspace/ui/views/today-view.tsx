import { useRef } from 'react';

import styles from '../feed-ledger.module.css';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';
import {
  confidenceLabel,
  formatDate,
  formatNumber,
  laneLabels,
  marketLabel,
  whySurfacedLabel,
} from '../workspace-presenters';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { deriveTodayBriefing } from '@/pages/research-workspace/model/today-briefing';
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

type SelectRecord = (item: ResearchFeedItem, opener: HTMLButtonElement) => void;

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
  onSelectRecord: SelectRecord;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const indicators = data.marketIndicators;
  const { headlineItems, curatedItems, listItems, connectionItems } = deriveTodayBriefing(
    data,
    items,
  );
  useWorkspaceAppendReveal({
    keys: listItems.map((item) => item.recordKey),
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
        title="오늘의 투자 브리핑"
        description="시장 변화가 내 관심종목과 어떻게 이어지는지, 확인할 근거와 함께 살펴봅니다."
        asOf={data.meta.contentSnapshot.analysisCutoffAt}
      />
      <AvailabilityNotice availability={data.meta.freshness} />

      <Panel
        className={styles.todayPanel}
        data-testid="today-market-summary"
        aria-labelledby="today-market-summary-title"
      >
        {/*
          정본 01 §2 가 요구하는 금리·FX·원자재·정책 네 축이다. 이 자리는
          KOSPI·NASDAQ·금 세 줄의 **샘플**이었는데, 그 값들은 우리가 수집하지 않는
          것이고 정본이 요구한 축도 아니었다. 실제로 수집되는 것이 정본 축과 정확히
          겹쳐서, 만들 것은 수집기가 아니라 배선이었다.

          정직성 기계는 그대로 둔다 — 행마다 상태와 근거를 함께 적는다. 바뀐 것은
          "이 화면은 예시입니다" 가 "이 값은 언제 관측된 무엇입니다" 로 바뀐 것뿐이다.
        */}
        <PanelHeader meta={`${indicators.length}개 지표`}>
          <h2 id="today-market-summary-title">오늘의 시장 요약</h2>
          <p>금리·환율·원자재·정책 금리를 관측 시각과 함께 봅니다.</p>
        </PanelHeader>
        {indicators.length === 0 ? (
          <p className={styles.marketSummaryEmpty}>
            표시할 거시 지표를 불러오지 못했습니다. 아래 항목은 영향을 받지 않습니다.
          </p>
        ) : (
          <ul className={styles.marketSummaryList} aria-label="오늘의 주요 시장 지표">
            {indicators.map((item) => (
              <li key={item.key} data-availability={item.availability}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                {item.changeLabel ? (
                  <small data-direction={item.direction}>{item.changeLabel}</small>
                ) : null}
                <em>{item.basisLabel}</em>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        className={styles.todayPanel}
        data-testid="today-headline-news"
        aria-labelledby="today-headline-news-title"
      >
        <PanelHeader meta={`${headlineItems.length}건`}>
          <h2 id="today-headline-news-title">핵심 카드 뉴스</h2>
          <p>오늘 먼저 읽을 변화와 나에게 보인 이유를 함께 정리했습니다.</p>
        </PanelHeader>
        {headlineItems.length === 0 ? (
          <WorkspaceState
            kind="empty"
            title="오늘 먼저 볼 핵심 뉴스가 아직 없습니다"
            description="새 분석이 들어오면 중요도와 근거를 확인해 이곳에 정리합니다."
          />
        ) : (
          <ul className={styles.headlineGrid} aria-label="오늘의 핵심 카드 뉴스">
            {headlineItems.map((item) => (
              <li key={item.recordKey}>
                <Button
                  type="button"
                  motion="quiet"
                  className={styles.headlineCard}
                  aria-current={selectedRecordKey === item.recordKey}
                  disabled={!interactive}
                  onClick={(event) => onSelectRecord(item, event.currentTarget)}
                >
                  <span className={styles.headlineCardContent}>
                    <span className={styles.headlineMeta}>
                      <span className={styles.market}>{marketLabel(item.market)}</span>
                      <time>{formatDate(item.publishedAt, true)}</time>
                    </span>
                    <strong>{item.title}</strong>
                    <span className={styles.headlineSummary}>
                      {presentResearchSummary(item.summary)}
                    </span>
                    <small>{whySurfacedLabel(item)}</small>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        className={styles.todayPanel}
        data-testid="today-curated-news"
        aria-labelledby="today-curated-news-title"
      >
        <PanelHeader meta={`관심종목 ${formatNumber(data.summary.watchlistCount)}개`}>
          <h2 id="today-curated-news-title">내 관심종목 큐레이터 뉴스</h2>
          <p>관심종목과 직접 또는 가까운 관계로 연결된 소식입니다.</p>
        </PanelHeader>
        {curatedItems.length === 0 ? (
          <WorkspaceState
            kind="empty"
            title="원문을 확인할 수 있는 관심종목 뉴스가 아직 없습니다"
            description={
              data.summary.watchlistCount > 0
                ? '관심종목 연결 변화는 아래 분류에서 확인할 수 있으며, 원문 링크가 확인된 뉴스만 이 영역에 표시합니다.'
                : '내 종목에서 관심종목을 등록하면 관련 변화를 모아볼 수 있습니다.'
            }
          />
        ) : (
          <StructuredList className={styles.curatedList} aria-label="내 관심종목 큐레이터 뉴스">
            {curatedItems.map((item) => (
              <li key={item.recordKey}>
                <NewsRowButton
                  item={item}
                  interactive={interactive}
                  selected={selectedRecordKey === item.recordKey}
                  onSelect={onSelectRecord}
                />
              </li>
            ))}
          </StructuredList>
        )}
      </Panel>

      <Panel
        className={styles.todayPanel}
        data-testid="today-news-list"
        aria-labelledby="today-news-list-title"
      >
        <PanelHeader
          meta={`${data.meta.sourceCoverage.clickable}/${data.meta.sourceCoverage.total} 출처 연결`}
        >
          <h2 id="today-news-list-title">더 살펴볼 뉴스</h2>
          <p>분류를 바꿔가며 나머지 시장 변화를 이어서 확인합니다.</p>
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
          {listItems.length === 0 ? (
            <WorkspaceState
              kind="empty"
              title="이 분류에서 더 살펴볼 뉴스가 없습니다"
              description="핵심 카드와 큐레이터 뉴스에 먼저 정리했거나 새 신호를 기다리고 있습니다."
            />
          ) : (
            <StructuredList className={styles.feedList} aria-label="더 살펴볼 시장 변화">
              {listItems.map((item) => (
                <li key={item.recordKey}>
                  <NewsRowButton
                    item={item}
                    interactive={interactive}
                    selected={selectedRecordKey === item.recordKey}
                    appendKey={item.recordKey}
                    onSelect={onSelectRecord}
                  />
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

      <Panel
        className={styles.todayPanel}
        data-testid="today-connection-summary"
        aria-labelledby="today-connection-summary-title"
      >
        <PanelHeader
          meta={`${formatNumber(data.summary.relationCount)}개 경로 · ${formatNumber(data.summary.sourceCount)}개 출처`}
        >
          <h2 id="today-connection-summary-title">시장 연결 경로와 확인할 리스크</h2>
          <p>뉴스가 내 관심영역에 이어지는 이유와 추가로 확인할 지점입니다.</p>
        </PanelHeader>
        <MetricStrip
          label="개인화 연결 현황"
          items={[
            { label: '관계 경로', value: formatNumber(data.summary.relationCount) },
            { label: '관심종목', value: formatNumber(data.summary.watchlistCount) },
            { label: '연결 출처', value: formatNumber(data.summary.sourceCount) },
            { label: '오늘의 신호', value: formatNumber(data.summary.laneItemCount) },
          ]}
        />
        {data.summary.relationCount === 0 || connectionItems.length === 0 ? (
          <WorkspaceState
            kind="empty"
            title="연결 경로가 아직 계산되지 않았습니다"
            description="관계 분석이 준비되면 영향 경로와 근거 수준을 함께 표시합니다."
          />
        ) : (
          <StructuredList className={styles.connectionList} aria-label="시장 연결 경로 요약">
            {connectionItems.map((item) => (
              <li key={item.recordKey}>
                <Button
                  type="button"
                  motion="quiet"
                  className={styles.connectionRow}
                  aria-current={selectedRecordKey === item.recordKey}
                  disabled={!interactive}
                  onClick={(event) => onSelectRecord(item, event.currentTarget)}
                >
                  <span>
                    <small>{item.affectedEntityKeys.join(' · ') || '시장 전반'}</small>
                    <strong>{item.title}</strong>
                    <span>{whySurfacedLabel(item)}</span>
                  </span>
                  <em>{confidenceLabel(item.confidence)}</em>
                </Button>
              </li>
            ))}
          </StructuredList>
        )}
      </Panel>
    </>
  );
}

function NewsRowButton({
  appendKey,
  interactive,
  item,
  onSelect,
  selected,
}: {
  appendKey?: string;
  interactive: boolean;
  item: ResearchFeedItem;
  onSelect: SelectRecord;
  selected: boolean;
}) {
  return (
    <Button
      type="button"
      motion="quiet"
      data-append-key={appendKey}
      data-testid="research-feed-record"
      className={styles.feedRow}
      aria-current={selected}
      disabled={!interactive}
      onClick={(event) => onSelect(item, event.currentTarget)}
    >
      <span className={styles.feedRowLayout}>
        <span className={styles.market}>{marketLabel(item.market)}</span>
        <span>
          <strong>{item.title}</strong>
          <span className={styles.summary}>{presentResearchSummary(item.summary)}</span>
          <small>{whySurfacedLabel(item)}</small>
        </span>
        <span className={styles.rowMeta}>
          <span>{confidenceLabel(item.confidence)}</span>
          <time>{formatDate(item.publishedAt, true)}</time>
        </span>
      </span>
    </Button>
  );
}
