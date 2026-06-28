import type { ThemeShareColorRole } from '@/shared/theme/tokens';

export type PortfolioSnapshot = {
  value: string;
  dailyChange: string;
  relatedIssueCount: number;
  focusTheme: string;
  scheduleCount: number;
  cautionLevel: '낮음' | '중간' | '높음';
  bars: number[];
  trend: {
    label: string;
    value: number;
  }[];
  themeShare: {
    id: string;
    label: string;
    value: number;
    colorRole: ThemeShareColorRole;
  }[];
};
