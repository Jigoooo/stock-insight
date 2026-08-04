import { createHash } from 'node:crypto';

// Macro co-movement model — the calculation half, kept apart from candidate
// generation exactly as product-similarity-model.ts is kept apart from
// builders/product-similarity.ts.
//
// What this measures: whether a macro series and a stock moved together across a
// stated window. It is Pearson correlation of two change series aligned on the
// same calendar date. It is NOT a claim that the series moves the stock, and the
// predicate name (MACRO_COMOVEMENT) is chosen so a reader cannot take it for one.
//
// Every number that decides the output is in MACRO_COMOVEMENT_MODEL_CONFIG and
// travels with each relation as model_config evidence. A score whose generating
// configuration is not bound cannot be re-run, and a result that cannot be re-run
// cannot be argued with — at which point it is an assertion, not a measurement.

export type MacroSeriesObservation = {
  /** ISO calendar date (YYYY-MM-DD) of the observation. */
  date: string;
  value: number;
};

export type MacroSeriesWindow = {
  seriesKey: string;
  seriesEntityId: number;
  observations: readonly MacroSeriesObservation[];
};

export type StockPriceObservation = {
  /** ISO calendar date (YYYY-MM-DD) of the bar. */
  date: string;
  close: number;
};

export type StockPriceWindow = {
  stockEntityId: number;
  observations: readonly StockPriceObservation[];
};

export type MacroComovementPair = {
  seriesKey: string;
  seriesEntityId: number;
  stockEntityId: number;
  /** Pearson correlation of the two change series, within [-1,1]. */
  correlation: number;
  overlappingObservations: number;
  /** First and last date contributing a change to both sides. */
  firstObservedDate: string;
  lastObservedDate: string;
};

export type MacroComovementPlan = {
  pairs: MacroComovementPair[];
  modelConfig: Record<string, unknown>;
  /** Per-series counts, for a run summary that shows where candidates died. */
  diagnostics: {
    seriesConsidered: number;
    stocksConsidered: number;
    pairsWithEnoughOverlap: number;
    pairsOverThreshold: number;
    pairsDroppedByDegreeCap: number;
  };
};

/**
 * How each series' level is turned into a change.
 *
 * This is a judgement about what the numbers ARE, not a tuning knob. DGS10/DGS2
 * are yields quoted in percent: a percent change of a yield is meaningless (0.10
 * to 0.20 would read as +100%), so the change is the level difference in
 * percentage points, which is how a rate move is normally stated. DEXKOUS is a
 * price level (KRW per USD), where a log return is the standard change and is
 * directly comparable to the stock side.
 */
export const MACRO_SERIES_TRANSFORMS: Readonly<Record<string, 'level_difference' | 'log_return'>> =
  Object.freeze({
    'fred:DGS10': 'level_difference',
    'fred:DGS2': 'level_difference',
    'fred:DEXKOUS': 'log_return',
  });

/**
 * The ten series measured 2026-08-04 and left out of this first cut, with the
 * number that excluded each. Kept in code rather than only in a document so the
 * reason is next to the decision.
 *
 * The measurement: how many of a series' observation dates since 2021-08 fall on
 * a day that also has a US 1D stock bar. planPriceCorrelations-style alignment
 * intersects on exact dates, so a series that never lands on a trading day
 * contributes nothing, and one that lands monthly contributes a monthly change
 * compared against a single day's stock return — a frequency mismatch that would
 * produce a number without producing a meaning.
 */
export const MACRO_SERIES_EXCLUSIONS: Readonly<Record<string, string>> = Object.freeze({
  'fred:ICSA':
    'weekly, week-ending Saturday: 0 of 260 observation dates fall on a trading day (measured 2026-08-04)',
  'fred:WALCL':
    'weekly (Wednesday): 258 of 261 dates are trading days, but a week-over-week change against a one-day stock return is a frequency mismatch; needs a weekly-resampled stock series',
  'fred:CPIAUCSL':
    'monthly: 38 of 59 dates usable, a monthly change against a one-day stock return',
  'fred:PCEPI': 'monthly: 38 of 59 dates usable, same frequency mismatch',
  'fred:FEDFUNDS': 'monthly: 39 of 60 dates usable, same frequency mismatch',
  'fred:UNRATE': 'monthly: 38 of 59 dates usable, same frequency mismatch',
  'fred:PAYEMS': 'monthly: 38 of 59 dates usable, same frequency mismatch',
  'fred:INDPRO': 'monthly: 38 of 59 dates usable, same frequency mismatch',
  'fred:RSAFS': 'monthly: 38 of 59 dates usable, same frequency mismatch',
  'fred:UMCSENT': 'monthly: 38 of 59 dates usable, same frequency mismatch',
});

export const MACRO_COMOVEMENT_MODEL_CONFIG = Object.freeze({
  model: 'pearson-macro-comovement-v1',
  // 365 days, not the 45 that run-v2-analytics-publish uses for its measurement
  // pass. 45 days of daily data is ~30 overlapping points, which is a number with
  // a wide enough confidence interval to be noise. 365 gives ~247 for US stocks
  // and ~233 for KR (measured 2026-08-04) while staying inside one rate regime.
  windowDays: 365,
  // Below this the pair is skipped, never estimated from what little there is.
  minOverlappingObservations: 60,
  // |r| >= 0.25. Measured across the three included series over a 365-day window
  // ending 2026-08-03: 0.20 admits 48 pairs, 0.25 admits 18, 0.30 admits 11.
  // 0.25 was chosen by reading the 18 rather than by picking a round number —
  // every one is economically coherent (TLT/DGS10 -0.902, GLD/DGS2 -0.269,
  // Home Depot and Prologis rate-negative, energy rate-positive). Raising or
  // lowering this is a one-constant change with a known effect on the count.
  absCorrelationThreshold: 0.25,
  // Per-series cap, applied before the policy's own superhubDegreeCap of 40.
  // 13 series over 330 stocks would otherwise make one series a 330-degree hub
  // that puts every stock two hops from every other. Never binds at the current
  // threshold (measured maximum is 9 stocks for DGS10) — it is the guard for a
  // regime where everything correlates with rates at once.
  seriesDegreeCap: 25,
  scorePrecision: 6,
  stockTransform: 'log_return_close',
  seriesTransforms: MACRO_SERIES_TRANSFORMS,
  // PIT rule. market.macro_vintage keeps every (observation_date, vintage_date)
  // pair, so the same observation date has several values as FRED revises it.
  // Taking the newest value outright would use a revision that did not exist at
  // the time and quietly make the model look prescient. The caller selects the
  // greatest vintage_date whose available_at is at or before the run cutoff.
  vintageSelection: 'greatest_vintage_date_with_available_at_lte_as_of',
  // Both sides are keyed on the calendar date in UTC. This is worth stating
  // because it is a real limitation for KR stocks against US series: a KR session
  // closes before the US session that sets the day's yield, so a same-date pairing
  // there is contemporaneous by calendar and not by clock.
  alignment: 'same_calendar_date_utc',
  stockPriceField: 'market_ts.ohlcv.close',
  // Not adj_close: measured 2026-08-04, adj_close is populated on 0 of 298,754
  // stock 1D rows and adjustment_version is empty on all of them. close is
  // already split-adjusted at the source (see run-feature-snapshot.ts).
  stockPriceFieldReason: 'adj_close is null on all 298754 stock 1D rows as of 2026-08-04',
});

function assertPositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function assertDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a YYYY-MM-DD date`);
}

/** Consecutive-observation changes, keyed by the later of the two dates. */
function toChanges(
  points: ReadonlyArray<{ date: string; value: number }>,
  transform: 'level_difference' | 'log_return',
  label: string,
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const point of points) {
    assertDate(point.date, `${label} date`);
    if (!Number.isFinite(point.value)) continue;
    if (transform === 'log_return' && point.value <= 0) continue;
    byDate.set(point.date, point.value);
  }
  const dates = [...byDate.keys()].sort();
  const changes = new Map<string, number>();
  for (let index = 1; index < dates.length; index += 1) {
    const previous = byDate.get(dates[index - 1]!)!;
    const current = byDate.get(dates[index]!)!;
    const change =
      transform === 'level_difference' ? current - previous : Math.log(current / previous);
    if (Number.isFinite(change)) changes.set(dates[index]!, change);
  }
  return changes;
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

/**
 * Correlate every (series, stock) pair and keep the ones that clear the
 * threshold, capped per series.
 *
 * The caller has already bounded both sides to the window and applied the vintage
 * rule; this function never reaches for data it was not handed, so what it
 * measured is exactly what the evidence will record.
 */
export function planMacroComovementPairs(
  seriesWindows: readonly MacroSeriesWindow[],
  stockWindows: readonly StockPriceWindow[],
): MacroComovementPlan {
  const seenSeries = new Set<string>();
  const seriesChanges: Array<{ window: MacroSeriesWindow; changes: Map<string, number> }> = [];
  for (const window of [...seriesWindows].sort((left, right) =>
    left.seriesKey < right.seriesKey ? -1 : left.seriesKey > right.seriesKey ? 1 : 0,
  )) {
    assertPositive(window.seriesEntityId, 'seriesEntityId');
    if (seenSeries.has(window.seriesKey)) {
      throw new Error(`duplicate macro series window: ${window.seriesKey}`);
    }
    seenSeries.add(window.seriesKey);
    const transform = MACRO_SERIES_TRANSFORMS[window.seriesKey];
    if (transform === undefined) {
      // Fail closed. A series with no declared transform is a series nobody
      // decided what its numbers mean, and guessing is how a yield gets treated
      // as a price.
      throw new Error(
        `no declared transform for macro series ${window.seriesKey}; ` +
          `add it to MACRO_SERIES_TRANSFORMS or leave it out of the input`,
      );
    }
    seriesChanges.push({
      window,
      changes: toChanges(
        window.observations.map((row) => ({ date: row.date, value: row.value })),
        transform,
        `macro series ${window.seriesKey}`,
      ),
    });
  }

  const seenStocks = new Set<number>();
  const stockChanges: Array<{ stockEntityId: number; changes: Map<string, number> }> = [];
  for (const window of [...stockWindows].sort(
    (left, right) => left.stockEntityId - right.stockEntityId,
  )) {
    assertPositive(window.stockEntityId, 'stockEntityId');
    if (seenStocks.has(window.stockEntityId)) {
      throw new Error(`duplicate stock price window: ${window.stockEntityId}`);
    }
    seenStocks.add(window.stockEntityId);
    stockChanges.push({
      stockEntityId: window.stockEntityId,
      changes: toChanges(
        window.observations.map((row) => ({ date: row.date, value: row.close })),
        'log_return',
        `stock ${window.stockEntityId}`,
      ),
    });
  }

  const corpusDigest = createHash('sha256')
    .update(
      JSON.stringify({
        series: seriesChanges.map((entry) => [entry.window.seriesKey, entry.changes.size]),
        stocks: stockChanges.map((entry) => [entry.stockEntityId, entry.changes.size]),
      }),
    )
    .digest('hex');
  const modelConfig = {
    ...MACRO_COMOVEMENT_MODEL_CONFIG,
    includedSeries: seriesChanges.map((entry) => entry.window.seriesKey),
    excludedSeries: MACRO_SERIES_EXCLUSIONS,
    corpusSeriesCount: seriesChanges.length,
    corpusStockCount: stockChanges.length,
    corpusDigest,
  };

  let pairsWithEnoughOverlap = 0;
  let pairsOverThreshold = 0;
  let pairsDroppedByDegreeCap = 0;
  const pairs: MacroComovementPair[] = [];

  for (const series of seriesChanges) {
    const scored: MacroComovementPair[] = [];
    for (const stock of stockChanges) {
      const overlappingDates = [...series.changes.keys()]
        .filter((date) => stock.changes.has(date))
        .sort();
      if (overlappingDates.length < MACRO_COMOVEMENT_MODEL_CONFIG.minOverlappingObservations) {
        continue;
      }
      pairsWithEnoughOverlap += 1;
      const correlation = pearson(
        overlappingDates.map((date) => series.changes.get(date)!),
        overlappingDates.map((date) => stock.changes.get(date)!),
      );
      if (correlation === null || !Number.isFinite(correlation)) continue;
      const rounded = Number(
        Math.max(-1, Math.min(1, correlation)).toFixed(
          MACRO_COMOVEMENT_MODEL_CONFIG.scorePrecision,
        ),
      );
      if (Math.abs(rounded) < MACRO_COMOVEMENT_MODEL_CONFIG.absCorrelationThreshold) continue;
      pairsOverThreshold += 1;
      scored.push({
        seriesKey: series.window.seriesKey,
        seriesEntityId: series.window.seriesEntityId,
        stockEntityId: stock.stockEntityId,
        correlation: rounded,
        overlappingObservations: overlappingDates.length,
        firstObservedDate: overlappingDates[0]!,
        lastObservedDate: overlappingDates.at(-1)!,
      });
    }
    // Strongest |r| first; ties resolved by entity id so a replay keeps the same
    // set when the cap bites.
    scored.sort(
      (left, right) =>
        Math.abs(right.correlation) - Math.abs(left.correlation) ||
        left.stockEntityId - right.stockEntityId,
    );
    const kept = scored.slice(0, MACRO_COMOVEMENT_MODEL_CONFIG.seriesDegreeCap);
    pairsDroppedByDegreeCap += scored.length - kept.length;
    pairs.push(...kept);
  }

  pairs.sort(
    (left, right) =>
      left.seriesEntityId - right.seriesEntityId || left.stockEntityId - right.stockEntityId,
  );

  return {
    pairs,
    modelConfig,
    diagnostics: {
      seriesConsidered: seriesChanges.length,
      stocksConsidered: stockChanges.length,
      pairsWithEnoughOverlap,
      pairsOverThreshold,
      pairsDroppedByDegreeCap,
    },
  };
}
