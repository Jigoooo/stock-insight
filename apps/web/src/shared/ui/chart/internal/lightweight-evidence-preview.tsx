'use client';

import { useEffect, useRef, useState } from 'react';

import type { PreviewChartBar } from './bklit-preview';

export type LightweightEvidence = {
  id: string;
  date: Date;
  tone: 'positive' | 'neutral' | 'risk';
  title: string;
  sourceCount: number;
};

export type LightweightReferenceBand = {
  id: string;
  start: Date;
  end: Date;
  low: number;
  high: number;
  label: string;
};

export type LightweightEvidenceBandRendererProps = {
  bands: readonly LightweightReferenceBand[];
  bars: readonly PreviewChartBar[];
  currency: 'KRW' | 'USD';
  evidence: readonly LightweightEvidence[];
  rangeSelection: { start: Date; end: Date } | null;
  selectedEvidenceId?: string;
  showBands: boolean;
  tone: 'band-ledger' | 'event-pulse' | 'evidence-split';
  onRangeSelectionChange: (selection: { start: Date; end: Date } | null) => void;
  onSelectEvidence: (id: string) => void;
};

type BitmapTarget = {
  useBitmapCoordinateSpace: (
    draw: (scope: {
      context: CanvasRenderingContext2D;
      horizontalPixelRatio: number;
      verticalPixelRatio: number;
    }) => void,
  ) => void;
};

type PrimitiveAttachment = {
  chart: { timeScale: () => { timeToCoordinate: (time: string) => number | null } };
  series: { priceToCoordinate: (price: number) => number | null };
  requestUpdate: () => void;
};

type DrawableBand = LightweightReferenceBand & {
  detailLabel: string;
  fill: string;
  stroke: string;
};

class EvidenceBandPrimitive {
  private attachment: PrimitiveAttachment | null = null;
  private bands: readonly DrawableBand[] = [];

  attached(attachment: PrimitiveAttachment) {
    this.attachment = attachment;
  }

  detached() {
    this.attachment = null;
  }

  setBands(bands: readonly DrawableBand[]) {
    this.bands = bands;
    this.attachment?.requestUpdate();
  }

  paneViews() {
    return [
      {
        zOrder: () => 'bottom' as const,
        renderer: () => ({
          draw: (target: BitmapTarget) => this.draw(target),
        }),
      },
    ];
  }

  private draw(target: BitmapTarget) {
    const attachment = this.attachment;
    if (!attachment) return;

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio: horizontalRatio, verticalPixelRatio: verticalRatio }) => {
        context.save();
        context.font = `${10 * verticalRatio}px ui-sans-serif, system-ui, sans-serif`;
        context.textBaseline = 'top';

        for (const band of this.bands) {
          const start = attachment.chart.timeScale().timeToCoordinate(toTime(band.start));
          const end = attachment.chart.timeScale().timeToCoordinate(toTime(band.end));
          const high = attachment.series.priceToCoordinate(band.high);
          const low = attachment.series.priceToCoordinate(band.low);
          if (start === null || end === null || high === null || low === null) continue;

          const x = Math.min(start, end) * horizontalRatio;
          const y = Math.min(high, low) * verticalRatio;
          const width = Math.max(1, Math.abs(end - start) * horizontalRatio);
          const height = Math.max(1, Math.abs(low - high) * verticalRatio);
          context.fillStyle = band.fill;
          context.fillRect(x, y, width, height);
          context.strokeStyle = band.stroke;
          context.lineWidth = Math.max(1, horizontalRatio);
          context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

          const labelWidth = context.measureText(band.detailLabel).width + 12 * horizontalRatio;
          context.fillStyle = band.stroke;
          context.fillRect(x, y, Math.min(width, labelWidth), 18 * verticalRatio);
          context.fillStyle = '#ffffff';
          context.fillText(band.detailLabel, x + 6 * horizontalRatio, y + 4 * verticalRatio);
        }
        context.restore();
      },
    );
  }
}

type RendererController = {
  setBands: (bands: readonly LightweightReferenceBand[], show: boolean) => void;
  setBars: (bars: readonly PreviewChartBar[]) => void;
  setMarkers: (
    evidence: readonly LightweightEvidence[],
    selectedId: string | undefined,
    bars: readonly PreviewChartBar[],
  ) => void;
  setRange: (selection: { start: Date; end: Date } | null) => void;
};

function cssColor(element: HTMLElement, property: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(property).trim() || fallback;
}

function toTime(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatBandPrice(currency: 'KRW' | 'USD', value: number) {
  return new Intl.NumberFormat('ko-KR', {
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function parseTime(value: unknown): Date | null {
  if (typeof value === 'string') return new Date(`${value}T00:00:00.000Z`);
  if (typeof value !== 'object' || value === null) return null;
  if (!('year' in value && 'month' in value && 'day' in value)) return null;
  const day = value as { year: number; month: number; day: number };
  return new Date(Date.UTC(day.year, day.month - 1, day.day));
}

export function LightweightEvidenceBandRenderer({
  bands,
  bars,
  currency,
  evidence,
  rangeSelection,
  selectedEvidenceId,
  showBands,
  tone,
  onRangeSelectionChange,
  onSelectEvidence,
}: LightweightEvidenceBandRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<RendererController | null>(null);
  const rangeCallbackRef = useRef(onRangeSelectionChange);
  const selectCallbackRef = useRef(onSelectEvidence);
  const [rendererEpoch, setRendererEpoch] = useState(0);

  useEffect(() => {
    rangeCallbackRef.current = onRangeSelectionChange;
    selectCallbackRef.current = onSelectEvidence;
  }, [onRangeSelectionChange, onSelectEvidence]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;

    async function mountChart(target: HTMLDivElement) {
      const { AreaSeries, ColorType, CrosshairMode, LineStyle, createChart, createSeriesMarkers } =
        await import('lightweight-charts');
      if (cancelled) return;

      const foreground = cssColor(target, '--color-text-secondary', '#667085');
      const grid = cssColor(target, '--color-border', '#d9dde5');
      const accent = cssColor(target, '--color-accent', '#315efb');
      const positive = cssColor(target, '--color-positive', '#15803d');
      const risk = cssColor(target, '--color-risk', '#b42318');
      const copper = cssColor(target, '--color-copper', '#9a6b3f');
      const chart = createChart(target, {
        autoSize: false,
        height: Math.max(220, target.clientHeight),
        width: Math.max(280, target.clientWidth),
        crosshair: { mode: CrosshairMode.Normal },
        grid: {
          horzLines: { color: grid, style: tone === 'evidence-split' ? 0 : 2 },
          vertLines: { color: grid, visible: tone !== 'band-ledger' },
        },
        layout: {
          attributionLogo: true,
          background: { color: 'transparent', type: ColorType.Solid },
          fontSize: tone === 'evidence-split' ? 11 : 12,
          textColor: foreground,
        },
        rightPriceScale: { borderColor: grid },
        timeScale: { borderColor: grid, rightOffset: 3 },
      });
      const series = chart.addSeries(AreaSeries, {
        bottomColor: 'rgba(49, 94, 251, 0)',
        lineColor: accent,
        lineWidth: tone === 'event-pulse' ? 2 : 3,
        topColor: tone === 'band-ledger' ? 'rgba(49, 94, 251, 0.06)' : 'rgba(49, 94, 251, 0.12)',
      });
      const markerPlugin = createSeriesMarkers(series, [], { autoScale: true });
      const bandPrimitive = new EvidenceBandPrimitive();
      series.attachPrimitive(bandPrimitive);
      let selectedPriceLine: ReturnType<typeof series.createPriceLine> | null = null;
      let crosshairFrame = 0;

      let suppressRangeEvent = false;
      const setRange = (selection: { start: Date; end: Date } | null) => {
        suppressRangeEvent = true;
        if (selection) {
          chart
            .timeScale()
            .setVisibleRange({ from: toTime(selection.start), to: toTime(selection.end) });
        } else {
          chart.timeScale().fitContent();
        }
        window.requestAnimationFrame(() => {
          suppressRangeEvent = false;
        });
      };
      const handleRangeChange = (range: { from: unknown; to: unknown } | null) => {
        if (suppressRangeEvent) return;
        const start = range ? parseTime(range.from) : null;
        const end = range ? parseTime(range.to) : null;
        rangeCallbackRef.current(start && end ? { start, end } : null);
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(handleRangeChange);

      const handleClick = (parameter: {
        hoveredInfo?: { objectKind: string; objectId?: unknown };
      }) => {
        if (parameter.hoveredInfo?.objectKind !== 'series-marker') return;
        if (typeof parameter.hoveredInfo.objectId === 'string') {
          selectCallbackRef.current(parameter.hoveredInfo.objectId);
        }
      };
      chart.subscribeClick(handleClick);

      const resizeObserver = new ResizeObserver(([entry]) => {
        if (!entry) return;
        chart.resize(
          Math.max(280, Math.round(entry.contentRect.width)),
          Math.max(220, Math.round(entry.contentRect.height)),
        );
      });
      resizeObserver.observe(target);

      controllerRef.current = {
        setBands: (nextBands, show) =>
          bandPrimitive.setBands(
            show
              ? nextBands.map((band, index) => ({
                  ...band,
                  detailLabel: `${band.label} · ${formatBandPrice(currency, band.low)}–${formatBandPrice(currency, band.high)}`,
                  fill: index === 0 ? 'rgba(154, 107, 63, 0.10)' : 'rgba(180, 35, 24, 0.07)',
                  stroke: index === 0 ? copper : risk,
                }))
              : [],
          ),
        setBars: (nextBars) =>
          series.setData(
            nextBars.map(({ ts, close }) => ({ time: ts.slice(0, 10), value: close })),
          ),
        setMarkers: (nextEvidence, selectedId, nextBars) => {
          markerPlugin.setMarkers(
            nextEvidence.flatMap((item) => {
              const bar = nextBars.find(({ date }) => date.getTime() === item.date.getTime());
              if (!bar) return [];
              const selected = item.id === selectedId;
              return [
                {
                  color: selected
                    ? accent
                    : item.tone === 'risk'
                      ? risk
                      : item.tone === 'positive'
                        ? positive
                        : copper,
                  id: item.id,
                  position: 'atPriceTop' as const,
                  price: bar.close,
                  shape:
                    item.tone === 'risk'
                      ? ('arrowDown' as const)
                      : item.tone === 'positive'
                        ? ('arrowUp' as const)
                        : ('circle' as const),
                  size: selected ? 1.8 : tone === 'event-pulse' ? 1.3 : 1,
                  text:
                    !selected && tone === 'event-pulse' ? `${item.sourceCount}개 근거` : undefined,
                  time: bar.ts.slice(0, 10),
                },
              ];
            }),
          );
          if (selectedPriceLine) {
            series.removePriceLine(selectedPriceLine);
            selectedPriceLine = null;
          }
          const selectedEvidence = nextEvidence.find(({ id }) => id === selectedId);
          const selectedBar = selectedEvidence
            ? nextBars.find(({ date }) => date.getTime() === selectedEvidence.date.getTime())
            : undefined;
          if (selectedEvidence && selectedBar) {
            selectedPriceLine = series.createPriceLine({
              axisLabelVisible: true,
              color: accent,
              lineStyle: LineStyle.Dotted,
              lineVisible: true,
              lineWidth: 1,
              price: selectedBar.close,
              title: selectedEvidence.title,
            });
            if (crosshairFrame) window.cancelAnimationFrame(crosshairFrame);
            crosshairFrame = window.requestAnimationFrame(() => {
              crosshairFrame = 0;
              chart.setCrosshairPosition(selectedBar.close, selectedBar.ts.slice(0, 10), series);
            });
          } else {
            chart.clearCrosshairPosition();
          }
        },
        setRange,
      };
      setRendererEpoch((epoch) => epoch + 1);

      dispose = () => {
        if (crosshairFrame) window.cancelAnimationFrame(crosshairFrame);
        resizeObserver.disconnect();
        chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRangeChange);
        chart.unsubscribeClick(handleClick);
        series.detachPrimitive(bandPrimitive);
        markerPlugin.detach();
        chart.remove();
      };
    }

    void mountChart(container);
    return () => {
      cancelled = true;
      controllerRef.current = null;
      dispose?.();
    };
  }, [currency, tone]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setBars(bars);
    controller.setBands(bands, showBands);
    controller.setRange(rangeSelection);
    controller.setMarkers(evidence, selectedEvidenceId, bars);
  }, [bands, bars, evidence, rangeSelection, rendererEpoch, selectedEvidenceId, showBands]);

  return (
    <div
      className="size-full"
      data-band-count={showBands ? bands.length : 0}
      data-marker-count={evidence.length}
      data-selected-evidence-id={selectedEvidenceId}
      data-selected-price={
        evidence
          .filter(({ id }) => id === selectedEvidenceId)
          .map(({ date }) => bars.find((bar) => bar.date.getTime() === date.getTime())?.close)
          .at(0) ?? undefined
      }
      data-slot="lightweight-evidence-root"
      data-tone={tone}
      ref={containerRef}
    />
  );
}
