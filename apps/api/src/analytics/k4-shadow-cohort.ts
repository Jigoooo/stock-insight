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

/**
 * How many securities K4 evaluates, derived from the cohort rather than written down.
 *
 * The number 10 used to be a literal in five places — the runner's argument check,
 * the store's universe query, the persistence guard, the p4.v2 read model and the
 * wire contract. Each said "exactly ten" about the same cohort, so growing the cohort
 * by one row meant a 500 from the serving path (`Portfolio impact v2 requires exactly
 * 10 coverage rows`) rather than a larger answer. The v2 plan lists removing this as a
 * K7 requirement for that reason.
 *
 * What those checks were defending is worth keeping: an `available` response covers
 * the whole evaluated cohort, so nothing was silently dropped between evaluation and
 * serving. That property survives here, stated once against the definition instead of
 * five times against a constant.
 */
export const K4_SHADOW_COHORT_SIZE = K4_SHADOW_COHORT_V1.length;
