// P0-3 — snapshot-scoped pairwise price correlation planner.
// Turns aligned daily price observations into relation_measurement inputs.
// PIT: the observation window may never extend beyond asOf; pairs without
// enough overlapping observations are skipped (never fabricated).

import type { RelationMeasurementInput } from './relation-measurement.ts';

export type PriceObservation = {
  /** ISO calendar date (YYYY-MM-DD). */
  date: string;
  value: number;
};

export type CorrelationPair = {
  subjectEntityId: number;
  objectEntityId: number;
};

export type CorrelationOptions = {
  asOf: string;
  windowDays: number;
  minOverlappingReturns: number;
  modelVersion: string;
};

function toReturns(series: readonly PriceObservation[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const observation of series) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.date)) {
      throw new Error(`invalid observation date: ${observation.date}`);
    }
    if (!Number.isFinite(observation.value) || observation.value <= 0) continue;
    byDate.set(observation.date, observation.value);
  }
  const dates = [...byDate.keys()].sort();
  const returns = new Map<string, number>();
  for (let index = 1; index < dates.length; index += 1) {
    const previous = byDate.get(dates[index - 1]!)!;
    const current = byDate.get(dates[index]!)!;
    returns.set(dates[index]!, current / previous - 1);
  }
  return returns;
}

function pearson(left: readonly number[], right: readonly number[]): number | null {
  const count = left.length;
  if (count < 2) return null;
  const meanLeft = left.reduce((total, value) => total + value, 0) / count;
  const meanRight = right.reduce((total, value) => total + value, 0) / count;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < count; index += 1) {
    const deltaLeft = left[index]! - meanLeft;
    const deltaRight = right[index]! - meanRight;
    covariance += deltaLeft * deltaRight;
    varianceLeft += deltaLeft * deltaLeft;
    varianceRight += deltaRight * deltaRight;
  }
  if (varianceLeft === 0 || varianceRight === 0) return null;
  return covariance / Math.sqrt(varianceLeft * varianceRight);
}

export function planPriceCorrelations(
  priceSeries: ReadonlyMap<number, readonly PriceObservation[]>,
  pairs: readonly CorrelationPair[],
  options: CorrelationOptions,
): RelationMeasurementInput[] {
  const asOfMs = new Date(options.asOf).getTime();
  if (Number.isNaN(asOfMs)) throw new Error('asOf must be a valid timestamp');
  if (!Number.isSafeInteger(options.windowDays) || options.windowDays < 2) {
    throw new Error('windowDays must be an integer >= 2');
  }
  if (!Number.isSafeInteger(options.minOverlappingReturns) || options.minOverlappingReturns < 3) {
    throw new Error('minOverlappingReturns must be an integer >= 3');
  }
  if (!options.modelVersion.trim()) throw new Error('modelVersion is required');

  const windowStartMs = asOfMs - options.windowDays * 86_400_000;
  const returnsByEntity = new Map<number, Map<string, number>>();
  for (const [entityId, series] of priceSeries) {
    const bounded = series.filter((observation) => {
      const dateMs = new Date(`${observation.date}T00:00:00.000Z`).getTime();
      return dateMs >= windowStartMs && dateMs <= asOfMs;
    });
    returnsByEntity.set(entityId, toReturns(bounded));
  }

  const results: RelationMeasurementInput[] = [];
  const seenPairs = new Set<string>();
  for (const pair of pairs) {
    if (pair.subjectEntityId === pair.objectEntityId) continue;
    const pairKey =
      pair.subjectEntityId < pair.objectEntityId
        ? `${pair.subjectEntityId}|${pair.objectEntityId}`
        : `${pair.objectEntityId}|${pair.subjectEntityId}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const leftReturns = returnsByEntity.get(pair.subjectEntityId);
    const rightReturns = returnsByEntity.get(pair.objectEntityId);
    if (!leftReturns || !rightReturns) continue;
    const overlappingDates = [...leftReturns.keys()]
      .filter((date) => rightReturns.has(date))
      .sort();
    if (overlappingDates.length < options.minOverlappingReturns) continue;
    const leftValues = overlappingDates.map((date) => leftReturns.get(date)!);
    const rightValues = overlappingDates.map((date) => rightReturns.get(date)!);
    const correlation = pearson(leftValues, rightValues);
    if (correlation === null || !Number.isFinite(correlation)) continue;
    const finalObservedDate = overlappingDates.at(-1)!;
    const finalObservedDayEndMs = new Date(`${finalObservedDate}T23:59:59.999Z`).getTime();
    results.push({
      subjectEntityId: Math.min(pair.subjectEntityId, pair.objectEntityId),
      objectEntityId: Math.max(pair.subjectEntityId, pair.objectEntityId),
      measurementKind: 'correlation',
      windowStart: `${overlappingDates[0]!}T00:00:00.000Z`,
      // Correlation of returns THROUGH the final overlapping date: use EOD for
      // completed days, but clamp the current day to the immutable PIT cutoff.
      windowEnd: new Date(Math.min(finalObservedDayEndMs, asOfMs)).toISOString(),
      value: Math.max(-1, Math.min(1, correlation)),
      modelConfig: {
        method: 'pearson_daily_returns',
        modelVersion: options.modelVersion,
        observations: overlappingDates.length,
        windowDays: options.windowDays,
      },
      inputWatermark: {
        firstObservedDate: overlappingDates[0]!,
        lastObservedDate: finalObservedDate,
      },
    });
  }
  // Deterministic output order.
  results.sort(
    (a, b) => a.subjectEntityId - b.subjectEntityId || a.objectEntityId - b.objectEntityId,
  );
  return results;
}
