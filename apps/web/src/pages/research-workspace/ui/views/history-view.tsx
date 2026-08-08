import { useRef, type MouseEvent, type ReactNode } from 'react';

import type { HistoryBriefingItem, HistoryBriefingModel } from '../../model/history-briefing';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';
import { formatDate, historyStatusLabel } from '../workspace-presenters';
import styles from './history-view.module.css';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/button';
import {
  CursorPagination,
  CursorPaginationAction,
  CursorPaginationMessage,
} from '@/shared/ui/pagination';
import {
  AvailabilityNotice,
  PageHeader,
  Panel,
  PanelHeader,
  WorkspaceState,
} from '@/shared/ui/workspace';
import type { DecisionHistoryPage } from '@stock-insight/contracts/research-workspace';

type HistorySelectionHandler = (item: HistoryBriefingItem, opener: HTMLElement) => void;

export function HistoryView({
  briefing,
  data,
  interactive,
  pageState,
  onLoadMore,
  onOpenHistory,
  selectedHistoryId,
}: {
  briefing: HistoryBriefingModel;
  data: DecisionHistoryPage;
  interactive: boolean;
  pageState: 'ready' | 'loading' | 'error';
  onLoadMore: () => void;
  onOpenHistory?: HistorySelectionHandler;
  selectedHistoryId?: string;
}) {
  const selectHistory: HistorySelectionHandler = (item, opener) => {
    onOpenHistory?.(item, opener);
  };

  return (
    <>
      <PageHeader
        title="판단 복기"
        description="당시 근거와 지금 확인할 조건을 기록 범위 안에서 다시 살펴봅니다."
        asOf={data.generatedAt}
      />
      {data.items.length > 0 ? <AvailabilityNotice availability={data.availability} /> : null}
      <HistoryBriefingContent
        briefing={briefing}
        interactive={interactive}
        onSelectHistory={selectHistory}
        selectedHistoryId={selectedHistoryId}
      />
      {(data.nextCursor || pageState !== 'ready') && (
        <CursorPagination>
          <span className={styles.loadedCount}>현재 {data.items.length}건 불러옴</span>
          {pageState === 'error' && (
            <CursorPaginationMessage role="alert">
              다음 복기 기록을 불러오지 못했습니다.
            </CursorPaginationMessage>
          )}
          <CursorPaginationAction
            data-testid="history-load-more"
            disabled={!interactive || pageState === 'loading' || !data.nextCursor}
            onClick={onLoadMore}
          >
            {pageState === 'loading'
              ? '불러오는 중'
              : pageState === 'error'
                ? '다시 시도'
                : '더 보기'}
          </CursorPaginationAction>
        </CursorPagination>
      )}
    </>
  );
}

export function HistoryBriefingContent({
  briefing,
  interactive,
  onSelectHistory,
  selectedHistoryId,
}: {
  briefing: HistoryBriefingModel;
  interactive: boolean;
  onSelectHistory: HistorySelectionHandler;
  selectedHistoryId?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const allItems = [
    ...briefing.priorityJudgments.slice(0, 3),
    ...briefing.activeJudgments,
    ...briefing.observations,
    ...briefing.pastEntries,
  ];
  useWorkspaceAppendReveal({
    keys: allItems.map((item) => item.historyId),
    scopeRef: contentRef,
  });

  const selectionProps = {
    interactive,
    onSelectHistory,
    selectedHistoryId,
  };

  return (
    <div className={styles.workspace} ref={contentRef}>
      <HistorySummary summary={briefing.summary} />
      {briefing.summary.scopeTotal === 0 ? (
        <WorkspaceState
          className={styles.emptyState}
          kind="empty"
          title="아직 복기 기록이 없습니다"
          description="판단이나 자동 시장 관찰이 기록되면 이곳에서 다시 확인할 수 있습니다."
        />
      ) : (
        <>
          <div className={styles.briefingColumns}>
            <HistorySection
              description="예정 시각이 지난 기록 중 먼저 확인할 세 건입니다."
              title="오늘 다시 볼 판단"
            >
              {briefing.priorityJudgments.length > 0 ? (
                <HistoryItemList
                  {...selectionProps}
                  items={briefing.priorityJudgments.slice(0, 3)}
                  testId="history-priority-item"
                />
              ) : (
                <WorkspaceState
                  className={styles.sectionState}
                  kind="empty"
                  title="오늘 예정된 복기가 없습니다"
                  description="최근 기록을 대신 올리지 않고 예정된 판단만 이 영역에 표시합니다."
                />
              )}
            </HistorySection>
            <HistorySection
              description="우선 확인 항목을 제외한 열린 판단 기록입니다."
              title="진행 중 판단"
            >
              {briefing.activeJudgments.length > 0 ? (
                <HistoryItemList
                  {...selectionProps}
                  items={briefing.activeJudgments}
                  testId="history-active-item"
                />
              ) : (
                <WorkspaceState
                  className={styles.sectionState}
                  kind="empty"
                  title="진행 중인 판단이 없습니다"
                  description="열린 판단 기록이 생기면 여기에서 이어서 확인할 수 있습니다."
                />
              )}
            </HistorySection>
          </div>
          <HistorySection
            description="시스템이 감지한 시장 변화를 사용자 판단과 구분해 보여줍니다."
            title="자동 시장 관찰"
          >
            {briefing.observations.length > 0 ? (
              <HistoryItemList
                {...selectionProps}
                items={briefing.observations}
                testId="history-observation-item"
              />
            ) : (
              <WorkspaceState
                className={styles.sectionState}
                kind="empty"
                title="자동 시장 관찰 기록이 없습니다"
                description="새로 감지된 변화가 생기면 사용자 판단과 분리해 표시합니다."
              />
            )}
          </HistorySection>
          <Panel aria-labelledby="history-past-title">
            <details className={styles.pastEntries} data-testid="history-past-entries">
              <summary>
                <span>
                  <strong id="history-past-title">지난 복기</strong>
                  <small>검토되었거나 보관된 기록</small>
                </span>
                <span>{briefing.pastEntries.length}건</span>
              </summary>
              {briefing.pastEntries.length > 0 ? (
                <HistoryItemList
                  {...selectionProps}
                  items={briefing.pastEntries}
                  testId="history-past-item"
                />
              ) : (
                <p className={styles.noPastEntries}>아직 지난 복기 기록이 없습니다.</p>
              )}
            </details>
          </Panel>
        </>
      )}
    </div>
  );
}

function HistorySummary({ summary }: { summary: HistoryBriefingModel['summary'] }) {
  return (
    <Panel aria-label="판단 복기 요약">
      <dl className={styles.summaryGrid}>
        <div>
          <dt>전체 기록 범위</dt>
          <dd>{summary.scopeTotal}건</dd>
        </div>
        <div>
          <dt>불러온 기록 중 오늘 확인</dt>
          <dd>{summary.loadedDueCount}건</dd>
        </div>
        <div>
          <dt>불러온 자동 관찰</dt>
          <dd>{summary.loadedObservationCount}건</dd>
        </div>
        <div>
          <dt>기준 시각</dt>
          <dd>
            <time dateTime={summary.generatedAt}>{formatDate(summary.generatedAt, true)}</time>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function HistorySection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  const id = `history-${title.replaceAll(' ', '-')}`;
  return (
    <Panel aria-labelledby={id}>
      <PanelHeader>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </PanelHeader>
      {children}
    </Panel>
  );
}

function HistoryItemList({
  interactive,
  items,
  onSelectHistory,
  selectedHistoryId,
  testId,
}: {
  interactive: boolean;
  items: HistoryBriefingItem[];
  onSelectHistory: HistorySelectionHandler;
  selectedHistoryId?: string;
  testId: string;
}) {
  return (
    <ul className={styles.itemList}>
      {items.map((item) => (
        <li data-append-key={item.historyId} data-testid={testId} key={item.historyId}>
          <HistorySelectionSurface
            interactive={interactive}
            item={item}
            onSelectHistory={onSelectHistory}
            selected={selectedHistoryId === item.historyId}
          />
        </li>
      ))}
    </ul>
  );
}

function HistorySelectionSurface({
  interactive,
  item,
  onSelectHistory,
  selected,
}: {
  interactive: boolean;
  item: HistoryBriefingItem;
  onSelectHistory: HistorySelectionHandler;
  selected: boolean;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onSelectHistory(item, event.currentTarget);
  };
  return (
    <Button
      aria-current={selected ? 'true' : 'false'}
      className={styles.selectionSurface}
      data-testid="history-select-surface"
      disabled={!interactive}
      motion="quiet"
      onClick={handleClick}
      variant="ghost"
    >
      <span className={styles.itemLayout}>
        <span className={styles.itemCopy}>
          <strong>{item.title}</strong>
          <span>{presentResearchSummary(item.thesis)}</span>
        </span>
        <span className={styles.itemMeta}>
          <span>{item.kind === 'observation' ? '자동 관찰' : '판단 기록'}</span>
          <span>근거 {item.evidenceCount}개</span>
          <span>{historyStatusLabel(item.status)}</span>
          <time dateTime={item.reviewDueAt ?? item.occurredAt ?? item.createdAt}>
            {item.reviewDueAt
              ? `확인 ${formatDate(item.reviewDueAt)}`
              : formatDate(item.occurredAt ?? item.createdAt)}
          </time>
        </span>
      </span>
    </Button>
  );
}

export function HistoryRows({ items }: { items: DecisionHistoryPage['items'] }) {
  if (items.length === 0) {
    return (
      <WorkspaceState
        className={styles.sectionState}
        kind="empty"
        title="아직 남긴 판단이 없습니다"
        description="리서치에서 기록한 판단이 이곳에 쌓입니다."
      />
    );
  }

  return (
    <ul className={styles.itemList} aria-label="최근 판단 기록">
      {items.map((item) => (
        <li className={styles.recentRow} key={item.historyId}>
          <span className={styles.itemCopy}>
            <strong>{item.title}</strong>
            <span>{presentResearchSummary(item.thesis)}</span>
          </span>
          <span className={styles.itemMeta}>
            <span>근거 {item.evidenceCount}개</span>
            <span>{historyStatusLabel(item.status)}</span>
            <time dateTime={item.occurredAt ?? item.createdAt}>
              {formatDate(item.occurredAt ?? item.createdAt)}
            </time>
          </span>
        </li>
      ))}
    </ul>
  );
}
