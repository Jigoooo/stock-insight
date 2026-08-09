export const K4_SHADOW_COHORT_VERSION = 'k4.semiconductor-shadow.v1';

export type K4ShadowCohortSelector = {
  market: 'KR' | 'US';
  ticker: string;
};

export const K4_SHADOW_COHORT_V1 = [
  { market: 'US', ticker: 'MU' },
  { market: 'US', ticker: 'AMD' },
  { market: 'US', ticker: 'INTC' },
  { market: 'KR', ticker: '000660' },
  { market: 'KR', ticker: '005930' },
  { market: 'US', ticker: 'MRVL' },
  { market: 'US', ticker: 'NVDA' },
  { market: 'US', ticker: 'ARM' },
  { market: 'US', ticker: 'AVGO' },
  { market: 'US', ticker: 'TSM' },
] as const satisfies readonly K4ShadowCohortSelector[];
