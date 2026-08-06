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
  /**
   * Which market factor this stock is controlled for. A stock must be measured
   * against its OWN market — controlling a Korean stock for the S&P would
   * subtract a factor it does not load on.
   */
  marketKey: string;
};

/** A market factor series, keyed by StockPriceWindow.marketKey. */
export type MarketFactorWindow = {
  marketKey: string;
  observations: readonly StockPriceObservation[];
};

export type MacroComovementPair = {
  seriesKey: string;
  seriesEntityId: number;
  stockEntityId: number;
  /**
   * PARTIAL correlation of the two change series controlling for the stock's
   * market factor, within [-1,1]. This is the number the edge asserts.
   */
  correlation: number;
  /** Raw Pearson correlation before the market factor is removed. */
  rawCorrelation: number;
  /** Correlation of the stock with its market factor over the same dates (beta-ish). */
  stockMarketCorrelation: number;
  overlappingObservations: number;
  /** First and last date contributing a change to both sides. */
  firstObservedDate: string;
  lastObservedDate: string;
};

/**
 * A pair this run MEASURED and found not to co-move.
 *
 * This is the only absence that carries information. A pair can fail to become a
 * candidate for four different reasons and only one of them means "we looked and
 * it does not hold":
 *
 *   overlap below the minimum      we could not measure it        NOT this
 *   series or stock not loaded     we did not measure it          NOT this
 *   dropped by the degree cap      measured, holds, capped        NOT this
 *   |partial r| below threshold    measured, does not hold        THIS
 *
 * Retracting on absence alone would delete relations whenever an input went
 * missing. Retracting on this is a statement the run can actually back.
 */
export type MacroComovementMeasuredAbsence = {
  seriesEntityId: number;
  stockEntityId: number;
  /** The partial correlation actually computed, below the threshold in absolute value. */
  correlation: number;
  overlappingObservations: number;
  lastObservedDate: string;
};

export type MacroComovementPlan = {
  pairs: MacroComovementPair[];
  /**
   * Pairs measured and found below threshold. An existing edge for one of these
   * is stale and should be retracted — see MacroComovementMeasuredAbsence.
   */
  measuredBelowThreshold: MacroComovementMeasuredAbsence[];
  modelConfig: Record<string, unknown>;
  /** Per-series counts, for a run summary that shows where candidates died. */
  diagnostics: {
    seriesConsidered: number;
    stocksConsidered: number;
    pairsWithEnoughOverlap: number;
    pairsOverThreshold: number;
    pairsBelowThreshold: number;
    pairsDroppedByDegreeCap: number;
    /** No market factor covered this pair's dates — never guessed at. */
    pairsDroppedByMissingMarket: number;
    /** The market explained a side almost entirely; the partial is undefined. */
    pairsDroppedByDegenerateMarket: number;
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
    // Weekly. Both are levels (a dollar balance, a claim count), so a log return
    // is the change — same reasoning as DEXKOUS, not the level difference used
    // for yields.
    'fred:WALCL': 'log_return',
    'fred:ICSA': 'log_return',
    // Daily. A price level, so a log return — the same treatment as DEXKOUS.
    'fred:DCOILWTICO': 'log_return',
    // Daily gas price level; same treatment as WTI beside it.
    'fred:DHHNGSP': 'log_return',
    // Korean yields, quoted in 연% exactly like DGS10/DGS2, so the change is the
    // level difference in percentage points. A log return of a yield is not a
    // return of anything — and a yield can legitimately approach zero (CD 91일
    // bottomed at 0.630), which a log transform handles badly.
    'ecos:817Y002:010200000': 'level_difference',
    'ecos:817Y002:010210000': 'level_difference',
    'ecos:817Y002:010300000': 'level_difference',
    'ecos:817Y002:010502000': 'level_difference',
    'ecos:722Y001:0101000': 'level_difference',
  });

/**
 * How often each series publishes, which decides how the stock side is aligned.
 *
 * A weekly series compared against a one-day stock return is a frequency
 * mismatch — it correlates a week of macro movement with a single session. The
 * fix is to put both sides on the series' own grid: the stock's change between
 * consecutive series observation dates.
 *
 * This is what admits ICSA at all. Its week-ending dates are Saturdays, so 0 of
 * 260 fall on a trading day and exact-date alignment produced nothing; resampled
 * to the series grid, all 260 are usable (measured 2026-08-05).
 */
export const MACRO_SERIES_FREQUENCY: Readonly<Record<string, 'daily' | 'weekly'>> = Object.freeze({
  'fred:DGS10': 'daily',
  'fred:DGS2': 'daily',
  'fred:DEXKOUS': 'daily',
  'fred:WALCL': 'weekly',
  'fred:ICSA': 'weekly',
  'fred:DCOILWTICO': 'daily',
  // Added 2026-08-07. Collected 2026-08-06 and left out of both tables, which made
  // it invisible here: loadMacroComovementInputs asks for exactly the keys of
  // MACRO_SERIES_TRANSFORMS, so a series missing from it is not a crash but a
  // silent no-op. It held 680 vintages and zero relations of any predicate.
  'fred:DHHNGSP': 'daily',
  // Korean daily series (migration 076). All five are 시장금리/정책금리, and the
  // `rates` vocabulary already carried 국채·금리·기준금리·한국은행 while every
  // mapped series was American.
  'ecos:817Y002:010200000': 'daily',
  'ecos:817Y002:010210000': 'daily',
  'ecos:817Y002:010300000': 'daily',
  'ecos:817Y002:010502000': 'daily',
  // Calendar-daily, not trading-daily: 4,233 rows over the same span where the
  // market rates have 2,857, because the policy rate is published every day
  // including weekends. That is fine for alignment (it covers every trading day)
  // but it is a step function, so its change series is zero almost everywhere.
  // Expected to produce few pairs or none; `varianceLeft === 0` returns null and
  // it drops out quietly rather than inventing a correlation.
  'ecos:722Y001:0101000': 'daily',
});

/** How far back a resampled grid may reach for the last close at or before a date. */
const WEEKLY_RESAMPLE_LOOKBACK_DAYS = 6;

/**
 * Window length per frequency, because a window is only meaningful in units of
 * the series' own observations.
 *
 * 365 days is ~250 points for a daily series and ~52 for a weekly one. 52 is
 * below minOverlappingObservations of 60, so weekly series loaded, computed, and
 * produced zero pairs — the builder reported seriesLoaded 5 and 18 candidates,
 * exactly as if the two new series did not exist. Measured 2026-08-05, and it is
 * the same trap the monthly series are held back by.
 *
 * 1095 days gives a weekly series ~156 points. That is a wider window than the
 * daily one and spans more than one rate regime, which is a real cost — but a
 * correlation computed from 51 points has a confidence interval wide enough to
 * be useless, and quietly emitting nothing is worse than either.
 */
export const MACRO_WINDOW_DAYS_BY_FREQUENCY: Readonly<Record<'daily' | 'weekly', number>> =
  Object.freeze({ daily: 365, weekly: 1095 });

/**
 * The eight series still left out, with the number that excludes each.
 *
 * This was ten. WALCL and ICSA moved into the measured set once the stock side
 * could be resampled onto a weekly grid — ICSA especially, which exact-date
 * alignment scored at 0 of 260 usable dates and grid alignment scores at 260.
 *
 * Kept in code rather than only in a document so the reason sits next to the
 * decision, and so a series cannot quietly reappear without someone deleting
 * the sentence that says why it left.
 */
export const MACRO_SERIES_EXCLUSIONS: Readonly<Record<string, string>> = Object.freeze({
  // The eight monthly series, all blocked by the same number. Resampling them to
  // a monthly grid is mechanically the same as the weekly path above, and it is
  // deliberately NOT done: over the ~5-year overlap each yields 57-59 monthly
  // observations (measured 2026-08-05), which is below
  // minOverlappingObservations of 60. They would produce zero pairs and the
  // builder would look like it had worked.
  //
  // Lowering the threshold for monthly series is a statistical judgement about
  // how few points may carry a correlation, not a config tweak, so it is left
  // for someone to decide with the numbers in hand rather than slipped in here.
  'fred:CPIAUCSL': 'monthly: 57 resampled observations, below the 60 minimum',
  'fred:PCEPI': 'monthly: 58 resampled observations, below the 60 minimum',
  'fred:FEDFUNDS': 'monthly: 59 resampled observations, below the 60 minimum',
  'fred:UNRATE': 'monthly: 57 resampled observations, below the 60 minimum',
  'fred:PAYEMS': 'monthly: 58 resampled observations, below the 60 minimum',
  'fred:INDPRO': 'monthly: 58 resampled observations, below the 60 minimum',
  'fred:RSAFS': 'monthly: 58 resampled observations, below the 60 minimum',
  'fred:UMCSENT': 'monthly: 58 resampled observations, below the 60 minimum',
});

export const MACRO_COMOVEMENT_MODEL_CONFIG = Object.freeze({
  model: 'pearson-macro-comovement-v1',
  // 365 days, not the 45 that run-v2-analytics-publish uses for its measurement
  // pass. 45 days of daily data is ~30 overlapping points, which is a number with
  // a wide enough confidence interval to be noise. 365 gives ~247 for US stocks
  // and ~233 for KR (measured 2026-08-04) while staying inside one rate regime.
  windowDays: 365,
  // Per-frequency, because 365 days of a weekly series is only ~52 points.
  // See MACRO_WINDOW_DAYS_BY_FREQUENCY.
  windowDaysByFrequency: { daily: 365, weekly: 1095 },
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
  // The edge asserts the PARTIAL correlation, not the raw one. Without this the
  // number restates market beta: an energy name moves with oil partly because
  // both move with everything. Raw and the stock's market correlation are kept
  // on the relation so the subtraction can be checked rather than trusted.
  correlationKind: 'partial_controlling_for_market_factor',
  marketFactorTransform: 'log_return',
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

/**
 * Put a daily stock series onto a weekly series' own observation grid.
 *
 * For each series date, take the last close at or before it, reaching back at
 * most WEEKLY_RESAMPLE_LOOKBACK_DAYS. The result is the stock's value at the
 * same instants the macro series is sampled, so the change computed from it
 * spans the same interval the macro change does.
 *
 * A date with no close inside the lookback is dropped rather than carried
 * forward from further back — a stale price would invent a week of flat return.
 */
function resampleToGrid(
  points: ReadonlyArray<{ date: string; value: number }>,
  grid: readonly string[],
): Array<{ date: string; value: number }> {
  const sorted = [...points].sort((left, right) => (left.date < right.date ? -1 : 1));
  const out: Array<{ date: string; value: number }> = [];
  let cursor = 0;
  let latest: { date: string; value: number } | null = null;
  for (const target of [...grid].sort()) {
    while (cursor < sorted.length && sorted[cursor]!.date <= target) {
      latest = sorted[cursor]!;
      cursor += 1;
    }
    if (latest === null) continue;
    const ageDays =
      (Date.parse(`${target}T00:00:00.000Z`) - Date.parse(`${latest.date}T00:00:00.000Z`)) /
      86_400_000;
    if (ageDays > WEEKLY_RESAMPLE_LOOKBACK_DAYS) continue;
    out.push({ date: target, value: latest.value });
  }
  return out;
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
/**
 * Partial correlation of x and y holding the market factor m fixed.
 *
 * A raw correlation between a stock and a macro series contains whatever both
 * share with the market. Energy Select SPDR correlates +0.592 with WTI, but part
 * of that is simply "both went up when everything went up" — the edge would be
 * restating market beta while claiming to say something about oil.
 *
 * This is the exact algebraic partial, not a regression: for three standardised
 * series it is equivalent to correlating the residuals of x~m and y~m, and needs
 * only the three pairwise correlations.
 *
 * Returns null when the market explains a series almost entirely (|r|→1), where
 * the denominator collapses and the partial is not defined — an index-tracking
 * ETF against its own index is the case that hits this. Refusing is right: there
 * is no independent variation left to measure.
 */
function partialCorrelation(rXY: number, rXM: number, rYM: number): number | null {
  const denominator = Math.sqrt((1 - rXM * rXM) * (1 - rYM * rYM));
  if (!Number.isFinite(denominator) || denominator < 1e-6) return null;
  const value = (rXY - rXM * rYM) / denominator;
  if (!Number.isFinite(value)) return null;
  return Math.max(-1, Math.min(1, value));
}

export function planMacroComovementPairs(
  seriesWindows: readonly MacroSeriesWindow[],
  stockWindows: readonly StockPriceWindow[],
  marketFactors: readonly MarketFactorWindow[] = [],
): MacroComovementPlan {
  // The window is anchored on the latest observation present, not on the clock,
  // so a replay of the same inputs produces the same window.
  const allDates = [
    ...seriesWindows.flatMap((w) => w.observations.map((o) => o.date)),
    ...stockWindows.flatMap((w) => w.observations.map((o) => o.date)),
  ];
  const anchorDate = allDates.length > 0 ? allDates.reduce((a, b) => (a >= b ? a : b)) : null;
  const boundTo = <T extends { date: string }>(rows: readonly T[], days: number): T[] => {
    if (anchorDate === null) return [...rows];
    const floor = new Date(Date.parse(`${anchorDate}T00:00:00.000Z`) - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return rows.filter((row) => row.date >= floor);
  };

  const seenSeries = new Set<string>();
  const seriesChanges: Array<{
    window: MacroSeriesWindow;
    frequency: 'daily' | 'weekly';
    changes: Map<string, number>;
  }> = [];
  for (const window of [...seriesWindows].sort((left, right) =>
    left.seriesKey < right.seriesKey ? -1 : left.seriesKey > right.seriesKey ? 1 : 0,
  )) {
    assertPositive(window.seriesEntityId, 'seriesEntityId');
    if (seenSeries.has(window.seriesKey)) {
      throw new Error(`duplicate macro series window: ${window.seriesKey}`);
    }
    seenSeries.add(window.seriesKey);
    const frequency = MACRO_SERIES_FREQUENCY[window.seriesKey];
    if (frequency === undefined) {
      throw new Error(`no declared frequency for macro series ${window.seriesKey}`);
    }
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
      frequency,
      changes: toChanges(
        boundTo(window.observations, MACRO_WINDOW_DAYS_BY_FREQUENCY[frequency]).map((row) => ({
          date: row.date,
          value: row.value,
        })),
        transform,
        `macro series ${window.seriesKey}`,
      ),
    });
  }

  const seenStocks = new Set<number>();
  // Raw points are kept because a weekly series needs the stock resampled onto
  // ITS grid — the change series differs per series frequency, so it cannot be
  // computed once up front.
  const stockPoints: Array<{
    stockEntityId: number;
    marketKey: string;
    points: Array<{ date: string; value: number }>;
  }> = [];
  for (const window of [...stockWindows].sort(
    (left, right) => left.stockEntityId - right.stockEntityId,
  )) {
    assertPositive(window.stockEntityId, 'stockEntityId');
    if (seenStocks.has(window.stockEntityId)) {
      throw new Error(`duplicate stock price window: ${window.stockEntityId}`);
    }
    seenStocks.add(window.stockEntityId);
    stockPoints.push({
      stockEntityId: window.stockEntityId,
      marketKey: window.marketKey,
      points: window.observations.map((row) => ({ date: row.date, value: row.close })),
    });
  }
  const dailyStockChanges = stockPoints.map((entry) => ({
    stockEntityId: entry.stockEntityId,
    marketKey: entry.marketKey,
    changes: toChanges(
      boundTo(entry.points, MACRO_WINDOW_DAYS_BY_FREQUENCY.daily),
      'log_return',
      `stock ${entry.stockEntityId}`,
    ),
  }));
  const weeklyStockChangesBySeries = new Map<
    string,
    Array<{ stockEntityId: number; marketKey: string; changes: Map<string, number> }>
  >();
  for (const series of seriesChanges) {
    if (series.frequency !== 'weekly') continue;
    const grid = boundTo(series.window.observations, MACRO_WINDOW_DAYS_BY_FREQUENCY.weekly).map(
      (row) => row.date,
    );
    weeklyStockChangesBySeries.set(
      series.window.seriesKey,
      stockPoints.map((entry) => ({
        stockEntityId: entry.stockEntityId,
        marketKey: entry.marketKey,
        changes: toChanges(
          resampleToGrid(entry.points, grid),
          'log_return',
          `stock ${entry.stockEntityId} on ${series.window.seriesKey} grid`,
        ),
      })),
    );
  }

  // Market factors get the same treatment as the stock side: a weekly series is
  // correlated against the market resampled onto that series' grid, so all three
  // correlations in the partial are measured over one set of intervals.
  const marketPoints = marketFactors.map((factor) => ({
    marketKey: factor.marketKey,
    points: factor.observations.map((row) => ({ date: row.date, value: row.close })),
  }));
  const dailyMarketChanges = new Map(
    marketPoints.map((entry) => [
      entry.marketKey,
      toChanges(
        boundTo(entry.points, MACRO_WINDOW_DAYS_BY_FREQUENCY.daily),
        'log_return',
        `market ${entry.marketKey}`,
      ),
    ]),
  );
  const weeklyMarketChangesBySeries = new Map<string, Map<string, Map<string, number>>>();
  for (const series of seriesChanges) {
    if (series.frequency !== 'weekly') continue;
    const grid = boundTo(series.window.observations, MACRO_WINDOW_DAYS_BY_FREQUENCY.weekly).map(
      (row) => row.date,
    );
    weeklyMarketChangesBySeries.set(
      series.window.seriesKey,
      new Map(
        marketPoints.map((entry) => [
          entry.marketKey,
          toChanges(
            resampleToGrid(entry.points, grid),
            'log_return',
            `market ${entry.marketKey} on ${series.window.seriesKey} grid`,
          ),
        ]),
      ),
    );
  }

  const corpusDigest = createHash('sha256')
    .update(
      JSON.stringify({
        series: seriesChanges.map((entry) => [entry.window.seriesKey, entry.changes.size]),
        stocks: dailyStockChanges.map((entry) => [entry.stockEntityId, entry.changes.size]),
      }),
    )
    .digest('hex');
  const modelConfig = {
    ...MACRO_COMOVEMENT_MODEL_CONFIG,
    includedSeries: seriesChanges.map((entry) => entry.window.seriesKey),
    seriesFrequencies: MACRO_SERIES_FREQUENCY,
    excludedSeries: MACRO_SERIES_EXCLUSIONS,
    corpusSeriesCount: seriesChanges.length,
    corpusStockCount: dailyStockChanges.length,
    corpusDigest,
  };

  let pairsWithEnoughOverlap = 0;
  let pairsOverThreshold = 0;
  let pairsDroppedByDegreeCap = 0;
  let pairsDroppedByMissingMarket = 0;
  let pairsDroppedByDegenerateMarket = 0;
  const pairs: MacroComovementPair[] = [];
  const measuredBelowThreshold: MacroComovementMeasuredAbsence[] = [];

  for (const series of seriesChanges) {
    // A weekly series is paired against the stock resampled onto its own grid,
    // so both sides measure the same interval. A daily series uses the stock's
    // daily changes unchanged.
    const stockSide = weeklyStockChangesBySeries.get(series.window.seriesKey) ?? dailyStockChanges;
    const marketChangesByKey =
      weeklyMarketChangesBySeries.get(series.window.seriesKey) ?? dailyMarketChanges;
    const scored: MacroComovementPair[] = [];
    for (const stock of stockSide) {
      const overlappingDates = [...series.changes.keys()]
        .filter((date) => stock.changes.has(date))
        .sort();
      if (overlappingDates.length < MACRO_COMOVEMENT_MODEL_CONFIG.minOverlappingObservations) {
        continue;
      }
      pairsWithEnoughOverlap += 1;
      const seriesValues = overlappingDates.map((date) => series.changes.get(date)!);
      const stockValues = overlappingDates.map((date) => stock.changes.get(date)!);
      const raw = pearson(seriesValues, stockValues);
      if (raw === null || !Number.isFinite(raw)) continue;

      // Remove what the stock and the series merely share with the stock's own
      // market. Without this the edge restates beta: an energy name correlates
      // with oil partly because both rose when everything rose.
      const marketChanges = marketChangesByKey.get(stock.marketKey);
      if (marketChanges === undefined) {
        pairsDroppedByMissingMarket += 1;
        continue;
      }
      const marketValues = overlappingDates.map((date) => marketChanges.get(date));
      if (marketValues.some((value) => value === undefined)) {
        // The market factor must cover exactly the dates being correlated;
        // a partial computed over a different set is not the same quantity.
        pairsDroppedByMissingMarket += 1;
        continue;
      }
      const market = marketValues as number[];
      const rStockMarket = pearson(stockValues, market);
      const rSeriesMarket = pearson(seriesValues, market);
      if (rStockMarket === null || rSeriesMarket === null) {
        pairsDroppedByMissingMarket += 1;
        continue;
      }
      const partial = partialCorrelation(raw, rSeriesMarket, rStockMarket);
      if (partial === null) {
        pairsDroppedByDegenerateMarket += 1;
        continue;
      }
      const precision = MACRO_COMOVEMENT_MODEL_CONFIG.scorePrecision;
      const rounded = Number(partial.toFixed(precision));
      if (Math.abs(rounded) < MACRO_COMOVEMENT_MODEL_CONFIG.absCorrelationThreshold) {
        // Measured, and it does not hold. Recorded rather than dropped so an
        // edge left over from a run that DID accept this pair can be retracted.
        // Every other `continue` above is an inability to measure and must not
        // reach this list.
        measuredBelowThreshold.push({
          seriesEntityId: series.window.seriesEntityId,
          stockEntityId: stock.stockEntityId,
          correlation: rounded,
          overlappingObservations: overlappingDates.length,
          lastObservedDate: overlappingDates.at(-1)!,
        });
        continue;
      }
      pairsOverThreshold += 1;
      scored.push({
        seriesKey: series.window.seriesKey,
        seriesEntityId: series.window.seriesEntityId,
        stockEntityId: stock.stockEntityId,
        correlation: rounded,
        rawCorrelation: Number(raw.toFixed(precision)),
        stockMarketCorrelation: Number(rStockMarket.toFixed(precision)),
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

  measuredBelowThreshold.sort(
    (left, right) =>
      left.seriesEntityId - right.seriesEntityId || left.stockEntityId - right.stockEntityId,
  );

  return {
    pairs,
    measuredBelowThreshold,
    modelConfig,
    diagnostics: {
      seriesConsidered: seriesChanges.length,
      stocksConsidered: dailyStockChanges.length,
      pairsWithEnoughOverlap,
      pairsOverThreshold,
      pairsBelowThreshold: measuredBelowThreshold.length,
      pairsDroppedByDegreeCap,
      pairsDroppedByMissingMarket,
      pairsDroppedByDegenerateMarket,
    },
  };
}
