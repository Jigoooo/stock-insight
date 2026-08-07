import { useMemo, useState, type ReactNode } from 'react';

import { GeoMarketMap } from './geo-market-map';
import styles from './market-overview.module.css';
import { formatDate, marketLabel, signalTypeLabel } from './workspace-presenters';
import type { MarketConnectionItem, MarketConnectionsModel } from '../model/market-connections';
import {
  MARKET_EXPLORATION_IDS,
  buildMarketOverview,
  marketConnectionLabel,
  resolveMarketExplorationState,
  type MarketExplorationId,
} from '../model/market-overview';

import { Button } from '@/shared/ui/button';
import { ToggleGroup } from '@/shared/ui/toggle-group';
import { DataTable, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

const componentAvailabilityLabel = {
  available: '최신',
  partial: '부분 제공',
  stale: '갱신 지연',
  missing: '데이터 없음',
  error: '확인 필요',
} as const;

export function MarketExploration({
  data,
  geoSnapshot,
  marketConnections,
  onSelectConnection,
  selectedConnectionKey,
}: {
  data: RadarSignalPage;
  geoSnapshot: GeoSnapshot;
  marketConnections: MarketConnectionsModel;
  onSelectConnection: (item: MarketConnectionItem, opener: HTMLButtonElement) => void;
  selectedConnectionKey?: string;
}) {
  const overview = useMemo(
    () => buildMarketOverview(data.items, geoSnapshot),
    [data.items, geoSnapshot],
  );
  const connectionsByKey = useMemo(
    () =>
      new Map(
        [...marketConnections.priorityChanges, ...marketConnections.marketChanges].map((item) => [
          item.connectionKey,
          item,
        ]),
      ),
    [marketConnections.marketChanges, marketConnections.priorityChanges],
  );
  const [activeMode, setActiveMode] = useState<MarketExplorationId>(MARKET_EXPLORATION_IDS[0]);
  const mode =
    overview.explorations.find(({ id }) => id === activeMode) ?? overview.explorations[0]!;
  const componentState = resolveMarketExplorationState(
    mode.id,
    data.componentWatermarks,
    geoSnapshot,
  );

  const onModeChange = (nextMode: string) => {
    if (MARKET_EXPLORATION_IDS.includes(nextMode as MarketExplorationId)) {
      setActiveMode(nextMode as MarketExplorationId);
    }
  };

  const renderFactorMap = () => (
    <>
      <div className={styles.marketModeGrid}>
        {overview.signalTypeGroups.map((group) => (
          <article
            key={group.signalType}
            className={styles.marketModeCard}
            data-testid="market-factor-group"
          >
            <div className={styles.marketCardHeading}>
              <strong>{signalTypeLabel(group.signalType)}</strong>
              <span>{group.signalCount}건 관측</span>
            </div>
            <div className={styles.marketStrengthTrack} aria-hidden="true">
              <span
                style={{ '--strength': `${group.maxStrength * 100}%` } as React.CSSProperties}
              />
            </div>
            <p>
              최대 강도 {Math.round(group.maxStrength * 100)} · 대상 {group.targets.length}개
            </p>
            <div className={styles.marketTargetList}>
              {group.targets.map((target) => (
                <span key={target.entityKey}>
                  {target.name} · {target.symbol}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
      <DataTable
        caption="종목별 시장 신호 강도와 관심·보유 연결 상태"
        className={styles.marketHeatmap}
        containerProps={{
          className: styles.marketTableWrap,
          'aria-label': '종목별 시장 신호 비교표 가로 스크롤 영역',
          tabIndex: 0,
        }}
      >
        <thead>
          <tr>
            <th scope="col">종목</th>
            <th scope="col">시장</th>
            <th scope="col">신호</th>
            <th scope="col">강도</th>
            <th scope="col">연결</th>
          </tr>
        </thead>
        <tbody>
          {overview.heatmapRows.map((item) => (
            <tr key={item.signalKey} data-testid="market-heatmap-row">
              <td>
                <strong>{item.name}</strong>
                <small>{item.symbol}</small>
              </td>
              <td>{marketLabel(item.market)}</td>
              <td>{signalTypeLabel(item.signalType)}</td>
              <td aria-label={`강도 ${item.strengthPercent}`}>
                <div className={styles.marketHeatCell}>
                  <span
                    aria-hidden="true"
                    style={{ '--strength': `${item.strengthPercent}%` } as React.CSSProperties}
                  />
                  <strong>{item.strengthPercent}</strong>
                </div>
              </td>
              <td>{marketConnectionLabel(item)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );

  const renderPropagationMap = () => (
    <div className={styles.marketFlowGrid}>
      {overview.propagationItems.map((group) => (
        <article
          key={group.signalType}
          className={styles.marketModeCard}
          data-testid="market-propagation-group"
        >
          <div className={styles.marketFlowSource}>
            <strong>{signalTypeLabel(group.signalType)}</strong>
            <span>관측 시작점</span>
          </div>
          <div className={styles.marketFlowDirection} aria-hidden="true">
            ↓
          </div>
          <div className={styles.marketFlowTargets}>
            {group.targets.map((target) => (
              <span key={target.entityKey}>
                <small>{marketLabel(target.market)}</small>
                {target.name}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );

  const renderTimeline = () => (
    <StructuredList className={styles.marketTimeline} aria-label="시장 신호 타임라인">
      {overview.timelineItems.map((item) => {
        const connection = connectionsByKey.get(item.signalKey);
        const content = (
          <>
            <strong>{item.name}</strong>
            <p>
              {signalTypeLabel(item.signalType)} · 강도 {Math.round(item.strength * 100)}
            </p>
          </>
        );
        return (
          <li key={item.signalKey} data-testid="market-timeline-row">
            <time dateTime={item.occurredAt}>{formatDate(item.occurredAt, true)}</time>
            <span aria-hidden="true" />
            {connection ? (
              <Button
                type="button"
                motion="quiet"
                variant="ghost"
                className={styles.marketTimelineAction}
                aria-current={
                  selectedConnectionKey === connection.connectionKey ? 'true' : undefined
                }
                aria-label={`${connection.title} 시장 변화 상세 열기`}
                onClick={(event) => onSelectConnection(connection, event.currentTarget)}
              >
                {content}
              </Button>
            ) : (
              <div>{content}</div>
            )}
          </li>
        );
      })}
    </StructuredList>
  );

  const renderContent = (): ReactNode => {
    if (componentState.availability === 'error') {
      return (
        <WorkspaceState
          kind="error"
          title={`${mode.title} 데이터를 확인하지 못했습니다`}
          description="연결된 원천 상태를 확인한 뒤 이 탐색을 다시 살펴보세요."
        />
      );
    }
    if (componentState.availability === 'missing') {
      return (
        <WorkspaceState
          kind="unavailable"
          title={`${mode.title} 데이터 준비 중`}
          description="현재 기준 시점에 확인 가능한 데이터가 없습니다. 다른 탐색의 상태와는 별도로 표시합니다."
        />
      );
    }

    const notice =
      componentState.availability === 'partial' ? (
        <WorkspaceState
          className={styles.marketModeNotice}
          kind="partial"
          title={`${mode.title} 데이터가 부분 제공됩니다`}
          description={mode.limitation ?? '현재 확인 가능한 원천 범위만 표시합니다.'}
        />
      ) : componentState.availability === 'stale' ? (
        <WorkspaceState
          className={styles.marketModeNotice}
          kind="stale"
          title={`${mode.title} 데이터 갱신이 지연되었습니다`}
          description="갱신 지연 상태입니다. 표시된 기준 시각을 최신 원천과 함께 해석하세요."
        />
      ) : null;

    return (
      <>
        {notice}
        {mode.id === 'factor_map' ? (
          renderFactorMap()
        ) : mode.id === 'propagation_map' ? (
          renderPropagationMap()
        ) : mode.id === 'timeline' ? (
          renderTimeline()
        ) : mode.id === 'map_globe' ? (
          <GeoMarketMap snapshot={geoSnapshot} />
        ) : null}
      </>
    );
  };

  return (
    <section className={styles.marketModePanel} aria-label="시장 보조 탐색">
      <ToggleGroup
        aria-label="시장 보조 탐색 선택"
        className={styles.marketModeNav}
        items={overview.explorations.map((item) => ({
          value: item.id,
          label: item.shortTitle,
        }))}
        value={activeMode}
        onValueChange={onModeChange}
      />
      <header className={styles.marketModeHeader}>
        <div>
          <h2>{mode.title}</h2>
          <p>{mode.description}</p>
        </div>
        <span data-availability={componentState.availability}>
          {componentAvailabilityLabel[componentState.availability]}
        </span>
      </header>
      <output
        className={styles.marketComponentWatermark}
        data-testid="market-component-watermark"
        data-component-availability={componentState.availability}
        aria-live="polite"
      >
        <strong>{componentAvailabilityLabel[componentState.availability]}</strong>
        {componentState.watermarkAt ? (
          <time dateTime={componentState.watermarkAt}>
            기준 {formatDate(componentState.watermarkAt, true)}
          </time>
        ) : (
          <span>기준 시각 없음</span>
        )}
        <span>{componentState.rowCount.toLocaleString('ko-KR')}건</span>
      </output>
      {mode.limitation ? (
        <p className={styles.marketLimitation} role="note">
          {mode.limitation}
        </p>
      ) : null}
      <section
        aria-label={`${mode.title} 화면`}
        className={styles.marketModeBody}
        data-display-state={componentState.availability}
        data-testid={`market-mode-${mode.id}`}
      >
        {renderContent()}
      </section>
    </section>
  );
}
