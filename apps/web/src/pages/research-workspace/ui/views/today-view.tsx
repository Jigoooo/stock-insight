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
  const upcoming = data.upcomingEvents;
  // 프롭을 늘리지 않는다 — 이 뷰의 다른 섹션과 같이 data 에서 직접 꺼낸다.
  const moves = data.unexplainedMoves;
  const trend = data.marketTrend;
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
        {/*
          같은 섹션의 **factor** 축 — 그날 시장 자체가 어디로 움직였나.
          위 지표들이 금리·환율을 말하는 동안 이것은 화면에 없었다.

          스파크라인을 그리지 않는다. 계획서가 "행마다 스파크라인·티커 테이프·
          빨강초록 점멸" 을 포털 문법으로 지목해 금지했다 — 흉내내면 "다른 앱과
          똑같다" 가 보장된다. 날짜·값·**표본 수**를 글로 적는다.

          표본 수가 이 목록의 핵심이다. 마이그레이션 120 이 그 열을 낸 이유가
          "표본 1개인 날의 평균과 361종목이 관측된 날의 평균이 같은 굵기로
          그려지면 안 된다" 이고, 그 열은 만들어진 뒤 읽는 곳이 없었다.
        */}
        {trend.days.length > 0 ? (
          <ul className={styles.marketTrendList} aria-label="최근 거래일 시장 평균 등락">
            {trend.days.map((day) => (
              <li key={day.day} data-direction={day.direction}>
                <span>{day.day}</span>
                <strong>{day.changeLabel}</strong>
                <em>{`${day.sampleCount.toLocaleString('ko-KR')}종목 기준`}</em>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.marketSummaryEmpty}>{trend.basisLabel}</p>
        )}
        {trend.days.length > 0 ? <p className={styles.sourceCaveat}>{trend.basisLabel}</p> : null}

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

      {/*
        정본 01 §2 **다섯 번째** 섹션 — 설명되지 않는 움직임.

        이 패널의 규율은 하나다: **움직인 이유를 말하지 않는다.** 원장이
        인과를 저장하지 않고(REQ-MKT-001), 화면도 인과를 만들지 않는다.
        여기 그려지는 것은 "어디를 뒤졌고 거기서 무엇이 나왔는가" 뿐이다.

        제목에 "오늘" 을 쓰지 않는다 — 관측일은 마지막 완료된 봉의 날짜라
        벽시계와 어긋난다. 날짜는 헤더 meta 가 진다.
      */}
      <Panel
        className={styles.todayPanel}
        data-testid="today-unexplained-move"
        aria-labelledby="today-unexplained-move-title"
      >
        <PanelHeader meta={moves.observedOn ? `${moves.observedOn} 관측` : '관측일 미상'}>
          <h2 id="today-unexplained-move-title">크게 움직인 종목과 확인 범위</h2>
          <p>평소 변동폭을 크게 벗어난 움직임을 찾아, 어디를 확인했는지 함께 봅니다.</p>
        </PanelHeader>
        {/*
          **`length` 가 아니라 `availability` 로 먼저 가른다.**

          이 원장은 적중한 행만 저장하므로 0행은 "움직임이 없었다" 가 아니다.
          실패에 "움직임이 없었습니다" 를 찍으면 시장에 대한 거짓 주장이 되고,
          미계산에 "불러오지 못했습니다" 를 찍으면 거짓 실패 진술이 된다.
          두 문장을 절대 섞지 않는다.
        */}
        {moves.availability === 'error' ? (
          <p className={styles.marketSummaryEmpty}>
            이 목록을 불러오지 못했습니다. 아래 항목은 영향을 받지 않습니다.
          </p>
        ) : moves.items.length === 0 ? (
          <p className={styles.marketSummaryEmpty}>
            이 계산이 아직 수행되지 않았습니다. 크게 움직인 종목이 없었다는 뜻은 아닙니다.
          </p>
        ) : (
          <ul className={styles.anomalyList} aria-label="크게 움직인 종목과 확인 범위">
            {moves.items.map((item) => (
              <li key={item.key}>
                <span className={styles.anomalyHead}>
                  <span className={styles.anomalyName}>{item.name}</span>
                  <span className={styles.anomalyMeta}>{item.marketLabel}</span>
                  {/*
                    부호가 라벨 안에 들어 있어 색이 사라져도 뜻이 남는다 —
                    색만으로 구분하지 않는다(UX 헌법 1번).
                  */}
                  <span
                    className={`${styles.anomalyMove} ${
                      item.direction === 'up' ? styles.anomalyMoveUp : styles.anomalyMoveDown
                    }`}
                  >
                    {item.moveLabel}
                  </span>
                  <span className={styles.anomalyMeta}>{item.magnitudeLabel}</span>
                </span>
                <span className={styles.anomalyState}>
                  {item.stateLabel} — {item.stateDetail}
                </span>
                {item.checked.length > 0 ? (
                  <ul className={styles.anomalyChecks} aria-label={`${item.name} 확인한 범위`}>
                    {item.checked.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {/*
                  못 뒤진 채널은 확인한 것과 **다른 목록**으로 그린다. 섞으면
                  "뒤졌는데 없었다" 와 "뒤지지 않았다" 가 같은 무게로 읽히고,
                  그 구분이 이 섹션의 존재 이유다(REQ-SRC-001).
                */}
                {item.unchecked.length > 0 ? (
                  <p className={styles.anomalyUnchecked}>
                    {`${item.unchecked.length}개 채널은 확인하지 않았습니다 — ${item.unchecked.join(' · ')}.`}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.sourceCaveat}>
          이 목록은 큰 움직임을 찾아 어디를 확인했는지 적은 것입니다. 움직인 이유를 말하지 않으며,
          확인된 것이 없다는 것이 이상이 있다는 뜻도 아닙니다. {moves.basisLabel}
        </p>
      </Panel>

      {/*
        정본 01 §2 여섯 번째 섹션 — 예정 catalyst/calendar.
        `market.scheduled_event` 는 매일 채워지고 있었는데 읽는 코드가 0개였다.
        제목은 수집원이 쓴 영문이라 번역하지 않고 그대로 옮긴다 — 사건 목록이
        이미 쓰는 방식이다. 우리가 분류한 종류·지역만 한국어로 바꾼다.
      */}
      <Panel
        className={styles.todayPanel}
        data-testid="today-upcoming-events"
        aria-labelledby="today-upcoming-events-title"
      >
        <PanelHeader meta={`전체 ${data.upcomingEventTotal}건`}>
          <h2 id="today-upcoming-events-title">예정된 일정</h2>
          <p>통화정책 회의와 경제지표 발표를 먼저 봅니다.</p>
        </PanelHeader>
        {upcoming.length === 0 ? (
          <p className={styles.marketSummaryEmpty}>
            예정된 일정을 불러오지 못했습니다. 아래 항목은 영향을 받지 않습니다.
          </p>
        ) : (
          <>
            <ul className={styles.upcomingList} aria-label="예정된 일정">
              {upcoming.map((event) => (
                <li key={event.key}>
                  <time dateTime={event.scheduledOn}>{event.scheduledOn}</time>
                  <span>
                    {event.kindLabel}
                    {event.regionLabel ? ` · ${event.regionLabel}` : ''}
                  </span>
                  <strong>{event.title}</strong>
                </li>
              ))}
            </ul>
            <p className={styles.sourceCaveat}>
              일정 제목은 수집처가 기록한 원문 그대로입니다. 전체 {data.upcomingEventTotal}건 중
              통화정책·경제지표·실적 순으로 {upcoming.length}건만 실었습니다.
            </p>
          </>
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
