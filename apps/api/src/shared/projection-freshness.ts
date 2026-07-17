export const PROJECTION_FRESHNESS_MAX_AGE_HOURS = 72;

const PROJECTION_FRESHNESS_MAX_AGE_MS = PROJECTION_FRESHNESS_MAX_AGE_HOURS * 60 * 60 * 1_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export function latestProjectionAt(
  values: readonly (string | Date | null | undefined)[],
): string | undefined {
  let latest = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const parsed = value instanceof Date ? value.getTime() : Date.parse(value ?? '');
    if (Number.isFinite(parsed) && parsed > latest) latest = parsed;
  }

  return Number.isFinite(latest) ? new Date(latest).toISOString() : undefined;
}

export function isProjectionFresh(latestAt: string | Date | null | undefined, now: Date): boolean {
  const parsed = latestAt instanceof Date ? latestAt.getTime() : Date.parse(latestAt ?? '');
  if (!Number.isFinite(parsed)) return false;

  const ageMs = now.getTime() - parsed;
  return ageMs >= -MAX_FUTURE_CLOCK_SKEW_MS && ageMs <= PROJECTION_FRESHNESS_MAX_AGE_MS;
}
