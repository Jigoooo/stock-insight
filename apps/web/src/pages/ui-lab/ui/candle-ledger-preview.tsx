import { useMemo, useState } from 'react';

import type { CandleLedgerVariantId, ChartBar, ChartPreviewState } from './chart-catalog-model';
import styles from './chart-catalog.module.css';
import { ChartPreviewFrame, type ChartSummary } from './chart-preview-frame';

import {
  LightweightCandleRenderer,
  type CandleReadout,
} from '@/shared/ui/chart/internal/lightweight-preview';

export type CandleLedgerPreviewProps = {
  bars: readonly ChartBar[];
  currency: 'KRW' | 'USD';
  state: ChartPreviewState;
  variantId: CandleLedgerVariantId;
  onRetry: () => void;
};

const variantCopy: Record<CandleLedgerVariantId, { title: string; description: string }> = {
  'clean-candle': {
    title: 'A · Clean Candle',
    description: '캔들 가격과 낮은 거래량 strip을 한 화면에 조용히 겹칩니다.',
  },
  'dual-pane': {
    title: 'B · Dual Pane',
    description: '가격 72%, 거래량 28%의 고정 pane으로 OHLCV를 교차 탐색합니다.',
  },
  'market-ledger': {
    title: 'C · Market Ledger',
    description: '촘촘한 시장 grid와 고정 OHLCV 원장을 한 표면에 결합합니다.',
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

function toReadout(bar: ChartBar | undefined, index: number): CandleReadout | null {
  return bar ? { ...bar, index } : null;
}

export function CandleLedgerPreview({
  bars,
  currency,
  state,
  variantId,
  onRetry,
}: CandleLedgerPreviewProps) {
  const lastReadout = useMemo(() => toReadout(bars.at(-1), bars.length - 1), [bars]);
  const [crosshairReadout, setCrosshairReadout] = useState<CandleReadout | null>(null);
  const readout =
    crosshairReadout && bars.some(({ ts }) => ts === crosshairReadout.ts)
      ? crosshairReadout
      : lastReadout;
  const copy = variantCopy[variantId];
  const volumeMissing = bars.filter(({ volume }) => volume === null).length;

  return (
    <ChartPreviewFrame
      attribution={
        <a href="https://www.tradingview.com/" rel="noreferrer" target="_blank">
          TradingView Lightweight Charts
        </a>
      }
      bars={bars}
      currency={currency}
      description={copy.description}
      limitation={
        state === 'partial' ? `${volumeMissing}개 일봉은 거래량 없이 표시합니다.` : undefined
      }
      state={state}
      summary={createSummary(bars, currency)}
      title={copy.title}
      variantId={variantId}
      onRetry={onRetry}
    >
      <div className={styles.candlePreview} data-slot="candle-ledger-preview">
        <dl className={styles.ohlcvReadout} data-slot="candle-readout">
          <div>
            <dt>날짜</dt>
            <dd>{readout ? readout.ts.slice(0, 10) : '—'}</dd>
          </div>
          <div>
            <dt>O</dt>
            <dd>{readout ? formatPrice(currency, readout.open) : '—'}</dd>
          </div>
          <div>
            <dt>H</dt>
            <dd>{readout ? formatPrice(currency, readout.high) : '—'}</dd>
          </div>
          <div>
            <dt>L</dt>
            <dd>{readout ? formatPrice(currency, readout.low) : '—'}</dd>
          </div>
          <div>
            <dt>C</dt>
            <dd>{readout ? formatPrice(currency, readout.close) : '—'}</dd>
          </div>
          <div>
            <dt>V</dt>
            <dd>{readout?.volume?.toLocaleString('ko-KR') ?? '없음'}</dd>
          </div>
        </dl>
        <div className={styles.candleCanvas}>
          <LightweightCandleRenderer
            bars={bars}
            mode={variantId}
            onCrosshairChange={setCrosshairReadout}
          />
        </div>
      </div>
    </ChartPreviewFrame>
  );
}
