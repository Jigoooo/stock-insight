import type { MouseEvent, ReactNode } from 'react';

import type { VisibleWatchlistItem } from './stock-briefing-sections-model';
import styles from './views/stocks-view.module.css';
import { analysisStatusLabel, formatDate, formatNumber, marketLabel } from './workspace-presenters';
import type { StocksBriefingModel, StockBriefingItem } from '../model/stock-briefing';

import { Button } from '@/shared/ui/button';
import { Panel, PanelHeader, WorkspaceState } from '@/shared/ui/workspace';
import type { StockListItem } from '@stock-insight/contracts';

type SelectStock = (entityKey: string, opener: HTMLElement) => void;

function UnavailableValue({ label }: { label: string }) {
  return <span aria-label={label}>—</span>;
}

function metricCount(value: number | null) {
  return value === null ? <UnavailableValue label="집계 데이터 없음" /> : `${value}건`;
}

export function StockBriefingSummary({ summary }: { summary: StocksBriefingModel['summary'] }) {
  return (
    <Panel aria-labelledby="stocks-briefing-summary-title">
      <PanelHeader>
        <h2 id="stocks-briefing-summary-title">내 종목 브리핑</h2>
        <p>보유 종목과 연결된 새 근거를 먼저 확인합니다.</p>
      </PanelHeader>
      <dl className={styles.summaryGrid}>
        <div>
          <dt>보유종목</dt>
          <dd>{summary.holdingCount}개</dd>
        </div>
        <div>
          <dt>연결 뉴스</dt>
          <dd>{metricCount(summary.connectedNewsCount)}</dd>
        </div>
        <div>
          <dt>확인할 리스크</dt>
          <dd>{metricCount(summary.riskCount)}</dd>
        </div>
        <div>
          <dt>최근 분석</dt>
          <dd>
            {summary.analyzedAt ? (
              <time dateTime={summary.analyzedAt}>{formatDate(summary.analyzedAt, true)}</time>
            ) : (
              <UnavailableValue label="분석 시각 없음" />
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function priceLabel(stock: StockListItem) {
  if (stock.latestPrice === undefined) return '—';
  const unit = stock.currency === 'KRW' ? '원' : stock.currency === 'USD' ? '달러' : '';
  return `${formatNumber(stock.latestPrice)}${unit ? ` ${unit}` : ''}`;
}

function priorityLabel(briefing: StockBriefingItem) {
  return briefing.priority ? `우선 ${briefing.priority}` : undefined;
}

function StockRow({
  briefing,
  context,
  onSelect,
  selected,
  stock,
}: {
  briefing?: StockBriefingItem;
  context: 'holding' | 'priority' | 'watchlist';
  onSelect: SelectStock;
  selected: boolean;
  stock: StockListItem;
}) {
  const changeClassName =
    stock.changePct === undefined
      ? undefined
      : stock.changePct < 0
        ? styles.negative
        : styles.positive;
  const rank = briefing ? priorityLabel(briefing) : undefined;
  return (
    <Button
      type="button"
      motion="quiet"
      variant="ghost"
      className={styles.stockRow}
      data-context={context}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${stock.displayName} 종목 브리핑 열기`}
      onClick={(event: MouseEvent<HTMLButtonElement>) =>
        onSelect(stock.entityKey, event.currentTarget)
      }
    >
      <span className={styles.stockRowLayout}>
        <span className={styles.stockIdentity}>
          <strong>{stock.displayName}</strong>
          <small>
            {marketLabel(stock.market)} · {stock.ticker}
          </small>
        </span>
        {briefing ? (
          <span className={styles.briefingCopy}>
            {rank ? <span className={styles.priorityRank}>{rank}</span> : null}
            <strong>{briefing.changeSummary}</strong>
            <small>{briefing.connectionReason}</small>
            {briefing.primaryPath ? <small>{briefing.primaryPath}</small> : null}
            {briefing.riskSummary ? (
              <small className={styles.riskSummary}>확인할 리스크 · {briefing.riskSummary}</small>
            ) : null}
          </span>
        ) : (
          <span className={styles.briefingCopy}>
            <strong>
              {stock.primaryThesis ??
                (context === 'watchlist'
                  ? '새로 연결된 변화는 없습니다.'
                  : '최근 종목 상태를 확인합니다.')}
            </strong>
            <small>{analysisStatusLabel(stock.analysisStatus)}</small>
            {context === 'holding' ? (
              <small className={styles.analysisTime}>
                최근 분석 ·{' '}
                {stock.lastAnalyzedAt ? (
                  <time dateTime={stock.lastAnalyzedAt}>
                    {formatDate(stock.lastAnalyzedAt, true)}
                  </time>
                ) : (
                  <span aria-label="분석 시각 없음">분석 시각 없음</span>
                )}
              </small>
            ) : null}
          </span>
        )}
        <span className={styles.stockMetrics}>
          <strong>{priceLabel(stock)}</strong>
          <small className={changeClassName}>
            {stock.changePct === undefined ? '변화율 —' : `${stock.changePct.toFixed(2)}%`}
          </small>
          {briefing ? <small>연결 뉴스 {briefing.newsCount}건</small> : null}
        </span>
      </span>
    </Button>
  );
}

function SectionState({ children }: { children: ReactNode }) {
  return <div className={styles.sectionState}>{children}</div>;
}

export function PriorityHoldingsSection({
  hasBriefing,
  items,
  onSelect,
  selectedStockKey,
}: {
  hasBriefing: boolean;
  items: Array<{ briefing: StockBriefingItem; stock: StockListItem }>;
  onSelect: SelectStock;
  selectedStockKey?: string;
}) {
  return (
    <Panel aria-labelledby="priority-holdings-title">
      <PanelHeader>
        <h2 id="priority-holdings-title">우선 확인할 보유종목</h2>
        <p>새 근거가 연결된 보유 종목을 최대 3개 표시합니다.</p>
      </PanelHeader>
      {items.length > 0 ? (
        <div className={styles.stockList}>
          {items.map(({ briefing, stock }) => (
            <StockRow
              key={stock.entityKey}
              briefing={briefing}
              context="priority"
              onSelect={onSelect}
              selected={selectedStockKey === stock.entityKey}
              stock={stock}
            />
          ))}
        </div>
      ) : (
        <SectionState>
          <WorkspaceState
            kind={hasBriefing ? 'empty' : 'unavailable'}
            title={hasBriefing ? '검색 결과에 우선 종목이 없습니다' : '우선 브리핑 집계 전입니다'}
            description={
              hasBriefing
                ? '검색어를 지우면 다른 우선 보유종목을 확인할 수 있습니다.'
                : '우선순위를 임의로 만들지 않고, 연결 근거가 준비되면 표시합니다.'
            }
          />
        </SectionState>
      )}
    </Panel>
  );
}

export function HoldingsSection({
  children,
  countLabel,
}: {
  children: ReactNode;
  countLabel: string;
}) {
  return (
    <Panel id="stock-holdings" aria-labelledby="stock-holdings-title">
      <PanelHeader>
        <h2 id="stock-holdings-title">전체 보유종목</h2>
        <p>{countLabel}</p>
      </PanelHeader>
      {children}
    </Panel>
  );
}

export function HoldingRows({
  items,
  onSelect,
  selectedStockKey,
}: {
  items: StockListItem[];
  onSelect: SelectStock;
  selectedStockKey?: string;
}) {
  if (items.length === 0) {
    return (
      <SectionState>
        <WorkspaceState
          kind="empty"
          title="보유종목이 없습니다"
          description="현재 검색 결과에서 확인할 보유종목이 없습니다."
        />
      </SectionState>
    );
  }
  return (
    <div className={styles.stockList}>
      {items.map((stock) => (
        <StockRow
          key={stock.entityKey}
          context="holding"
          onSelect={onSelect}
          selected={selectedStockKey === stock.entityKey}
          stock={stock}
        />
      ))}
    </div>
  );
}

export function WatchlistSection({
  expanded,
  items,
  onExpandedChange,
  onSelect,
  selectedStockKey,
  watchedCount,
}: {
  expanded: boolean;
  items: VisibleWatchlistItem[];
  onExpandedChange: (expanded: boolean) => void;
  onSelect: SelectStock;
  selectedStockKey?: string;
  watchedCount: number;
}) {
  const action =
    watchedCount > 0 ? (
      <Button
        type="button"
        motion="quiet"
        size="sm"
        variant="outline"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        {expanded ? '관심종목 접기' : '전체 관심종목 보기'}
      </Button>
    ) : null;
  return (
    <Panel aria-labelledby="stock-watchlist-title">
      <PanelHeader meta={action}>
        <h2 id="stock-watchlist-title">변화가 있는 관심종목</h2>
        <p>
          {expanded ? `전체 관심종목 ${watchedCount}개` : '새 근거가 연결된 종목만 표시합니다.'}
        </p>
      </PanelHeader>
      {items.length > 0 ? (
        <div className={styles.stockList}>
          {items.map(({ briefing, stock }) => (
            <StockRow
              key={stock.entityKey}
              briefing={briefing}
              context="watchlist"
              onSelect={onSelect}
              selected={selectedStockKey === stock.entityKey}
              stock={stock}
            />
          ))}
        </div>
      ) : (
        <SectionState>
          <WorkspaceState
            kind="empty"
            title={
              watchedCount === 0 ? '관심종목이 없습니다' : '새로 연결된 관심종목 변화가 없습니다'
            }
            description={
              watchedCount === 0
                ? '현재 검색 결과에서 확인할 관심종목이 없습니다.'
                : '변화를 임의로 만들지 않습니다. 전체 목록은 위 버튼에서 확인할 수 있습니다.'
            }
          />
        </SectionState>
      )}
    </Panel>
  );
}
