import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createLatestRequestGate,
  loadStockDeepDiveData,
  type StockDeepDive,
  type StockDeepDiveLoader,
} from '../../model/stock-deep-dive';
import {
  analysisStatusLabel,
  availabilityLabels,
  formatDate,
  formatNumber,
  marketLabel,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { StockDeepDivePanel, type StockDeepDivePanelState } from '../stock-deep-dive-panel';
import stockStyles from '../stock-deep-dive-panel.module.css';

import { TableRow, TableSelectionHead } from '@/shared/ui/table';
import {
  AvailabilityNotice,
  DataTable,
  PageHeader,
  Panel,
  PanelHeader,
  WorkspaceState,
} from '@/shared/ui/workspace';
import { createApiClient } from '@stock-insight/api-client';
import type { StockListResponse } from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

const compactWorkspaceQuery = '(max-width: 1240px)';
export function StocksView({
  data,
  loadStockDeepDive,
  pending,
  stocks,
}: {
  data: StockListResponse;
  loadStockDeepDive?: StockDeepDiveLoader;
  pending: boolean;
  stocks: StockListResponse['data'];
}) {
  const api = useMemo(() => createApiClient(), []);
  const requestGateRef = useRef(createLatestRequestGate());
  const deepDiveRegionRef = useRef<HTMLDivElement>(null);
  const [selectedStockKey, setSelectedStockKey] = useState<string>();
  const [deepDive, setDeepDive] = useState<StockDeepDive | null>(null);
  const [relation, setRelation] = useState<EntityRelationGraph | null>(null);
  const [detailState, setDetailState] = useState<StockDeepDivePanelState>('idle');
  const [detailError, setDetailError] = useState<string>();

  useEffect(
    () => () => {
      requestGateRef.current.invalidate();
    },
    [],
  );

  async function loadDeepDive(entityKey: string) {
    const sequence = requestGateRef.current.next();
    setSelectedStockKey(entityKey);
    setDetailState('loading');
    setDetailError(undefined);
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        deepDiveRegionRef.current?.focus({ preventScroll: true });
        if (window.matchMedia(compactWorkspaceQuery).matches) {
          deepDiveRegionRef.current?.scrollIntoView({ behavior, block: 'start' });
        }
      });
    });

    try {
      const result = loadStockDeepDive
        ? await loadStockDeepDive(entityKey)
        : await loadStockDeepDiveData(entityKey, {
            loadDetail: (key) => api.stockDetail(key),
            loadRelation: (key) => api.entityRelations(key, 2),
            loadImpactBrief: (key) => api.impactBrief(key),
          });
      if (!requestGateRef.current.isCurrent(sequence)) return;
      setRelation(result.relation);
      setDeepDive(result.deepDive);
      setDetailState('ready');
    } catch (error) {
      if (!requestGateRef.current.isCurrent(sequence)) return;
      setRelation(null);
      setDetailError(error instanceof Error ? error.message : '종목 상세를 불러오지 못했습니다.');
      setDetailState('error');
    }
  }

  const detailRegion = (
    <div
      ref={deepDiveRegionRef}
      className={stockStyles.deepDiveRegion}
      data-state={detailState}
      data-testid="stock-deep-dive-region"
      tabIndex={-1}
    >
      <StockDeepDivePanel
        deepDive={deepDive}
        errorMessage={detailError}
        relation={relation}
        state={detailState}
        onRetry={() => selectedStockKey && void loadDeepDive(selectedStockKey)}
        onSelectEntity={(entityKey) => void loadDeepDive(entityKey)}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title="종목"
        description="보유·관심 종목과 분석 상태를 확인합니다."
        asOf={data.meta.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <div className={stockStyles.stocksWorkspace}>
        <Panel data-pending={pending || undefined} aria-busy={pending || undefined}>
          <PanelHeader>
            <h2>종목 현황</h2>
            <p aria-live="polite">
              {pending
                ? '검색 결과를 갱신하고 있습니다'
                : `${stocks.length}개 표시 · ${availabilityLabels[data.availability]}`}
            </p>
          </PanelHeader>
          <p id="stock-table-scroll-hint" className={stockStyles.tableScrollHint}>
            좌우로 밀어 시장, 상태, 가격, 변화율과 분석 시각 확인
          </p>
          <div className={stockStyles.tableWrap}>
            <DataTable
              caption="종목 현황"
              captionClassName={styles.srOnly}
              className={stockStyles.stockTable}
              selectionMode="single"
              selectedKeys={selectedStockKey ? [selectedStockKey] : []}
              onSelectionChange={(keys) => {
                const entityKey = keys[0];
                if (entityKey && entityKey !== selectedStockKey) void loadDeepDive(entityKey);
              }}
              containerProps={{
                'aria-describedby': 'stock-table-scroll-hint',
                'aria-label': '종목 현황 표 가로 스크롤 영역',
                tabIndex: 0,
              }}
            >
              <thead>
                <tr>
                  <TableSelectionHead scope="col" />
                  <th scope="col">종목</th>
                  <th scope="col">시장</th>
                  <th scope="col">현재 상태</th>
                  <th scope="col">최근 가격</th>
                  <th scope="col">변화율</th>
                  <th scope="col">분석 시각</th>
                </tr>
              </thead>
              <tbody>
                {!pending && stocks.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <WorkspaceState
                        kind="empty"
                        title="조건에 맞는 종목이 없습니다"
                        description="검색어를 지우거나 다른 종목 이름과 티커를 입력해 보세요."
                      />
                    </td>
                  </tr>
                )}
                {stocks.map((stock) => (
                  <TableRow
                    key={stock.entityKey}
                    className={stocks.length > 100 ? stockStyles.deferredTableRow : undefined}
                    rowKey={stock.entityKey}
                    selectionLabel={`${stock.displayName} 종목 선택`}
                  >
                    <td aria-label={`${stock.displayName} ${stock.ticker}`}>
                      <div className={stockStyles.stockIdentity}>
                        <strong>{stock.displayName}</strong>
                        <small>{stock.ticker}</small>
                      </div>
                    </td>
                    <td>{marketLabel(stock.market)}</td>
                    <td>
                      {stock.isHolding
                        ? '보유종목'
                        : stock.isWatched
                          ? '관심종목'
                          : analysisStatusLabel(stock.analysisStatus)}
                    </td>
                    <td>
                      {stock.latestPrice === undefined
                        ? '—'
                        : `${formatNumber(stock.latestPrice)} ${
                            stock.currency === 'KRW' ? '원' : stock.currency === 'USD' ? '달러' : ''
                          }`}
                    </td>
                    <td
                      className={
                        (stock.changePct ?? 0) < 0 ? stockStyles.negative : stockStyles.positive
                      }
                    >
                      {stock.changePct === undefined ? '—' : `${stock.changePct.toFixed(2)}%`}
                    </td>
                    <td>{formatDate(stock.lastAnalyzedAt, true)}</td>
                  </TableRow>
                ))}
              </tbody>
            </DataTable>
          </div>
        </Panel>
        {detailRegion}
      </div>
    </>
  );
}
