import { useEffect, useRef, useState } from 'react';

import {
  loadMarketConnectionData,
  type MarketConnectionItem,
  type MarketConnectionLoader,
  type MarketConnectionLoadResult,
  type MarketConnectionsModel,
} from '../../model/market-connections';
import { createRetryablePromiseCache } from '../../model/workspace-lazy-recovery';
import {
  MarketChangeList,
  MarketConnectionSummary,
  PriorityMarketChanges,
} from '../market-connection-sections';
import type { DetailState } from '../research-workspace-page';
import styles from './market-connections-view.module.css';

import { Button } from '@/shared/ui/button';
import { PageHeader, WorkspaceState } from '@/shared/ui/workspace';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

function createMarketConnectionApiClient() {
  return import('@stock-insight/api-client').then(({ createApiClient }) => createApiClient());
}

const getMarketConnectionApiClient = createRetryablePromiseCache(createMarketConnectionApiClient);

export function MarketConnectionsView({
  interactive,
  loadMarketConnectionDetail,
  marketConnections,
  onLoadMore,
  pageState,
  radarPage,
}: {
  interactive: boolean;
  loadMarketConnectionDetail?: MarketConnectionLoader;
  marketConnections: MarketConnectionsModel;
  onLoadMore: () => void;
  pageState: DetailState;
  radarPage: RadarSignalPage;
}) {
  const [selectedConnectionKey, setSelectedConnectionKey] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailState, setDetailState] = useState<DetailState>('error');
  const [detailResult, setDetailResult] = useState<MarketConnectionLoadResult | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const requestSequenceRef = useRef(0);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
    },
    [],
  );

  async function loadConnection(item: MarketConnectionItem, opener?: HTMLButtonElement) {
    const sequence = ++requestSequenceRef.current;
    if (opener) openerRef.current = opener;
    setSelectedConnectionKey(item.connectionKey);
    setDetailOpen(true);
    setDetailState('loading');
    setDetailResult(null);

    try {
      const result = loadMarketConnectionDetail
        ? await loadMarketConnectionDetail(item.connectionKey)
        : await (async () => {
            const signal = radarPage.items.find(
              ({ signalKey }) => signalKey === item.connectionKey,
            );
            if (!signal) throw new Error('선택한 시장 변화를 현재 Radar 응답에서 찾지 못했습니다.');
            const api = await getMarketConnectionApiClient();
            return loadMarketConnectionData(signal, {
              loadRelation: (entityKey) => api.entityRelations(entityKey, 1),
              loadImpactBrief: (entityKey) => api.impactBrief(entityKey),
            });
          })();
      if (requestSequenceRef.current !== sequence) return;
      setDetailResult(result);
      setDetailState('ready');
    } catch {
      if (requestSequenceRef.current !== sequence) return;
      setDetailState('error');
    }
  }

  function closeDetail() {
    requestSequenceRef.current += 1;
    setDetailOpen(false);
    const opener = openerRef.current;
    if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
  }

  const selectedItem = [
    ...marketConnections.priorityChanges,
    ...marketConnections.marketChanges,
  ].find(({ connectionKey }) => connectionKey === selectedConnectionKey);
  const hasItems =
    marketConnections.priorityChanges.length > 0 || marketConnections.marketChanges.length > 0;

  return (
    <div className={styles.workspace}>
      <PageHeader
        title="내 종목에 영향을 줄 시장 변화"
        description="내 종목과 연결된 변화를 먼저 보고, 시장 전반의 흐름을 이어서 확인합니다."
        asOf={marketConnections.summary.analyzedAt}
      />
      <fieldset className={styles.content} disabled={!interactive}>
        <MarketConnectionSummary summary={marketConnections.summary} />
        {hasItems ? (
          <>
            <PriorityMarketChanges
              interactive={interactive}
              items={marketConnections.priorityChanges}
              selectedConnectionKey={selectedConnectionKey}
              onSelectConnection={(item, opener) => void loadConnection(item, opener)}
            />
            <MarketChangeList
              hasNextPage={Boolean(radarPage.nextCursor)}
              interactive={interactive}
              items={marketConnections.marketChanges}
              pageState={pageState}
              selectedConnectionKey={selectedConnectionKey}
              onLoadMore={onLoadMore}
              onSelectConnection={(item, opener) => void loadConnection(item, opener)}
            />
          </>
        ) : (
          <WorkspaceState
            className={styles.emptyState}
            kind="empty"
            title="감지된 시장 변화가 없습니다"
            description="시장 데이터가 들어오면 내 종목 연결과 시장 전반 변화를 함께 보여드립니다."
          />
        )}
      </fieldset>
      {detailOpen ? (
        <section
          className={styles.detailStatus}
          aria-labelledby="market-connection-detail-status-title"
          aria-live="polite"
        >
          <div>
            <h2 id="market-connection-detail-status-title">선택한 시장 변화</h2>
            {detailState === 'loading' ? (
              <WorkspaceState
                delayMs={0}
                kind="loading"
                title="시장 변화 상세를 준비하고 있습니다"
                description="연결 관계와 영향 경로를 확인하는 중입니다."
              />
            ) : detailState === 'error' ? (
              <WorkspaceState
                kind="error"
                title="시장 변화 상세를 불러오지 못했습니다"
                description="선택은 유지됩니다. 같은 변화를 다시 불러올 수 있습니다."
                action={
                  selectedItem ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void loadConnection(selectedItem)}
                    >
                      다시 불러오기
                    </Button>
                  ) : null
                }
              />
            ) : (
              <div className={styles.readyState}>
                <strong>
                  {detailResult?.detail.item.title ?? '시장 변화 상세가 준비됐습니다'}
                </strong>
                <span className={styles.readyDescription}>
                  전체 상세 인스펙터는 다음 구현 단계에서 이 선택 상태를 이어받습니다.
                </span>
              </div>
            )}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={closeDetail}>
            상세 닫기
          </Button>
        </section>
      ) : null}
    </div>
  );
}
