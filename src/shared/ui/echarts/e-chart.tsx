import { BarChart, GraphChart } from 'echarts/charts';
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef } from 'react';

import styles from './e-chart.module.css';

import { prefersReducedMotion } from '@/shared/motion/preferences';

echarts.use([
  AriaComponent,
  BarChart,
  CanvasRenderer,
  GraphChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
]);

type EChartProps = {
  option: EChartsCoreOption;
  ariaLabel: string;
  className?: string;
  minHeight?: number;
  testId?: string;
};

export function EChart({
  ariaLabel,
  className,
  minHeight = 180,
  option,
  testId,
}: Readonly<EChartProps>) {
  const chartRef = useRef<EChartsType | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mergedOption = useMemo<EChartsCoreOption>(
    () => ({
      animation: !prefersReducedMotion(),
      aria: {
        enabled: true,
        label: {
          description: ariaLabel,
        },
      },
      ...option,
    }),
    [ariaLabel, option],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = echarts.init(host, null, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.setOption(mergedOption, true);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [mergedOption]);

  return (
    <figure
      className={className ? `${styles.chart} ${className}` : styles.chart}
      data-testid={testId}
      style={{ minHeight }}
    >
      <figcaption className={styles.caption}>{ariaLabel}</figcaption>
      <div ref={hostRef} className={styles.canvas} aria-hidden="true" style={{ minHeight }} />
    </figure>
  );
}
