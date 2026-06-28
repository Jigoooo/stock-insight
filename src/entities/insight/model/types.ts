export type InsightImpact = '높음' | '중간' | '낮음';

export type Insight = {
  id: string;
  title: string;
  context: string;
  impact: InsightImpact;
  icon: 'bolt' | 'cpu' | 'newspaper' | 'triangle-alert';
};
