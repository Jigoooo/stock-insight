import { Clock3 } from 'lucide-react';
import { useRef } from 'react';

import {
  AvailabilityNotice,
  PageHeader,
  WorkspaceState,
  type DetailState,
  availabilityLabels,
  formatDate,
  historyStatusLabel,
  marketLabel,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/primitives';
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
        eyebrow="판단 기록"
        title="판단 이력"
        description="내가 남긴 판단과 다시 살펴볼 일정을 시간순으로 확인합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>기록</h2>
            <p>
              {data.items.length}건 표시 · 전체 {data.scopeTotal}건 ·{' '}
              {availabilityLabels[data.availability]}
            </p>
          </div>
        </header>
        <HistoryRows items={data.items} />
        {(data.nextCursor || pageState !== 'ready') && (
          <div className={styles.feedPager}>
            {pageState === 'error' && (
              <span role="alert">다음 판단 기록을 불러오지 못했습니다.</span>
            )}
            <Button
              type="button"
              motion="quiet"
              data-testid="history-load-more"
              disabled={!interactive || pageState === 'loading' || !data.nextCursor}
              onClick={onLoadMore}
            >
              {pageState === 'loading'
                ? '불러오는 중'
                : pageState === 'error'
                  ? '다시 시도'
                  : '더 보기'}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}

export function HistoryRows({ items }: { items: DecisionHistoryPage['items'] }) {
  const ledgerRef = useRef<HTMLDivElement>(null);
  useWorkspaceAppendReveal({
    keys: items.map((item) => item.historyId),
    scopeRef: ledgerRef,
  });
  return (
    <div ref={ledgerRef} className={styles.ledger}>
      {items.length === 0 ? (
        <WorkspaceState
          kind="empty"
          title="아직 남긴 판단이 없습니다"
          description="리서치에서 기록한 판단과 다음 검토 일정이 이곳에 쌓입니다."
        />
      ) : (
        items.map((item) => (
          <article
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
              <time>{formatDate(item.occurredAt ?? item.createdAt, true)}</time>
              <span>
                {item.reviewDueAt ? `검토 ${formatDate(item.reviewDueAt)}` : '검토일 없음'}
              </span>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
