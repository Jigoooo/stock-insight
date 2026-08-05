'use client';

import { useMemo } from 'react';

import { Area } from '@/shared/ui/chart/vendor/bklit/area';
import { AreaChart } from '@/shared/ui/chart/vendor/bklit/area-chart';
import { ChartBrush, type ChartBrushSelection } from '@/shared/ui/chart/vendor/bklit/chart-brush';
import {
  ChartBrushLayout,
  type ChartBrushLayoutState,
} from '@/shared/ui/chart/vendor/bklit/chart-brush-layout';
import { Grid } from '@/shared/ui/chart/vendor/bklit/grid';
import { ChartTooltip } from '@/shared/ui/chart/vendor/bklit/tooltip/chart-tooltip';
import { XAxis } from '@/shared/ui/chart/vendor/bklit/x-axis';
import { YAxis } from '@/shared/ui/chart/vendor/bklit/y-axis';

export type BklitVariantTone = 'quiet-trace' | 'layered-range' | 'signal-ledger';

export type PreviewChartBar = {
  date: Date;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type SharedRendererProps = {
  bars: readonly PreviewChartBar[];
  currency: 'KRW' | 'USD';
  rangeSelection: ChartBrushSelection | null;
  reducedMotion: boolean;
  onRangeSelectionChange: (selection: ChartBrushSelection | null) => void;
};

export type BklitMarketTapeRendererProps = SharedRendererProps & {
  status: 'ready' | 'loading';
  tone: 'quiet-trace' | 'layered-range' | 'signal-ledger';
};

function toChartData(bars: readonly PreviewChartBar[]) {
  return bars.map((bar) => ({ ...bar }));
}

function formatPrice(currency: 'KRW' | 'USD', value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function ChartTooltipContent({
  currency,
  point,
}: {
  currency: 'KRW' | 'USD';
  point: Record<string, unknown>;
}) {
  const date = point.date instanceof Date ? point.date : new Date(String(point.date));
  const close = typeof point.close === 'number' ? point.close : 0;
  return (
    <div data-slot="chart-tooltip-content">
      <strong>{date.toLocaleDateString('ko-KR')}</strong>
      <span>{formatPrice(currency, close)}</span>
    </div>
  );
}

function BrushStrip({
  bars,
  layout,
  rangeSelection,
  reducedMotion,
  tone,
  onRangeSelectionChange,
}: {
  bars: readonly PreviewChartBar[];
  layout: ChartBrushLayoutState;
  rangeSelection: ChartBrushSelection | null;
  reducedMotion: boolean;
  tone: BklitVariantTone;
  onRangeSelectionChange: (selection: ChartBrushSelection | null) => void;
}) {
  const data = useMemo(() => toChartData(bars), [bars]);
  const handleSelection = (selection: ChartBrushSelection | null) => {
    layout.onBrushSelectionChange(selection);
    onRangeSelectionChange(selection);
  };

  return (
    <div data-slot="chart-brush" data-tone={tone}>
      <AreaChart
        animationDuration={reducedMotion ? 0 : 220}
        aspectRatio="8 / 1"
        data={data}
        margin={{ top: 3, right: 8, bottom: 3, left: 8 }}
        status="ready"
        yDomainTween={false}
      >
        <Area
          animate={!reducedMotion}
          dataKey="close"
          fill="var(--chart-line-primary)"
          fillOpacity={0.14}
          showHighlight={false}
          stroke="var(--chart-line-primary)"
          strokeWidth={1}
        />
        <ChartBrush
          blurPx={tone === 'layered-range' ? 1.5 : 0}
          fadeOuterEdges={tone !== 'signal-ledger'}
          initialSelection={rangeSelection}
          selection={rangeSelection}
          selectionPattern={
            tone === 'signal-ledger'
              ? { color: 'var(--chart-brush-border)', preset: 'diagonal' }
              : undefined
          }
          onSelectionChange={handleSelection}
        />
      </AreaChart>
    </div>
  );
}

export function BklitMarketTapeRenderer({
  bars,
  currency,
  rangeSelection,
  reducedMotion,
  status,
  tone,
  onRangeSelectionChange,
}: BklitMarketTapeRendererProps) {
  const data = useMemo(() => toChartData(bars), [bars]);
  const strokeWidth = tone === 'quiet-trace' ? 1.5 : tone === 'signal-ledger' ? 2 : 2.25;
  const fillOpacity = tone === 'quiet-trace' ? 0.05 : tone === 'signal-ledger' ? 0.08 : 0.22;

  return (
    <ChartBrushLayout
      data={data}
      enabled
      fitMainContent
      height={52}
      brushStrip={(layout) => (
        <BrushStrip
          bars={bars}
          layout={layout}
          rangeSelection={rangeSelection}
          reducedMotion={reducedMotion}
          tone={tone}
          onRangeSelectionChange={onRangeSelectionChange}
        />
      )}
    >
      {() => (
        <div data-slot="chart-plot" data-tone={tone}>
          <AreaChart
            animationDuration={reducedMotion ? 0 : tone === 'quiet-trace' ? 720 : 460}
            aspectRatio="16 / 6"
            data={data}
            margin={{ top: 20, right: 56, bottom: 36, left: 12 }}
            revealSignature={`market-tape-${tone}`}
            status={status}
            tweenYDomainOnXDomainChange={tone === 'layered-range' && !reducedMotion}
            xDomain={rangeSelection ? [rangeSelection.start, rangeSelection.end] : undefined}
            xDomainSlotCount={data.length}
            yDomainTween={!reducedMotion}
          >
            <Grid
              numTicksRows={tone === 'quiet-trace' ? 2 : 5}
              strokeDasharray={tone === 'signal-ledger' ? '0' : '4,4'}
              strokeOpacity={tone === 'quiet-trace' ? 0.42 : 0.72}
              vertical={tone === 'signal-ledger'}
            />
            <Area
              animate={!reducedMotion && tone !== 'signal-ledger'}
              dataKey="close"
              fill="var(--chart-line-primary)"
              fillOpacity={fillOpacity}
              gradientToOpacity={0}
              showMarkers={false}
              stroke="var(--chart-line-primary)"
              strokeWidth={strokeWidth}
            />
            <XAxis numTicks={tone === 'signal-ledger' ? 6 : 5} />
            <YAxis
              formatValue={(value) => formatPrice(currency, value)}
              orientation="right"
              numTicks={tone === 'quiet-trace' ? 3 : 5}
            />
            <ChartTooltip
              content={({ point }) => <ChartTooltipContent currency={currency} point={point} />}
              damping={reducedMotion ? 0 : tone === 'signal-ledger' ? 0 : 20}
              dotVariant="ring"
              showDots
            />
          </AreaChart>
        </div>
      )}
    </ChartBrushLayout>
  );
}
