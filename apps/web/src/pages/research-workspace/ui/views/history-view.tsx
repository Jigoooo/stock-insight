import { Clock3 } from 'lucide-react';
import { useRef } from 'react';

import styles from '../feed-ledger.module.css';
import {
  type DetailState,
  availabilityLabels,
  formatDate,
  historyStatusLabel,
  marketLabel,
} from '../research-workspace-page';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
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
  Timeline,
  WorkspaceState,
} from '@/shared/ui/workspace';
import type { DecisionHistoryPage } from '@stock-insight/contracts/research-workspace';

export function HistoryView({
  data,
  interactive,
  pageState,
  onLoadMore,
}: {
  data: DecisionHistoryPage;
  interactive: boolean;
  pageState: DetailState;
  onLoadMore: () => void;
}) {
  return (
    <>
      <PageHeader
        title="판단 이력"
        description="기록한 판단과 다음 검토 일정을 시간순으로 확인합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <Panel>
        <PanelHeader>
          <h2>기록</h2>
          <p>
            {data.items.length}건 표시 · 전체 {data.scopeTotal}건 ·{' '}
            {availabilityLabels[data.availability]}
          </p>
        </PanelHeader>
        <HistoryRows items={data.items} />
        {(data.nextCursor || pageState !== 'ready') && (
          <CursorPagination>
            {pageState === 'error' && (
              <CursorPaginationMessage role="alert">
                다음 판단 기록을 불러오지 못했습니다.
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
      </Panel>
    </>
  );
}

export function HistoryRows({ items }: { items: DecisionHistoryPage['items'] }) {
  const ledgerRef = useRef<HTMLOListElement>(null);
  useWorkspaceAppendReveal({
    keys: items.map((item) => item.historyId),
    scopeRef: ledgerRef,
  });

  if (items.length === 0) {
    return (
      <WorkspaceState
        kind="empty"
        title="아직 남긴 판단이 없습니다"
        description="리서치에서 기록한 판단과 다음 검토 일정이 이곳에 쌓입니다."
      />
    );
  }

  return (
    <Timeline ref={ledgerRef} className={styles.ledger} aria-label="판단 이력 타임라인">
      {items.map((item) => (
        <li
          key={item.historyId}
          className={styles.historyRow}
          data-append-key={item.historyId}
          data-testid="history-row"
        >
          <Clock3 aria-hidden="true" />
          <div>
            <strong>{item.title}</strong>
            <p>{presentResearchSummary(item.thesis)}</p>
            <small>
              {marketLabel(item.market)} 시장 · 근거 {item.evidenceCount}개 ·{' '}
              {historyStatusLabel(item.status)}
            </small>
          </div>
          <div className={styles.rowMeta}>
            <time dateTime={item.occurredAt ?? item.createdAt}>
              {formatDate(item.occurredAt ?? item.createdAt, true)}
            </time>
            <span>{item.reviewDueAt ? `검토 ${formatDate(item.reviewDueAt)}` : '검토일 없음'}</span>
          </div>
        </li>
      ))}
    </Timeline>
  );
}
