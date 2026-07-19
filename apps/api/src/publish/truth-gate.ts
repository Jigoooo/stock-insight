// B0 — Product truth stop-line shared gate logic.
// Single owner for: (1) verification-status -> public block type mapping,
// (2) freshness-aware product availability resolution.
// Master plan: docs/plan/insight-platform-backend-db-v2/00-backend-db-master-plan.md §B0.

export type PublicBlockType = 'fact' | 'reported_claim';

/**
 * Only `verified` events/claims may publish as public `fact` blocks.
 * Every other verification state (including unknown/legacy values) degrades to
 * `reported_claim` — fail-closed by default.
 */
export function publicBlockTypeForVerification(verificationStatus: string): PublicBlockType {
  return verificationStatus === 'verified' ? 'fact' : 'reported_claim';
}

export type ProductAvailability = 'available' | 'stale' | 'missing';

/**
 * Per-dataset freshness thresholds (hours). Derived from pipeline cadence:
 * analytics/report pipelines run daily (24h) with a grace window; the feed is
 * rebuilt per feed_date; calibration refreshes with the analytics wrapper.
 */
export const PRODUCT_STALE_THRESHOLD_HOURS = {
  featureSnapshot: 36,
  impactSummary: 36,
  marketConfirmation: 36,
  personalizedFeed: 48,
  calibrationScorecard: 60,
  latestReports: 36,
} as const;

/**
 * Availability must degrade honestly:
 * - no rows -> 'missing'
 * - rows whose newest timestamp is older than the threshold -> 'stale'
 * - rows with a missing/unparsable timestamp -> 'stale' (fail-closed, never 'available')
 */
export function resolveProductAvailability(
  newestIso: string | null,
  rowCount: number,
  now: Date,
  thresholdHours: number,
): ProductAvailability {
  if (rowCount <= 0) return 'missing';
  if (newestIso === null) return 'stale';
  const newest = new Date(newestIso);
  if (Number.isNaN(newest.getTime())) return 'stale';
  const ageHours = (now.getTime() - newest.getTime()) / 3_600_000;
  return ageHours <= thresholdHours ? 'available' : 'stale';
}

/** Reduce helper: newest ISO timestamp across rows (null when none parse). */
export function newestTimestamp(values: ReadonlyArray<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}
