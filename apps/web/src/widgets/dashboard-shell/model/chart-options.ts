import type { ThemeNode } from '@/entities/theme';
import { chartPalette } from '@/shared/theme/tokens';
import type { EChartsCoreOption } from '@/shared/ui/echarts';

export function createThemeFlowOption(themes: ThemeNode[]): EChartsCoreOption {
  const links = themes.slice(0, -1).map((theme, index) => {
    const nextTheme = themes[index + 1];
    return {
      source: theme.title,
      target: nextTheme?.title ?? theme.title,
      value: theme.strength,
    };
  });
  const denominator = Math.max(themes.length - 1, 1);

  return {
    color: [...chartPalette.themeFlow],
    tooltip: {
      trigger: 'item',
      backgroundColor: chartPalette.primaryDeep,
      borderColor: chartPalette.primaryDeep,
      textStyle: { color: chartPalette.surface, fontSize: 11 },
    },
    xAxis: {
      show: false,
      min: 0,
      max: 100,
      type: 'value',
    },
    yAxis: {
      show: false,
      min: 0,
      max: 100,
      type: 'value',
    },
    grid: { top: 16, right: 18, bottom: 18, left: 18 },
    series: [
      {
        type: 'graph',
        layout: 'none',
        coordinateSystem: 'cartesian2d',
        roam: false,
        symbol: 'roundRect',
        symbolSize: [86, 34],
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 9],
        label: {
          show: true,
          color: chartPalette.primaryDeep,
          fontSize: 12,
          fontWeight: 650,
        },
        lineStyle: {
          color: chartPalette.line,
          curveness: 0.18,
          width: 2,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3, color: chartPalette.caution },
        },
        data: themes.map((theme, index) => {
          const isFirst = index === 0;
          const isLast = index === themes.length - 1;
          const color = chartPalette.themeFlow[index % chartPalette.themeFlow.length];

          return {
            name: theme.title,
            value: [8 + (84 * index) / denominator, index % 2 === 0 ? 58 : 42],
            itemStyle: {
              color: isFirst ? chartPalette.primary : isLast ? chartPalette.surface : color,
              borderColor: isLast ? chartPalette.caution : color,
              borderWidth: 1,
            },
            label: {
              color: isFirst ? chartPalette.surface : chartPalette.primaryDeep,
            },
          };
        }),
        links,
      },
    ],
  };
}
