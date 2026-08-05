import { useReducedMotion } from 'motion/react';

import type {
  ChartBar,
  ChartPreviewState,
  ChartRange,
  ChartRangeSelection,
  MarketTapeVariantId,
} from './chart-catalog-model';
import styles from './chart-catalog.module.css';
import { ChartPreviewFrame, type ChartSummary } from './chart-preview-frame';

import { BklitMarketTapeRenderer } from '@/shared/ui/chart/internal/bklit-preview';

export type MarketTapePreviewProps = {
  bars: readonly ChartBar[];
  currency: 'KRW' | 'USD';
  range: ChartRange;
  rangeSelection: ChartRangeSelection | null;
  state: ChartPreviewState;
  variantId: MarketTapeVariantId;
  onRangeSelectionChange: (selection: ChartRangeSelection | null) => void;
  onRetry: () => void;
};

const variantCopy: Record<MarketTapeVariantId, { title: string; description: string }> = {
  'quiet-trace': {
    title: 'A · Quiet Trace',
    description: '얇은 종가선과 최소 grid로 기간 흐름만 조용히 남깁니다.',
  },
  'layered-range': {
    title: 'B · Layered Range',
    description: '면, main plot, brush well을 층으로 나눠 선택 구간을 읽습니다.',
  },
  'signal-ledger': {
    title: 'C · Signal Ledger',
    description: '날짜와 최신값, 변화율, 거래량 상태를 압축 원장으로 확인합니다.',
  },
};

function formatPrice(currency: 'KRW' | 'USD', value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function createSummary(bars: readonly ChartBar[], currency: 'KRW' | 'USD'): ChartSummary {
  const first = bars[0];
  const last = bars.at(-1);
  if (!(first && last)) {
    return { latest: '—', change: '—', high: '—', low: '—', asOf: '—' };
  }
  const change = ((last.close - first.close) / first.close) * 100;
  return {
    latest: formatPrice(currency, last.close),
    change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    high: formatPrice(currency, Math.max(...bars.map(({ high }) => high))),
    low: formatPrice(currency, Math.min(...bars.map(({ low }) => low))),
    asOf: last.date.toLocaleDateString('ko-KR'),
  };
}

function rangeReadout(bars: readonly ChartBar[], selection: ChartRangeSelection | null) {
  const start = selection?.start ?? bars[0]?.date;
  const end = selection?.end ?? bars.at(-1)?.date;
  if (!(start && end)) return '선택 구간 없음';
  const selectedCount = bars.filter(
    ({ date }) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime(),
  ).length;
  return `${start.toLocaleDateString('ko-KR')} – ${end.toLocaleDateString('ko-KR')} · ${selectedCount}개`;
}

export function MarketTapePreview({
  bars,
  currency,
  range,
  rangeSelection,
  state,
  variantId,
  onRangeSelectionChange,
  onRetry,
}: MarketTapePreviewProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const copy = variantCopy[variantId];
  const summary = createSummary(bars, currency);
  const volumeMissing = bars.filter(({ volume }) => volume === null).length;

  return (
    <ChartPreviewFrame
      bars={bars}
      currency={currency}
      description={copy.description}
      limitation={
        state === 'partial' ? `${volumeMissing}개 일봉의 거래량이 비어 있습니다.` : undefined
      }
      state={state}
      summary={summary}
      title={copy.title}
      variantId={variantId}
      onRetry={onRetry}
    >
      <div className={styles.marketPreview} data-range={range} data-slot="market-tape-preview">
        <div className={styles.rangeReadout} data-slot="chart-range-readout">
          <span>선택 범위</span>
          <strong>{rangeReadout(bars, rangeSelection)}</strong>
        </div>
        {variantId === 'signal-ledger' ? (
          <div className={styles.signalLedger} aria-label="시장 신호 원장">
            <span>{bars.at(-1)?.date.toLocaleDateString('ko-KR') ?? '—'}</span>
            <strong>{summary.latest}</strong>
            <span>{summary.change}</span>
            <span>{volumeMissing > 0 ? `거래량 누락 ${volumeMissing}` : '거래량 정상'}</span>
          </div>
        ) : null}
        <BklitMarketTapeRenderer
          bars={bars}
          currency={currency}
          rangeSelection={rangeSelection}
          reducedMotion={reducedMotion}
          status="ready"
          tone={variantId}
          onRangeSelectionChange={onRangeSelectionChange}
        />
      </div>
    </ChartPreviewFrame>
  );
}
