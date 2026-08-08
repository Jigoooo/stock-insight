import { useRef, type MouseEvent, type ReactNode } from 'react';

import type { DetailState } from './research-workspace-page';
import { useWorkspaceAppendReveal } from './use-workspace-append-reveal';
import styles from './views/market-connections-view.module.css';
import { formatDate, marketLabel } from './workspace-presenters';
import {
  marketConnectionScopeLabel,
  marketConnectionStrengthLabel,
  type MarketConnectionItem,
  type MarketConnectionSummary as MarketConnectionSummaryModel,
} from '../model/market-connections';

import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/button';
import {
  CursorPagination,
  CursorPaginationAction,
  CursorPaginationMessage,
} from '@/shared/ui/pagination';
import { Panel, PanelHeader, WorkspaceState } from '@/shared/ui/workspace';

export type MarketConnectionSelectionProps = {
  interactive: boolean;
  selectedConnectionKey?: string;
  onSelectConnection: (item: MarketConnectionItem, opener: HTMLButtonElement) => void;
};

function UnavailableValue() {
  return <span aria-label="집계 데이터 없음">—</span>;
}

export function MarketConnectionSummary({
  summary,
}: {
  summary: MarketConnectionSummaryModel;
}): ReactNode {
  return (
    <Panel aria-labelledby="market-connection-summary-title">
      <PanelHeader>
        <h2 id="market-connection-summary-title">시장 변화 요약</h2>
        <p>현재 확인 가능한 시장 변화와 내 종목 연결 상태입니다.</p>
      </PanelHeader>
      <dl className={styles.summaryGrid}>
        <div>
          <dt>오늘 감지한 변화</dt>
          <dd>{summary.changeCount}건</dd>
        </div>
        <div>
          <dt>직접 연결</dt>
          <dd>
            {summary.directConnectionCount === null ? (
              <UnavailableValue />
            ) : (
              `${summary.directConnectionCount}건`
            )}
          </dd>
        </div>
        <div>
          <dt>확인할 리스크</dt>
          <dd>{summary.riskCount === null ? <UnavailableValue /> : `${summary.riskCount}건`}</dd>
        </div>
        <div>
          <dt>분석 기준</dt>
          <dd>
            {summary.analyzedAt ? (
              <time dateTime={summary.analyzedAt}>{formatDate(summary.analyzedAt, true)}</time>
            ) : (
              <UnavailableValue />
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function marketRegion(item: MarketConnectionItem) {
  return item.regionLabel
    ? `${marketLabel(item.market)} · ${item.regionLabel}`
    : marketLabel(item.market);
}

function EntityConnections({ item }: { item: MarketConnectionItem }) {
  if (item.connectedEntities.length === 0) {
    return <span className={styles.entityState}>시장 전반 변화</span>;
  }
  return (
    <ul className={styles.entityList} aria-label="연결된 종목">
      {item.connectedEntities.map((entity) => {
        const labels = [entity.holding ? '보유종목' : null, entity.watched ? '관심종목' : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={entity.entityKey}>
            <strong>{entity.displayName}</strong>
            {labels ? <span>{labels}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function selectionClassName(selected: boolean) {
  return [styles.selectionSurface, selected ? styles.selected : null].filter(Boolean).join(' ');
}

export function PriorityMarketChanges({
  interactive,
  items,
  onSelectConnection,
  selectedConnectionKey,
}: MarketConnectionSelectionProps & {
  items: MarketConnectionItem[];
}): ReactNode {
  if (items.length === 0) {
    return (
      <WorkspaceState
        className={styles.personalizationState}
        kind="empty"
        title="개인화된 주요 변화가 없습니다"
        description="보유·관심 종목과 직접 연결된 변화가 확인되면 먼저 표시합니다."
      />
    );
  }

  return (
    <Panel aria-labelledby="priority-market-changes-title">
      <PanelHeader>
        <h2 id="priority-market-changes-title">내 종목에 연결된 주요 변화</h2>
        <p>서버 순서를 유지해 최대 3개를 먼저 보여드립니다.</p>
      </PanelHeader>
      <div className={styles.priorityGrid}>
        {items.slice(0, 3).map((item) => {
          const selected = selectedConnectionKey === item.connectionKey;
          return (
            <Button
              key={item.connectionKey}
              type="button"
              motion="quiet"
              variant="ghost"
              className={selectionClassName(selected)}
              aria-current={selected ? 'true' : undefined}
              aria-label={`${item.title} 시장 변화 상세 열기`}
              disabled={!interactive}
              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                onSelectConnection(item, event.currentTarget)
              }
            >
              <span className={styles.priorityCard}>
                <span className={styles.cardMeta}>
                  <strong>{item.priority ? `우선 ${item.priority}` : '주요 변화'}</strong>
                  <span>{marketRegion(item)}</span>
                </span>
                <strong className={styles.itemTitle}>{item.title}</strong>
                <span className={styles.itemSummary}>{presentResearchSummary(item.summary)}</span>
                {item.whyNow ? (
                  <span className={styles.supportingCopy}>
                    {presentResearchSummary(item.whyNow)}
                  </span>
                ) : null}
                <EntityConnections item={item} />
                {item.primaryPath ? (
                  <span className={styles.supportingCopy}>대표 영향 경로 · {item.primaryPath}</span>
                ) : null}
                {item.riskSummary ? (
                  <span className={styles.riskCopy}>확인할 리스크 · {item.riskSummary}</span>
                ) : null}
                <span className={styles.cardFooter}>
                  <time dateTime={item.occurredAt}>{formatDate(item.occurredAt, true)}</time>
                  <span>강도 {marketConnectionStrengthLabel(item.strength)}</span>
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </Panel>
  );
}

export function MarketChangeList({
  hasNextPage,
  interactive,
  items,
  onLoadMore,
  onSelectConnection,
  pageState,
  selectedConnectionKey,
}: MarketConnectionSelectionProps & {
  items: MarketConnectionItem[];
  pageState: DetailState;
  hasNextPage: boolean;
  onLoadMore: () => void;
}): ReactNode {
  const listRef = useRef<HTMLDivElement>(null);
  useWorkspaceAppendReveal({
    keys: items.map(({ connectionKey }) => connectionKey),
    scopeRef: listRef,
  });

  return (
    <Panel aria-labelledby="other-market-changes-title">
      <PanelHeader>
        <h2 id="other-market-changes-title">그 밖의 시장 변화</h2>
        <p>{items.length}건 표시 · 전체 변화는 상단 요약에서 확인할 수 있습니다.</p>
      </PanelHeader>
      <div className={styles.marketList} ref={listRef}>
        {items.map((item) => {
          const selected = selectedConnectionKey === item.connectionKey;
          return (
            <Button
              key={item.connectionKey}
              type="button"
              motion="quiet"
              variant="ghost"
              className={selectionClassName(selected)}
              data-append-key={item.connectionKey}
              aria-current={selected ? 'true' : undefined}
              aria-label={`${item.title} 시장 변화 상세 열기`}
              disabled={!interactive}
              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                onSelectConnection(item, event.currentTarget)
              }
            >
              <span className={styles.marketRow}>
                <span className={styles.rowScope}>{marketConnectionScopeLabel(item.scope)}</span>
                <strong className={styles.itemTitle}>{item.title}</strong>
                <span className={styles.rowMarket}>{marketRegion(item)}</span>
                <time dateTime={item.occurredAt}>{formatDate(item.occurredAt, true)}</time>
                <span className={styles.rowStrength}>
                  강도 {marketConnectionStrengthLabel(item.strength)}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
      {hasNextPage || pageState !== 'ready' ? (
        <CursorPagination>
          {pageState === 'error' ? (
            <CursorPaginationMessage role="alert">
              다음 시장 변화를 불러오지 못했습니다.
            </CursorPaginationMessage>
          ) : null}
          <CursorPaginationAction
            data-testid="radar-load-more"
            disabled={!interactive || pageState === 'loading' || !hasNextPage}
            onClick={onLoadMore}
          >
            {pageState === 'loading'
              ? '불러오는 중'
              : pageState === 'error'
                ? '다시 시도'
                : '더 보기'}
          </CursorPaginationAction>
        </CursorPagination>
      ) : null}
    </Panel>
  );
}
