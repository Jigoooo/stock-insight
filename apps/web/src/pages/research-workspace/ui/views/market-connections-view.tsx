import { useEffect, useRef, useState } from 'react';

import {
  loadMarketConnectionData,
  type MarketConnectionItem,
  type MarketConnectionLoader,
  type MarketConnectionLoadResult,
  type MarketConnectionsModel,
} from '../../model/market-connections';
import { createRetryablePromiseCache } from '../../model/workspace-lazy-recovery';
import { MarketConnectionInspector } from '../market-connection-inspector';
import {
  MarketChangeList,
  MarketConnectionSummary,
  PriorityMarketChanges,
} from '../market-connection-sections';
import { MarketExploration } from '../market-exploration';
import type { DetailState } from '../research-workspace-page';
import styles from './market-connections-view.module.css';

import { PageHeader, WorkspaceState } from '@/shared/ui/workspace';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

function createMarketConnectionApiClient() {
  return import('@stock-insight/api-client').then(({ createApiClient }) => createApiClient());
}

const getMarketConnectionApiClient = createRetryablePromiseCache(createMarketConnectionApiClient);

export function MarketConnectionsView({
  geoSnapshot,
  interactive,
  loadMarketConnectionDetail,
  marketConnections,
  onLoadMore,
  pageState,
  radarPage,
}: {
  geoSnapshot: GeoSnapshot;
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
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const requestSequenceRef = useRef(0);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

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
        <MarketExploration
          data={radarPage}
          geoSnapshot={geoSnapshot}
          marketConnections={marketConnections}
          onSelectConnection={(item, opener) => void loadConnection(item, opener)}
        />
      </fieldset>
      <MarketConnectionInspector
        mobile={isMobileViewport}
        onClose={closeDetail}
        onRetry={() => selectedItem && void loadConnection(selectedItem)}
        open={detailOpen}
        radarItems={radarPage.items}
        result={detailResult}
        selectedConnectionKey={selectedConnectionKey ?? null}
        state={detailState}
      />
    </div>
  );
}
