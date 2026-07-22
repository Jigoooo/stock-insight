import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  createLatestRequestGate,
  loadStockDeepDiveData,
  type StockDeepDive,
} from '../../model/stock-deep-dive';
import {
  AvailabilityNotice,
  PageHeader,
  WorkspaceState,
  analysisStatusLabel,
  availabilityLabels,
  formatDate,
  formatNumber,
  marketLabel,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { StockDeepDivePanel, type StockDeepDivePanelState } from '../stock-deep-dive-panel';

import { createApiClient } from '@stock-insight/api-client';
import type { StockListResponse } from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

const compactWorkspaceQuery = '(max-width: 1240px)';
const deepDiveFocusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function useCompactWorkspaceLayout(onBeforeChange: () => void, onAfterChange: () => void) {
  const subscribe = useMemo(
    () => (listener: () => void) => {
      const media = window.matchMedia(compactWorkspaceQuery);
      let firstFrame = 0;
      let secondFrame = 0;
      const handleChange = () => {
        onBeforeChange();
        listener();
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
        firstFrame = requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(onAfterChange);
        });
      };
      media.addEventListener('change', handleChange);
      return () => {
        media.removeEventListener('change', handleChange);
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
      };
    },
    [onAfterChange, onBeforeChange],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(compactWorkspaceQuery).matches,
    () => false,
  );
}

export function StocksView({
  data,
  pending,
  stocks,
}: {
  data: StockListResponse;
  pending: boolean;
  stocks: StockListResponse['data'];
}) {
  const api = useMemo(() => createApiClient(), []);
  const requestGateRef = useRef(createLatestRequestGate());
  const deepDiveRegionRef = useRef<HTMLDivElement>(null);
  const pendingFocusRestoreRef = useRef<'region' | number | null>(null);
  const captureDeepDiveFocus = useCallback(() => {
    const region = deepDiveRegionRef.current;
    const active = document.activeElement;
    if (!region || !(active instanceof HTMLElement) || !region.contains(active)) {
      pendingFocusRestoreRef.current = null;
      return;
    }
    if (active === region) {
      pendingFocusRestoreRef.current = 'region';
      return;
    }
    const focusables = Array.from(region.querySelectorAll<HTMLElement>(deepDiveFocusableSelector));
    const activeIndex = focusables.indexOf(active);
    pendingFocusRestoreRef.current = activeIndex >= 0 ? activeIndex : 'region';
  }, []);
  const restoreDeepDiveFocus = useCallback(() => {
    const pendingFocus = pendingFocusRestoreRef.current;
    if (pendingFocus === null) return;
    pendingFocusRestoreRef.current = null;
    const region = deepDiveRegionRef.current;
    if (!region) return;
    if (pendingFocus === 'region') {
      region.focus({ preventScroll: true });
      return;
    }
    const focusables = region.querySelectorAll<HTMLElement>(deepDiveFocusableSelector);
    focusables.item(pendingFocus)?.focus({ preventScroll: true });
  }, []);
  const compactLayout = useCompactWorkspaceLayout(captureDeepDiveFocus, restoreDeepDiveFocus);
  const [selectedEntityKey, setSelectedEntityKey] = useState<string>();
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
    setSelectedEntityKey(entityKey);
    setDetailState('loading');
    setDetailError(undefined);
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        deepDiveRegionRef.current?.focus({ preventScroll: true });
        if (compactLayout) {
          deepDiveRegionRef.current?.scrollIntoView({ behavior, block: 'start' });
        }
      });
    });

    try {
      const result = await loadStockDeepDiveData(entityKey, {
        loadDetail: (key) => api.stockDetail(key),
        loadRelation: (key) => api.entityRelations(key, 2),
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
      className={styles.deepDiveRegion}
      data-state={detailState}
      data-testid="stock-deep-dive-region"
      tabIndex={-1}
    >
      <StockDeepDivePanel
        deepDive={deepDive}
        errorMessage={detailError}
        relation={relation}
        state={detailState}
        onRetry={() => selectedEntityKey && void loadDeepDive(selectedEntityKey)}
        onSelectEntity={(entityKey) => void loadDeepDive(entityKey)}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="종목 리서치"
        title="종목"
        description="관심·보유 여부와 분석 준비 상태를 한 표에서 확인합니다."
        asOf={data.meta.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <div className={styles.stocksWorkspace}>
        {compactLayout ? detailRegion : null}

        <section
          className={styles.panel}
          data-pending={pending || undefined}
          aria-busy={pending || undefined}
        >
          <header className={styles.panelHeader}>
            <div>
              <h2>종목 커버리지</h2>
              <p aria-live="polite">
                {pending
                  ? '검색 결과를 갱신하고 있습니다'
                  : `${stocks.length}개 표시 · ${availabilityLabels[data.availability]}`}
              </p>
            </div>
          </header>
          <div className={styles.tableWrap}>
            <table className={styles.stockTable}>
              <caption className={styles.srOnly}>종목 커버리지</caption>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>시장</th>
                  <th>현재 상태</th>
                  <th>최근 가격</th>
                  <th>변화율</th>
                  <th>분석 시각</th>
                </tr>
              </thead>
              <tbody>
                {!pending && stocks.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <WorkspaceState
                        kind="empty"
                        title="조건에 맞는 종목이 없습니다"
                        description="검색어를 지우거나 다른 종목 이름과 티커를 입력해 보세요."
                      />
                    </td>
                  </tr>
                )}
                {stocks.map((stock) => (
                  <tr
                    key={stock.entityKey}
                    className={stocks.length > 100 ? styles.deferredTableRow : undefined}
                    data-selected={selectedEntityKey === stock.entityKey || undefined}
                  >
                    <td aria-label={`${stock.displayName} ${stock.ticker}`}>
                      <button
                        type="button"
                        className={styles.stockSelectButton}
                        aria-pressed={selectedEntityKey === stock.entityKey}
                        onClick={() => void loadDeepDive(stock.entityKey)}
                      >
                        <strong>{stock.displayName}</strong>
                        <small>{stock.ticker}</small>
                      </button>
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
                    <td className={(stock.changePct ?? 0) < 0 ? styles.negative : styles.positive}>
                      {stock.changePct === undefined ? '—' : `${stock.changePct.toFixed(2)}%`}
                    </td>
                    <td>{formatDate(stock.lastAnalyzedAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {!compactLayout ? detailRegion : null}
      </div>
    </>
  );
}
