import {
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import styles from './dashboard-shell.module.css';

import type { PortfolioSnapshot } from '@/entities/portfolio';
import { chartPalette, themeShareColors } from '@/shared/theme/tokens';
import { ChartFrame, ChartLegend, ChartTooltipContent, type ChartConfig } from '@/shared/ui/chart';
import type { ResponseMeta } from '@stock-insight/contracts';

type PortfolioThemeShareChartProps = {
  portfolio: PortfolioSnapshot;
  portfolioSource: ResponseMeta['source'];
};

const tooltipConfig = {
  value: {
    label: '비중',
    color: themeShareColors.semiconductor,
  },
} satisfies ChartConfig;

export function PortfolioThemeShareChart({
  portfolio,
  portfolioSource,
}: Readonly<PortfolioThemeShareChartProps>) {
  const legendConfig = Object.fromEntries(
    portfolio.themeShare.map((item) => [
      item.id,
      {
        label: `${item.label} ${item.value}%`,
        color: themeShareColors[item.colorRole],
      },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartFrame
      title="테마 비중"
      description={
        portfolioSource === 'database'
          ? '보유·관심 종목을 시장 구분 기준으로 묶은 전용 포트폴리오 API 요약입니다.'
          : '보유종목을 테마 관점으로 묶은 목업 요약입니다.'
      }
      testId="portfolio-theme-share-chart"
    >
      <div className={styles.themeShareChart}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={portfolio.themeShare}
            layout="vertical"
            margin={{ top: 2, right: 10, bottom: 2, left: 8 }}
          >
            <XAxis type="number" hide domain={[0, 50]} />
            <YAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              tick={{ fill: chartPalette.axis, fontSize: 11 }}
              type="category"
              width={82}
            />
            <Tooltip
              cursor={{ fill: chartPalette.surface }}
              content={<ChartTooltipContent config={tooltipConfig} />}
            />
            <Bar dataKey="value" isAnimationActive={false} radius={[0, 3, 3, 0]}>
              {portfolio.themeShare.map((item) => (
                <Cell fill={themeShareColors[item.colorRole]} key={item.id} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend config={legendConfig} />
    </ChartFrame>
  );
}
