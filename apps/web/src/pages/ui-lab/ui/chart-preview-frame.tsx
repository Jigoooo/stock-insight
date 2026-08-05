/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The native chart data table needs a focusable horizontal scroll region. */
import { useId, type ReactNode } from 'react';

import type { ChartBar, ChartPreviewState } from './chart-catalog-model';
import styles from './chart-catalog.module.css';

import { Button } from '@/shared/ui/button';
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '@/shared/ui/feedback';

export type ChartSummary = {
  latest: string;
  change: string;
  high: string;
  low: string;
  asOf: string;
};

export type ChartPreviewFrameProps = {
  attribution?: ReactNode;
  bars: readonly ChartBar[];
  children: ReactNode;
  currency: 'KRW' | 'USD';
  description: string;
  limitation?: string;
  state: ChartPreviewState;
  summary: ChartSummary;
  title: string;
  variantId: string;
  onRetry: () => void;
};

function formatNumber(currency: 'KRW' | 'USD', value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

export function ChartDataTable({
  bars,
  currency,
  title,
}: {
  bars: readonly ChartBar[];
  currency: 'KRW' | 'USD';
  title: string;
}) {
  return (
    <details className={styles.dataTable} data-slot="chart-data-table">
      <summary>차트 데이터 표로 보기</summary>
      <section
        aria-label={`${title} 일봉 데이터 스크롤 영역`}
        className={styles.dataTableViewport}
        tabIndex={0}
      >
        <table>
          <caption>{title} 일봉 데이터</caption>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">시가</th>
              <th scope="col">고가</th>
              <th scope="col">저가</th>
              <th scope="col">종가</th>
              <th scope="col">거래량</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.ts}>
                <th scope="row">{bar.date.toLocaleDateString('ko-KR')}</th>
                <td>{formatNumber(currency, bar.open)}</td>
                <td>{formatNumber(currency, bar.high)}</td>
                <td>{formatNumber(currency, bar.low)}</td>
                <td>{formatNumber(currency, bar.close)}</td>
                <td>{bar.volume === null ? '없음' : bar.volume.toLocaleString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </details>
  );
}

function LoadingSurface() {
  return (
    <div className={styles.stateSurface} data-state="loading" aria-live="polite">
      <span className={styles.srOnly}>가격 데이터를 불러오는 중</span>
      <div className={styles.chartSkeleton}>
        <Skeleton height="18px" variant="surface-sweep" width="34%" />
        <Skeleton height="220px" variant="surface-sweep" width="100%" />
        <Skeleton height="44px" variant="surface-sweep" width="100%" />
      </div>
    </div>
  );
}

export function ChartStateSurface({
  children,
  state,
  onRetry,
}: {
  children: ReactNode;
  state: ChartPreviewState;
  onRetry: () => void;
}) {
  if (state === 'loading') return <LoadingSurface />;
  if (state === 'empty') {
    return (
      <div className={styles.stateSurface} data-state="empty">
        <EmptyState variant="quiet-empty">
          <strong>표시할 가격 구간 없음</strong>
          <p>정상 응답이지만 선택 기간에 일봉이 없습니다.</p>
        </EmptyState>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className={styles.stateSurface} data-state="error">
        <ErrorState variant="recovery-panel">
          <strong>가격 데이터 읽기 오류</strong>
          <p>마지막 값을 사실처럼 대신 표시하지 않습니다.</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            다시 시도
          </Button>
        </ErrorState>
      </div>
    );
  }
  if (state === 'unavailable') {
    return (
      <div className={styles.stateSurface} data-state="unavailable">
        <EmptyState variant="inline-empty">
          <strong>이 차트 역할을 제공할 수 없음</strong>
          <p>현재 시장 또는 근거 데이터가 지원 범위에 없습니다.</p>
        </EmptyState>
      </div>
    );
  }
  return children;
}

function QualityNotice({ state, limitation }: { state: ChartPreviewState; limitation?: string }) {
  if (state === 'stale') {
    return (
      <div className={styles.qualityNotice}>
        <StatusBadge availability="stale" label="가격" source="mock" />
        <span>{limitation ?? '마지막 기준 시각 이후 갱신이 지연됐습니다.'}</span>
      </div>
    );
  }
  if (state === 'partial') {
    return (
      <div className={styles.qualityNotice}>
        <StatusBadge availability="missing" label="일부 거래량·근거" source="mock" />
        <span>{limitation ?? '유효한 가격만 표시하고 누락 값은 0으로 채우지 않습니다.'}</span>
      </div>
    );
  }
  return null;
}

export function ChartPreviewFrame({
  attribution,
  bars,
  children,
  currency,
  description,
  limitation,
  state,
  summary,
  title,
  variantId,
  onRetry,
}: ChartPreviewFrameProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <article
      aria-labelledby={titleId}
      className={styles.variantCard}
      data-component="chart"
      data-state={state}
      data-variant={variantId}
    >
      <figure aria-describedby={descriptionId}>
        <header className={styles.variantHeader}>
          <div>
            <h3 id={titleId}>{title}</h3>
            <p id={descriptionId}>{description}</p>
          </div>
          <span data-slot="chart-bar-count">{bars.length} bars</span>
        </header>
        <dl className={styles.chartSummary} data-slot="chart-summary">
          <div>
            <dt>최신</dt>
            <dd>{summary.latest}</dd>
          </div>
          <div>
            <dt>기간 변화</dt>
            <dd>{summary.change}</dd>
          </div>
          <div>
            <dt>고가</dt>
            <dd>{summary.high}</dd>
          </div>
          <div>
            <dt>저가</dt>
            <dd>{summary.low}</dd>
          </div>
          <div>
            <dt>기준</dt>
            <dd>{summary.asOf}</dd>
          </div>
        </dl>
        <QualityNotice limitation={limitation} state={state} />
        <div className={styles.chartViewport} data-slot="chart-viewport">
          <ChartStateSurface state={state} onRetry={onRetry}>
            {children}
          </ChartStateSurface>
        </div>
        <figcaption className={styles.chartFooter}>
          {attribution ? <div className={styles.attribution}>{attribution}</div> : <span />}
          <ChartDataTable bars={bars} currency={currency} title={title} />
        </figcaption>
      </figure>
    </article>
  );
}
