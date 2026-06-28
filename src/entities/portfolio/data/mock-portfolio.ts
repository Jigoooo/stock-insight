import type { PortfolioSnapshot } from '@/entities/portfolio/model/types';

export const portfolioSnapshot: PortfolioSnapshot = {
  value: '₩42.8M',
  dailyChange: '+1.8% · 오늘 발행 기준',
  relatedIssueCount: 7,
  focusTheme: '반도체 46%',
  scheduleCount: 4,
  cautionLevel: '중간',
  bars: [34, 52, 43, 68, 61, 79, 72, 88],
  trend: [
    { label: '월', value: 34 },
    { label: '화', value: 52 },
    { label: '수', value: 43 },
    { label: '목', value: 68 },
    { label: '금', value: 61 },
    { label: '월', value: 79 },
    { label: '화', value: 72 },
    { label: '오늘', value: 88 },
  ],
  themeShare: [
    { id: 'ai-semiconductor', label: 'AI/반도체', value: 46, colorRole: 'semiconductor' },
    { id: 'power-infra', label: '전력 인프라', value: 22, colorRole: 'infrastructure' },
    { id: 'platform', label: '플랫폼', value: 18, colorRole: 'platform' },
    { id: 'cash', label: '현금/기타', value: 14, colorRole: 'reserve' },
  ],
};
