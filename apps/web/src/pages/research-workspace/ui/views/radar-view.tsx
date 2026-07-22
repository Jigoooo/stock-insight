import { useRef } from 'react';

import { marketConnectionLabel } from '../../model/market-overview';
import { MarketOverviewPanel } from '../market-overview-panel';
import {
  PageHeader,
  WorkspaceState,
  type DetailState,
  formatDate,
  marketLabel,
  signalTypeLabel,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { useWorkspaceAppendReveal } from '../use-workspace-append-reveal';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/primitives';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

export function RadarView({
  data,
  interactive,
  pageState,
  onLoadMore,
}: {
  data: RadarSignalPage;
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
        eyebrow="시장 신호"
        title="세계 레이더"
        description="강도와 관심·보유 연결 여부를 함께 비교합니다."
        asOf={data.signalAsOf}
      />
      <MarketOverviewPanel
        data={data}
        eventContent={
          <div ref={ledgerRef} className={styles.ledger}>
            {data.items.length === 0 ? (
              <WorkspaceState
                kind="empty"
                title="감지된 신호가 없습니다"
                description="시장 데이터가 들어오면 강도와 관심 연결을 함께 보여드립니다."
              />
            ) : (
              data.items.map((item) => (
                <article
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
                </article>
              ))
            )}
          </div>
        }
        footer={
          data.nextCursor || pageState !== 'ready' ? (
            <div className={styles.feedPager}>
              {pageState === 'error' && (
                <span role="alert">다음 시장 신호를 불러오지 못했습니다.</span>
              )}
              <Button
                type="button"
                motion="quiet"
                data-testid="radar-load-more"
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
          ) : null
        }
      />
    </>
  );
}
