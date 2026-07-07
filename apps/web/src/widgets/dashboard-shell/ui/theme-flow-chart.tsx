import styles from './dashboard-shell.module.css';

import type { ThemeNode } from '@/entities/theme';
import { EChart } from '@/shared/ui/echarts';
import { createThemeFlowOption } from '@/widgets/dashboard-shell/model/chart-options';

type ThemeFlowChartProps = {
  themes: ThemeNode[];
};

export function ThemeFlowChart({ themes }: Readonly<ThemeFlowChartProps>) {
  return (
    <EChart
      ariaLabel="AI에서 HBM, 전력 인프라, 냉각으로 이어지는 테마 흐름"
      className={styles.themeChart}
      minHeight={220}
      option={createThemeFlowOption(themes)}
      testId="theme-flow-chart"
    />
  );
}
