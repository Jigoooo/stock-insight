import { useMemo, useState, type ReactNode } from 'react';

import { GeoMarketMap } from './geo-market-map';
import styles from './market-overview.module.css';
import { formatDate, marketLabel, signalTypeLabel } from './research-workspace-page';
import {
  MARKET_MODE_IDS,
  buildMarketOverview,
  describeMarketModeState,
  marketConnectionLabel,
  resolveMarketComponentWatermark,
  type MarketModeId,
} from '../model/market-overview';

import { ToggleGroup } from '@/shared/ui/toggle-group';
import { DataTable, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

const availabilityLabel = {
  available: '사용 가능',
  partial: '관측 기반',
  empty: '신호 없음',
  missing: '원천 준비 중',
} as const;
const componentAvailabilityLabel = {
  available: '최신',
  partial: '부분 제공',
  empty: '데이터 없음',
  stale: '갱신 지연',
  missing: '원천 미연결',
  error: '확인 필요',
} as const;
export function MarketOverviewPanel({
  data,
  eventContent,
  footer,
  geoSnapshot,
}: {
  data: RadarSignalPage;
  eventContent: ReactNode;
  footer?: ReactNode;
  geoSnapshot: GeoSnapshot;
}) {
  const overview = useMemo(
    () => buildMarketOverview(data.items, geoSnapshot),
    [data.items, geoSnapshot],
  );
  const [activeMode, setActiveMode] = useState<MarketModeId>(MARKET_MODE_IDS[0]);
  const mode = overview.modes.find(({ id }) => id === activeMode) ?? overview.modes[0]!;
  const displayState = describeMarketModeState(mode);
  const componentWatermark = resolveMarketComponentWatermark(
    mode.id,
    data.componentWatermarks,
    geoSnapshot,
  );

  const onModeChange = (nextMode: string) => {
    if (MARKET_MODE_IDS.includes(nextMode as MarketModeId)) {
      setActiveMode(nextMode as MarketModeId);
    }
  };

  const renderModeBody = () => {
    if (componentWatermark.availability === 'error') {
      return (
        <WorkspaceState
          kind="error"
          title={`${mode.title} 데이터를 확인하지 못했습니다`}
          description="연결된 원천 상태를 확인한 뒤 이 화면을 다시 살펴보세요."
        />
      );
    }

    if (displayState.kind !== 'content') {
      return (
        <WorkspaceState
          kind={displayState.kind === 'missing' ? 'unavailable' : 'empty'}
          title={displayState.title}
          description={displayState.description}
        />
      );
    }

    const availabilityState =
      componentWatermark.availability === 'partial' ? (
        <WorkspaceState
          className={styles.marketModeNotice}
          kind="partial"
          title={`${mode.title} 데이터가 부분 제공됩니다`}
          description={mode.limitation ?? '현재 확인 가능한 원천 범위만 표시합니다.'}
        />
      ) : componentWatermark.availability === 'stale' ? (
        <WorkspaceState
          className={styles.marketModeNotice}
          kind="stale"
          title={`${mode.title} 데이터 갱신이 지연되었습니다`}
          description="표시된 기준 시각을 확인하고 최신 원천과 함께 해석하세요."
        />
      ) : null;

    let content: ReactNode = null;

    if (mode.id === 'event_radar') content = eventContent;

    if (mode.id === 'factor_map') {
      content = (
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
      );
    }

    if (mode.id === 'propagation_map') {
      content = (
        <div className={styles.marketFlowGrid}>
          {overview.signalTypeGroups.map((group) => (
            <article
              key={group.signalType}
              className={styles.marketModeCard}
              data-testid="market-propagation-group"
            >
              <div className={styles.marketFlowSource}>
                <strong>{signalTypeLabel(group.signalType)}</strong>
                <span>동일 유형 관측</span>
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
    }

    if (mode.id === 'heatmap_matrix') {
      content = (
        <DataTable
          caption="종목별 시장 신호 강도와 관심·보유 연결 상태"
          captionClassName={styles.marketSrOnly}
          className={styles.marketHeatmap}
          containerProps={{ className: styles.marketTableWrap }}
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
      );
    }

    if (mode.id === 'timeline') {
      content = (
        <StructuredList className={styles.marketTimeline} aria-label="시장 신호 타임라인">
          {overview.timelineItems.map((item) => (
            <li key={item.signalKey} data-testid="market-timeline-row">
              <time dateTime={item.occurredAt}>{formatDate(item.occurredAt, true)}</time>
              <span aria-hidden="true" />
              <div>
                <strong>{item.name}</strong>
                <p>
                  {signalTypeLabel(item.signalType)} · 강도 {Math.round(item.strength * 100)}
                </p>
              </div>
            </li>
          ))}
        </StructuredList>
      );
    }

    if (mode.id === 'map_globe') content = <GeoMarketMap snapshot={geoSnapshot} />;

    return (
      <>
        {availabilityState}
        {content}
      </>
    );
  };

  return (
    <section className={styles.marketModePanel} aria-label="시장 시각화">
      <ToggleGroup
        aria-label="시장 화면 선택"
        className={styles.marketModeNav}
        items={overview.modes.map((item) => ({
          value: item.id,
          label: (
            <span className={styles.marketModeOption}>
              <span>{item.shortTitle}</span>
              <small>{availabilityLabel[item.availability]}</small>
            </span>
          ),
        }))}
        value={activeMode}
        onValueChange={onModeChange}
      />

      <header className={styles.marketModeHeader}>
        <div>
          <h2>{mode.title}</h2>
          <p>{mode.description}</p>
        </div>
        <span data-availability={mode.availability}>{availabilityLabel[mode.availability]}</span>
      </header>

      <output
        className={styles.marketComponentWatermark}
        data-testid="market-component-watermark"
        data-component-availability={componentWatermark.availability}
        aria-live="polite"
      >
        <strong>{componentAvailabilityLabel[componentWatermark.availability]}</strong>
        {componentWatermark.watermarkAt ? (
          <time dateTime={componentWatermark.watermarkAt}>
            기준 {formatDate(componentWatermark.watermarkAt, true)}
          </time>
        ) : (
          <span>기준 시각 없음</span>
        )}
        <span>{componentWatermark.rowCount.toLocaleString('ko-KR')}건</span>
      </output>

      {mode.limitation && mode.availability !== 'missing' ? (
        <p className={styles.marketLimitation} role="note">
          {mode.limitation}
        </p>
      ) : null}

      <div
        role="region"
        aria-label={`${mode.title} 화면`}
        className={styles.marketModeBody}
        data-display-state={displayState.kind}
        data-testid={`market-mode-${mode.id}`}
      >
        {renderModeBody()}
      </div>
      {footer && mode.id === 'event_radar' ? (
        <footer className={styles.marketModeFooter} data-testid="market-mode-footer">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
