'use client';

import { useEffect, useRef, useState } from 'react';

import type { PreviewChartBar } from './bklit-preview';

export type CandleReadout = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  index: number;
};

export type LightweightCandleRendererProps = {
  bars: readonly PreviewChartBar[];
  mode: 'clean-candle' | 'dual-pane' | 'market-ledger';
  onCrosshairChange: (value: CandleReadout | null) => void;
};

type SeriesRef = {
  setBars: (bars: readonly PreviewChartBar[]) => void;
};

type ChartRef = {
  fitContent: () => void;
};

function cssColor(element: HTMLElement, property: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(property).trim() || fallback;
}

function timeKey(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;
  if (!('year' in value && 'month' in value && 'day' in value)) return null;
  const date = value as { year: number; month: number; day: number };
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function LightweightCandleRenderer({
  bars,
  mode,
  onCrosshairChange,
}: LightweightCandleRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartRef | null>(null);
  const candleSeriesRef = useRef<SeriesRef | null>(null);
  const volumeSeriesRef = useRef<SeriesRef | null>(null);
  const barsRef = useRef(bars);
  const callbackRef = useRef(onCrosshairChange);
  const [rendererEpoch, setRendererEpoch] = useState(0);

  useEffect(() => {
    barsRef.current = bars;
  }, [bars]);

  useEffect(() => {
    callbackRef.current = onCrosshairChange;
  }, [onCrosshairChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | undefined;
    let dispose: (() => void) | undefined;

    async function mountChart(container: HTMLDivElement) {
      const { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart } =
        await import('lightweight-charts');
      if (cancelled) return;

      const foreground = cssColor(container, '--color-text-secondary', '#667085');
      const grid = cssColor(container, '--color-border', '#d9dde5');
      const positive = cssColor(container, '--color-positive', '#15803d');
      const risk = cssColor(container, '--color-risk', '#b42318');
      const accent = cssColor(container, '--color-accent', '#315efb');

      const chart = createChart(container, {
        autoSize: false,
        height: Math.max(220, container.clientHeight),
        width: Math.max(280, container.clientWidth),
        crosshair: { mode: CrosshairMode.Normal },
        grid: {
          horzLines: { color: grid, style: mode === 'market-ledger' ? 0 : 2 },
          vertLines: { color: grid, visible: mode !== 'clean-candle' },
        },
        layout: {
          attributionLogo: true,
          background: { color: 'transparent', type: ColorType.Solid },
          fontSize: mode === 'market-ledger' ? 11 : 12,
          panes: {
            enableResize: false,
            separatorColor: grid,
            separatorHoverColor: grid,
          },
          textColor: foreground,
        },
        rightPriceScale: { borderColor: grid },
        timeScale: { borderColor: grid, rightOffset: 2 },
      });
      const candleSeries = chart.addSeries(
        CandlestickSeries,
        {
          borderDownColor: risk,
          borderUpColor: positive,
          downColor: risk,
          wickDownColor: risk,
          wickUpColor: positive,
          upColor: positive,
        },
        0,
      );
      const volumePaneIndex = mode === 'clean-candle' ? 0 : 1;
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          color: accent,
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        },
        volumePaneIndex,
      );
      if (mode === 'clean-candle') {
        volumeSeries.priceScale().applyOptions({
          scaleMargins: { bottom: 0, top: 0.78 },
        });
      } else {
        chart.panes()[0]?.setStretchFactor(72);
        chart.panes()[1]?.setStretchFactor(28);
      }

      chartRef.current = { fitContent: () => chart.timeScale().fitContent() };
      candleSeriesRef.current = {
        setBars: (nextBars) =>
          candleSeries.setData(
            nextBars.map(({ ts, open, high, low, close }) => ({
              time: ts.slice(0, 10),
              open,
              high,
              low,
              close,
            })),
          ),
      };
      volumeSeriesRef.current = {
        setBars: (nextBars) =>
          volumeSeries.setData(
            nextBars.flatMap(({ ts, volume, close, open }) =>
              volume === null
                ? []
                : [
                    {
                      color: close >= open ? 'rgba(21, 128, 61, 0.42)' : 'rgba(180, 35, 24, 0.42)',
                      time: ts.slice(0, 10),
                      value: volume,
                    },
                  ],
            ),
          ),
      };
      setRendererEpoch((epoch) => epoch + 1);

      let pendingReadout: CandleReadout | null = null;
      const handleCrosshairMove = (
        parameter: Parameters<typeof chart.subscribeCrosshairMove>[0] extends (
          input: infer Input,
        ) => void
          ? Input
          : never,
      ) => {
        const key = timeKey(parameter.time);
        const index = key ? barsRef.current.findIndex(({ ts }) => ts.startsWith(key)) : -1;
        const bar = index >= 0 ? barsRef.current[index] : undefined;
        pendingReadout = bar ? { ...bar, index } : null;
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          callbackRef.current(pendingReadout);
        });
      };
      chart.subscribeCrosshairMove(handleCrosshairMove);

      resizeObserver = new ResizeObserver(([entry]) => {
        if (!entry) return;
        const width = Math.max(280, Math.round(entry.contentRect.width));
        const height = Math.max(220, Math.round(entry.contentRect.height));
        chart.resize(width, height);
      });
      resizeObserver.observe(container);

      dispose = () => {
        if (frame) window.cancelAnimationFrame(frame);
        resizeObserver?.disconnect();
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
        chart.remove();
      };
    }

    void mountChart(container);
    return () => {
      cancelled = true;
      dispose?.();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!(candleSeries && volumeSeries && chart)) return;

    candleSeries.setBars(bars);
    volumeSeries.setBars(bars);
    chart.fitContent();
  }, [bars, rendererEpoch]);

  return (
    <div
      className="size-full"
      data-mode={mode}
      data-slot="lightweight-chart-root"
      ref={containerRef}
    />
  );
}
