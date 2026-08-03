import { useRef } from 'react';

import { marketConnectionLabel } from '../../model/market-overview';
import styles from '../feed-ledger.module.css';
import { MarketOverviewPanel } from '../market-overview-panel';
import {
  type DetailState,
  formatDate,
  marketLabel,
  signalTypeLabel,
} from '../research-workspace-page';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import {
  CursorPagination,
  CursorPaginationAction,
  CursorPaginationMessage,
} from '@/shared/ui/pagination';
import { PageHeader, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

export function RadarView({
  data,
  geoSnapshot,
  interactive,
  pageState,
  onLoadMore,
}: {
  data: RadarSignalPage;
  geoSnapshot: GeoSnapshot;
  interactive: boolean;
  pageState: DetailState;
  onLoadMore: () => void;
}) {
  const ledgerRef = useRef<HTMLDivElement>(null);
  useWorkspaceAppendReveal({
    keys: data.items.map((item) => item.signalKey),
    scopeRef: ledgerRef,
  });
  return (
    <>
      <PageHeader
        title="세계 레이더"
        description="시장 신호의 강도와 보유·관심 연결을 비교합니다."
        asOf={data.signalAsOf}
      />
      <MarketOverviewPanel
        data={data}
        geoSnapshot={geoSnapshot}
        eventContent={
          <div ref={ledgerRef}>
            {data.items.length === 0 ? (
              <WorkspaceState
                kind="empty"
                title="감지된 신호가 없습니다"
                description="시장 데이터가 들어오면 강도와 관심 연결을 함께 보여드립니다."
              />
            ) : (
              <StructuredList className={styles.ledger} aria-label="시장 신호 목록">
                {data.items.map((item) => (
                  <li
                    key={item.signalKey}
                    className={styles.ledgerRow}
                    data-append-key={item.signalKey}
                    data-testid="radar-row"
                  >
                    <span className={styles.market}>{marketLabel(item.market)}</span>
                    <div>
                      <strong>
                        {item.name} <small>{item.symbol}</small>
                      </strong>
                      <p>{presentResearchSummary(item.summary)}</p>
                    </div>
                    <div className={styles.strength}>
                      <span
                        style={
                          {
                            '--strength': `${Math.round(item.strength * 100)}%`,
                          } as React.CSSProperties
                        }
                      />
                      <strong>{Math.round(item.strength * 100)}</strong>
                    </div>
                    <div className={styles.rowMeta}>
                      <span>
                        {marketConnectionLabel(item)} · {signalTypeLabel(item.signalType)}
                      </span>
                      <time>{formatDate(item.occurredAt, true)}</time>
                    </div>
                  </li>
                ))}
              </StructuredList>
            )}
          </div>
        }
        footer={
          data.nextCursor || pageState !== 'ready' ? (
            <CursorPagination>
              {pageState === 'error' && (
                <CursorPaginationMessage role="alert">
                  다음 시장 신호를 불러오지 못했습니다.
                </CursorPaginationMessage>
              )}
              <CursorPaginationAction
                data-testid="radar-load-more"
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
          ) : null
        }
      />
    </>
  );
}
