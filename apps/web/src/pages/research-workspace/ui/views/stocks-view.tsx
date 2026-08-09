import { useEffect, useMemo, useRef, useState } from 'react';

import {
  loadStockBriefingData,
  type StockBriefingDetail,
  type StockBriefingLoader,
  type StocksBriefingModel,
} from '../../model/stock-briefing';
import { createLatestRequestGate } from '../../model/stock-deep-dive';
import { paginateStockRows } from '../../model/stock-table-pagination';
import {
  StockBriefingInspector,
  type StockBriefingInspectorState,
} from '../stock-briefing-inspector';
import {
  HoldingRows,
  HoldingsSection,
  PriorityHoldingsSection,
  StockBriefingSummary,
  WatchlistSection,
} from '../stock-briefing-sections';
import { selectVisibleStockBriefing } from '../stock-briefing-sections-model';
import styles from './stocks-view.module.css';

import {
  Pagination,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
  PaginationStatus,
} from '@/shared/ui/pagination';
import { AvailabilityNotice, PageHeader, WorkspaceState } from '@/shared/ui/workspace';
import { createApiClient } from '@stock-insight/api-client';
import type { StockListResponse } from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

export function StocksView({
  briefing,
  data,
  interactive,
  loadStockBriefingDetail,
  pending,
  stocks,
}: {
  briefing: StocksBriefingModel;
  data: StockListResponse;
  interactive: boolean;
  loadStockBriefingDetail?: StockBriefingLoader;
  pending: boolean;
  stocks: StockListResponse['data'];
}) {
  const api = useMemo(() => createApiClient(), []);
  const requestGateRef = useRef(createLatestRequestGate());
  const inspectorOpenerRef = useRef<HTMLElement | null>(null);
  const [selectedStockKey, setSelectedStockKey] = useState<string>();
  const [detail, setDetail] = useState<StockBriefingDetail | null>(null);
  const [relation, setRelation] = useState<EntityRelationGraph | null>(null);
  const [detailState, setDetailState] = useState<StockBriefingInspectorState>('loading');
  const [detailError, setDetailError] = useState<string>();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllWatchlist, setShowAllWatchlist] = useState(false);
  const [pageRows, setPageRows] = useState(stocks);
  if (pageRows !== stocks) {
    setPageRows(stocks);
    setCurrentPage(1);
  }
  const visible = useMemo(
    () => selectVisibleStockBriefing(briefing, stocks, showAllWatchlist),
    [briefing, showAllWatchlist, stocks],
  );
  const page = paginateStockRows(visible.holdings, currentPage);

  useEffect(
    () => () => {
      requestGateRef.current.invalidate();
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

  async function loadBriefing(entityKey: string, opener?: HTMLElement) {
    const sequence = requestGateRef.current.next();
    if (opener) inspectorOpenerRef.current = opener;
    setSelectedStockKey(entityKey);
    setInspectorOpen(true);
    setDetailState('loading');
    setDetailError(undefined);

    try {
      const whyNow = [...briefing.priorityHoldings, ...briefing.watchlistChanges].find(
        (item) => item.entityKey === entityKey,
      );
      const result = loadStockBriefingDetail
        ? await loadStockBriefingDetail(entityKey)
        : await loadStockBriefingData(entityKey, {
            loadDetail: (key) => api.stockDetail(key),
            loadRelation: (key) => api.entityRelations(key, 2),
            loadImpactBrief: (key) => api.impactBrief(key),
            whyNow,
          });
      if (!requestGateRef.current.isCurrent(sequence)) return;
      setRelation(result.relation);
      setDetail(result.detail);
      setDetailState('ready');
    } catch (error) {
      if (!requestGateRef.current.isCurrent(sequence)) return;
      setRelation(null);
      setDetailError(error instanceof Error ? error.message : '종목 상세를 불러오지 못했습니다.');
      setDetailState('error');
    }
  }

  function closeInspector() {
    setInspectorOpen(false);
    const opener = inspectorOpenerRef.current;
    if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
  }

  const searchEmpty = data.data.length > 0 && stocks.length === 0;
  const portfolioEmpty = data.data.length === 0;
  const hasUnfilteredHoldings = data.data.some(({ isHolding }) => isHolding);

  return (
    <>
      <PageHeader
        title="내 종목"
        description="보유·관심 종목에 새로 연결된 근거와 확인할 리스크를 살펴봅니다."
        asOf={data.meta.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <div
        className={styles.workspace}
        data-pending={pending || undefined}
        aria-busy={pending || undefined}
      >
        <fieldset className={styles.briefingContent} disabled={!interactive}>
          <StockBriefingSummary summary={briefing.summary} />
          {!pending && searchEmpty ? (
            <WorkspaceState
              className={styles.searchState}
              kind="empty"
              title="조건에 맞는 종목이 없습니다"
              description="검색어를 지우거나 다른 종목 이름과 티커를 입력해 보세요."
            />
          ) : !pending && portfolioEmpty ? (
            <WorkspaceState
              className={styles.searchState}
              kind="empty"
              title="아직 보유·관심 종목이 없습니다"
              description="보유 또는 관심 종목이 연결되면 개인 브리핑을 확인할 수 있습니다."
            />
          ) : !hasUnfilteredHoldings ? (
            <>
              <WatchlistSection
                expanded={showAllWatchlist}
                items={visible.watchlist}
                onExpandedChange={setShowAllWatchlist}
                onSelect={(entityKey, opener) => void loadBriefing(entityKey, opener)}
                selectedStockKey={selectedStockKey}
                watchedCount={visible.watchedNonHoldings.length}
              />
              <WorkspaceState
                className={styles.holdingGuidance}
                kind="empty"
                title="보유종목 등록이 필요합니다"
                description="보유종목이 연결되면 우선 브리핑과 전체 보유종목 목록을 확인할 수 있습니다."
              />
            </>
          ) : (
            <>
              <div className={styles.briefingColumns}>
                <PriorityHoldingsSection
                  hasBriefing={briefing.priorityHoldings.length > 0}
                  items={visible.priorityHoldings}
                  onSelect={(entityKey, opener) => void loadBriefing(entityKey, opener)}
                  selectedStockKey={selectedStockKey}
                />
                <HoldingsSection
                  countLabel={
                    pending
                      ? '검색 결과를 갱신하고 있습니다'
                      : `${visible.holdings.length}개 중 ${
                          visible.holdings.length === 0 ? 0 : page.startIndex + 1
                        }–${page.endIndex}개 표시`
                  }
                >
                  <HoldingRows
                    items={page.items}
                    onSelect={(entityKey, opener) => void loadBriefing(entityKey, opener)}
                    selectedStockKey={selectedStockKey}
                  />
                  {visible.holdings.length > 0 ? (
                    <Pagination
                      aria-label="보유종목 목록 페이지"
                      className={styles.pagination}
                      variant="hairline"
                    >
                      <PaginationStatus aria-live="polite">
                        {page.currentPage} / {page.pageCount} 페이지
                      </PaginationStatus>
                      <PaginationList>
                        <PaginationItem>
                          <PaginationPrevious
                            disabled={page.currentPage === 1}
                            href="#stock-holdings"
                            label="이전 보유종목 페이지"
                            onClick={() => setCurrentPage(Math.max(1, page.currentPage - 1))}
                          />
                        </PaginationItem>
                        {Array.from({ length: page.pageCount }, (_, index) => index + 1).map(
                          (pageNumber) => (
                            <PaginationItem key={pageNumber}>
                              <PaginationLink
                                current={pageNumber === page.currentPage}
                                href="#stock-holdings"
                                onClick={() => setCurrentPage(pageNumber)}
                              >
                                {pageNumber}
                              </PaginationLink>
                            </PaginationItem>
                          ),
                        )}
                        <PaginationItem>
                          <PaginationNext
                            disabled={page.currentPage === page.pageCount}
                            href="#stock-holdings"
                            label="다음 보유종목 페이지"
                            onClick={() =>
                              setCurrentPage(Math.min(page.pageCount, page.currentPage + 1))
                            }
                          />
                        </PaginationItem>
                      </PaginationList>
                    </Pagination>
                  ) : null}
                </HoldingsSection>
              </div>
              <WatchlistSection
                expanded={showAllWatchlist}
                items={visible.watchlist}
                onExpandedChange={setShowAllWatchlist}
                onSelect={(entityKey, opener) => void loadBriefing(entityKey, opener)}
                selectedStockKey={selectedStockKey}
                watchedCount={visible.watchedNonHoldings.length}
              />
            </>
          )}
        </fieldset>
      </div>
      <StockBriefingInspector
        detail={detail}
        detailKey={selectedStockKey ?? null}
        errorMessage={detailError}
        mobile={isMobileViewport}
        onClose={closeInspector}
        onRetry={() => selectedStockKey && void loadBriefing(selectedStockKey)}
        onSelectEntity={(entityKey) => void loadBriefing(entityKey)}
        open={inspectorOpen}
        relation={relation}
        state={detailState}
      />
    </>
  );
}
