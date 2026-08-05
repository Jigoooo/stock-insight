'use client';

import { useMemo, type ReactNode } from 'react';

import { Area } from '@/shared/ui/chart/vendor/bklit/area';
import { AreaChart } from '@/shared/ui/chart/vendor/bklit/area-chart';
import { ChartBrush, type ChartBrushSelection } from '@/shared/ui/chart/vendor/bklit/chart-brush';
import {
  ChartBrushLayout,
  type ChartBrushLayoutState,
} from '@/shared/ui/chart/vendor/bklit/chart-brush-layout';
import { ComposedChart } from '@/shared/ui/chart/vendor/bklit/composed-chart';
import { Grid } from '@/shared/ui/chart/vendor/bklit/grid';
import { Line } from '@/shared/ui/chart/vendor/bklit/line';
import { ChartMarkers, type ChartMarker } from '@/shared/ui/chart/vendor/bklit/markers';
import { ReferenceArea } from '@/shared/ui/chart/vendor/bklit/reference-area';
import { ChartTooltip } from '@/shared/ui/chart/vendor/bklit/tooltip/chart-tooltip';
import { XAxis } from '@/shared/ui/chart/vendor/bklit/x-axis';
import { YAxis } from '@/shared/ui/chart/vendor/bklit/y-axis';

export type BklitVariantTone =
  | 'quiet-trace'
  | 'layered-range'
  | 'signal-ledger'
  | 'band-ledger'
  | 'event-pulse'
  | 'evidence-split';

export type PreviewChartBar = {
  date: Date;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type PreviewEvidence = {
  id: string;
  date: Date;
  tone: 'positive' | 'neutral' | 'risk';
  title: string;
  sourceCount: number;
};

export type PreviewReferenceBand = {
  id: string;
  start: Date;
  end: Date;
  low: number;
  high: number;
  label: string;
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

export type BklitEvidenceBandRendererProps = SharedRendererProps & {
  bands: readonly PreviewReferenceBand[];
  evidence: readonly PreviewEvidence[];
  selectedEvidenceId?: string;
  showBands: boolean;
  tone: 'band-ledger' | 'event-pulse' | 'evidence-split';
  onSelectEvidence: (id: string) => void;
};

function toChartData(bars: readonly PreviewChartBar[]) {
  return bars.map((bar) => ({ ...bar }));
}

function filterBars(bars: readonly PreviewChartBar[], selection: ChartBrushSelection | null) {
  if (!selection) return bars;
  const start = Math.min(selection.start.getTime(), selection.end.getTime());
  const end = Math.max(selection.start.getTime(), selection.end.getTime());
  return bars.filter(({ date }) => date.getTime() >= start && date.getTime() <= end);
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

function markerIcon(tone: PreviewEvidence['tone']): ReactNode {
  if (tone === 'positive') return '↗';
  if (tone === 'risk') return '!';
  return '•';
}

function evidenceToneColor(tone: PreviewEvidence['tone']) {
  if (tone === 'risk') return 'var(--color-risk)';
  if (tone === 'positive') return 'var(--color-positive)';
  return 'var(--color-copper)';
}

export function BklitEvidenceBandRenderer({
  bands,
  bars,
  currency,
  evidence,
  rangeSelection,
  reducedMotion,
  selectedEvidenceId,
  showBands,
  tone,
  onRangeSelectionChange,
  onSelectEvidence,
}: BklitEvidenceBandRendererProps) {
  const visibleBars = useMemo(() => filterBars(bars, rangeSelection), [bars, rangeSelection]);
  const data = useMemo(() => toChartData(visibleBars), [visibleBars]);
  const markerGroups = useMemo<{ context: ChartMarker[]; selected: ChartMarker[] }>(() => {
    const visibleEvidence = evidence.filter(({ date }) =>
      visibleBars.some((bar) => bar.date.getTime() === date.getTime()),
    );
    const toMarker = (item: PreviewEvidence, selected: boolean): ChartMarker => ({
      color: selected
        ? 'var(--color-accent)'
        : tone === 'band-ledger'
          ? 'var(--color-text-tertiary)'
          : evidenceToneColor(item.tone),
      date: item.date,
      description: `${item.sourceCount}개 근거`,
      icon: markerIcon(item.tone),
      title: item.title,
      onClick: () => onSelectEvidence(item.id),
    });
    return {
      context: visibleEvidence
        .filter((item) => item.id !== selectedEvidenceId)
        .map((item) => toMarker(item, false)),
      selected: visibleEvidence
        .filter((item) => item.id === selectedEvidenceId)
        .map((item) => toMarker(item, true)),
    };
  }, [evidence, onSelectEvidence, selectedEvidenceId, tone, visibleBars]);
  const fullData = useMemo(() => toChartData(bars), [bars]);

  return (
    <ChartBrushLayout
      data={fullData}
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
          <ComposedChart
            animationDuration={reducedMotion ? 0 : 520}
            aspectRatio="16 / 6"
            data={data}
            margin={{ top: 34, right: 56, bottom: 36, left: 12 }}
            revealSignature={`evidence-band-${tone}`}
          >
            <Grid
              numTicksRows={5}
              strokeOpacity={tone === 'event-pulse' ? 0.34 : tone === 'band-ledger' ? 0.46 : 0.58}
              strokeDasharray={tone === 'evidence-split' ? '0' : '4,4'}
              vertical={tone === 'evidence-split'}
            />
            {showBands
              ? bands.map((band, index) => (
                  <ReferenceArea
                    axisLabelColor={index === 0 ? 'var(--color-copper)' : 'var(--color-risk)'}
                    fadeEdges={tone !== 'evidence-split'}
                    fadeEdgesLength={tone === 'band-ledger' ? 4 : 8}
                    fill={index === 0 ? 'var(--color-copper)' : 'var(--color-risk)'}
                    fillOpacity={
                      tone === 'band-ledger' ? 0.1 : tone === 'event-pulse' ? 0.045 : 0.065
                    }
                    key={band.id}
                    markerColor={index === 0 ? 'var(--color-copper)' : 'var(--color-risk)'}
                    pattern="none"
                    showMarkers={tone === 'band-ledger'}
                    stroke={index === 0 ? 'var(--color-copper)' : 'var(--color-risk)'}
                    strokeStyle="solid"
                    strokeWidth={tone === 'band-ledger' ? 1.25 : 0.75}
                    x1={band.start}
                    x2={band.end}
                    y1={band.low}
                    y2={band.high}
                  />
                ))
              : null}
            <Area
              animate={!reducedMotion}
              dataKey="close"
              fill="var(--chart-line-primary)"
              fillOpacity={tone === 'band-ledger' ? 0.035 : tone === 'event-pulse' ? 0.02 : 0.04}
              stroke="var(--chart-line-primary)"
              strokeWidth={tone === 'event-pulse' ? 2.15 : 2.35}
            />
            <Line
              animate={!reducedMotion}
              dataKey="close"
              showMarkers={false}
              stroke="var(--chart-line-primary)"
              strokeWidth={tone === 'event-pulse' ? 2.15 : 2.35}
            />
            <ChartMarkers
              animate={!reducedMotion && tone === 'event-pulse'}
              items={markerGroups.context}
              showLines={tone === 'event-pulse'}
              size={tone === 'band-ledger' ? 16 : tone === 'event-pulse' ? 22 : 18}
            />
            <ChartMarkers
              animate={false}
              items={markerGroups.selected}
              showLines={tone !== 'band-ledger'}
              size={tone === 'band-ledger' ? 20 : tone === 'event-pulse' ? 26 : 23}
            />
            <XAxis numTicks={5} />
            <YAxis formatValue={(value) => formatPrice(currency, value)} orientation="right" />
            <ChartTooltip
              content={({ point }) => <ChartTooltipContent currency={currency} point={point} />}
              damping={reducedMotion ? 0 : 18}
              indicatorDasharray={tone === 'band-ledger' ? '4,4' : undefined}
            />
          </ComposedChart>
        </div>
      )}
    </ChartBrushLayout>
  );
}
