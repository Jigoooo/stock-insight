import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

import { GeoMarketMap } from './geo-market-map';
import {
  WorkspaceState,
  formatDate,
  marketLabel,
  signalTypeLabel,
} from './research-workspace-page';
import styles from './research-workspace-page.module.css';
import {
  MARKET_MODE_IDS,
  buildMarketOverview,
  describeMarketModeState,
  marketConnectionLabel,
  type MarketModeId,
} from '../model/market-overview';

import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

const availabilityLabel = {
  available: '사용 가능',
  partial: '관측 기반',
  empty: '신호 없음',
  missing: '원천 준비 중',
} as const;
const panelId = 'market-mode-panel';

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

  const selectMode = (nextMode: MarketModeId, focus = false) => {
    setActiveMode(nextMode);
    if (focus) {
      requestAnimationFrame(() => document.getElementById(`market-tab-${nextMode}`)?.focus());
    }
  };

  const handleModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = Number(event.currentTarget.dataset.modeIndex ?? 0);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % MARKET_MODE_IDS.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + MARKET_MODE_IDS.length) % MARKET_MODE_IDS.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = MARKET_MODE_IDS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectMode(MARKET_MODE_IDS[nextIndex]!, true);
  };

  const renderModeBody = () => {
    if (displayState.kind !== 'content') {
      return (
        <WorkspaceState
          kind="empty"
          title={displayState.title}
          description={displayState.description}
        />
      );
    }

    if (mode.id === 'event_radar') return eventContent;

    if (mode.id === 'factor_map') {
      return (
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
      return (
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
      return (
        <div className={styles.marketTableWrap}>
          <table className={styles.marketHeatmap}>
            <caption className={styles.srOnly}>종목별 시장 신호 강도와 관심·보유 연결 상태</caption>
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
          </table>
        </div>
      );
    }

    if (mode.id === 'timeline') {
      return (
        <ol className={styles.marketTimeline}>
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
        </ol>
      );
    }

    if (mode.id === 'map_globe') return <GeoMarketMap snapshot={geoSnapshot} />;

    return null;
  };

  return (
    <section className={styles.marketModePanel} aria-label="시장 시각화">
      <div className={styles.marketModeNav} role="tablist" aria-label="시장 화면 선택">
        {overview.modes.map((item, index) => (
          <button
            key={item.id}
            id={`market-tab-${item.id}`}
            type="button"
            role="tab"
            className={styles.marketModeTab}
            aria-selected={item.id === activeMode}
            aria-controls={panelId}
            tabIndex={item.id === activeMode ? 0 : -1}
            data-mode-index={index}
            data-availability={item.availability}
            onClick={() => selectMode(item.id)}
            onKeyDown={handleModeKeyDown}
          >
            <span>{item.shortTitle}</span>
            <small>{availabilityLabel[item.availability]}</small>
          </button>
        ))}
      </div>

      <header className={styles.marketModeHeader}>
        <div>
          <h2>{mode.title}</h2>
          <p>{mode.description}</p>
        </div>
        <span data-availability={mode.availability}>{availabilityLabel[mode.availability]}</span>
      </header>

      {mode.limitation && mode.availability !== 'missing' ? (
        <p className={styles.marketLimitation} role="note">
          {mode.limitation}
        </p>
      ) : null}

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`market-tab-${mode.id}`}
        tabIndex={0}
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
