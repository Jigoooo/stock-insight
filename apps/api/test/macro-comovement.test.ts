import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMacroComovementCandidates } from '../src/relations/builders/macro-comovement.ts';
import {
  MACRO_COMOVEMENT_MODEL_CONFIG,
  MACRO_SERIES_EXCLUSIONS,
  MACRO_SERIES_FREQUENCY,
  MACRO_SERIES_TRANSFORMS,
  planMacroComovementPairs,
  type MacroSeriesWindow,
  type StockPriceWindow,
} from '../src/relations/macro-comovement-model.ts';

/** Business days from a fixed start, so a test never depends on the clock. */
function dates(count: number): string[] {
  const out: string[] = [];
  const cursor = new Date('2025-01-01T00:00:00.000Z');
  while (out.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function seriesWindow(
  seriesKey: string,
  seriesEntityId: number,
  values: readonly number[],
): MacroSeriesWindow {
  return {
    seriesKey,
    seriesEntityId,
    observations: dates(values.length).map((date, index) => ({ date, value: values[index]! })),
  };
}

function stockWindow(stockEntityId: number, closes: readonly number[]): StockPriceWindow {
  return {
    stockEntityId,
    marketKey: 'TEST',
    observations: dates(closes.length).map((date, index) => ({ date, close: closes[index]! })),
  };
}

/**
 * A market factor that moves but is (near) orthogonal to the signals below, so
 * the partial correlation reduces to the raw one and the existing assertions
 * still measure what they meant to. A flat factor cannot be used: zero variance
 * makes every correlation with it undefined and the pair is dropped.
 */
function marketWindow(length: number, marketKey = 'TEST') {
  const closes: number[] = [100];
  for (let i = 1; i < length; i += 1) {
    closes.push(closes[i - 1]! * (1 + (i % 7 === 0 ? 0.004 : i % 3 === 0 ? -0.003 : 0.001)));
  }
  return {
    marketKey,
    observations: dates(length).map((date, index) => ({ date, close: closes[index]! })),
  };
}

const LENGTH = 80;

/** Yield levels wandering by a fixed pattern; level_difference is the change. */
const yieldLevels = Array.from({ length: LENGTH }, (_, i) => 4 + Math.sin(i / 3) * 0.2);

describe('macro co-movement model', () => {
  it('reads a yield as a level difference and a price as a log return', () => {
    // A stock whose log return is exactly -2x the yield's level difference must
    // come out at correlation -1. If the yield were run through a return formula
    // instead, this exact relationship would not hold.
    const closes: number[] = [100];
    for (let i = 1; i < LENGTH; i += 1) {
      closes.push(closes[i - 1]! * Math.exp(-2 * (yieldLevels[i]! - yieldLevels[i - 1]!)));
    }
    const plan = planMacroComovementPairs(
      [seriesWindow('fred:DGS10', 5001, yieldLevels)],
      [stockWindow(9001, closes)],
      [marketWindow(LENGTH)],
    );
    assert.equal(plan.pairs.length, 1);
    assert.equal(plan.pairs[0]!.correlation, -1);
    assert.equal(plan.pairs[0]!.seriesEntityId, 5001);
    assert.equal(plan.pairs[0]!.stockEntityId, 9001);
  });

  it('drops a pair below the threshold and one with too little overlap', () => {
    const flat = Array.from({ length: LENGTH }, (_, i) => 100 + (i % 2));
    const short = Array.from({ length: 20 }, (_, i) => 100 + i);
    const plan = planMacroComovementPairs(
      [seriesWindow('fred:DGS10', 5001, yieldLevels)],
      [stockWindow(9002, flat), stockWindow(9003, short)],
      [marketWindow(LENGTH)],
    );
    assert.equal(plan.pairs.length, 0);
    // The short series never reached the correlation step at all.
    assert.equal(plan.diagnostics.pairsWithEnoughOverlap, 1);
    assert.equal(plan.diagnostics.pairsOverThreshold, 0);

    // These two drop for different reasons and only ONE of them is a verdict.
    // 9002 was measured and did not co-move — an existing edge for it is stale
    // and may be retracted. 9003 could not be measured at all, and retracting on
    // that would delete relations whenever an input goes short.
    assert.deepEqual(
      plan.measuredBelowThreshold.map((entry) => entry.stockEntityId),
      [9002],
    );
    assert.equal(plan.diagnostics.pairsBelowThreshold, 1);
    assert.ok(
      Math.abs(plan.measuredBelowThreshold[0]!.correlation) < 0.25,
      'the recorded number must be the measurement that failed the threshold',
    );
  });

  it('binds every constant that decides the output into model_config', () => {
    const plan = planMacroComovementPairs(
      [seriesWindow('fred:DGS10', 5001, yieldLevels)],
      [
        stockWindow(
          9001,
          Array.from({ length: LENGTH }, (_, i) => 100 + i),
        ),
      ],
      [marketWindow(LENGTH)],
    );
    for (const key of [
      'windowDays',
      'absCorrelationThreshold',
      'minOverlappingObservations',
      'seriesDegreeCap',
      'stockTransform',
      'seriesTransforms',
      'vintageSelection',
      'includedSeries',
      'corpusDigest',
    ]) {
      assert.ok(key in plan.modelConfig, `model_config must carry ${key}`);
    }
  });

  it('refuses a series nobody declared a frequency or a transform for', () => {
    // Both are fail-closed gates and either is enough to stop the series. The
    // frequency check runs first because alignment is decided before the change
    // formula is; assert the message names one of them rather than pinning the
    // order, which is not the property worth protecting.
    assert.throws(
      () => planMacroComovementPairs([seriesWindow('fred:MADEUP', 5099, yieldLevels)], []),
      /no declared (frequency|transform)/i,
    );
    // And specifically: a series can never fall through to a default. Every
    // measured series appears in both maps, checked in the exclusions test.
    assert.equal(MACRO_SERIES_FREQUENCY['fred:MADEUP'], undefined);
    assert.equal(MACRO_SERIES_TRANSFORMS['fred:MADEUP'], undefined);
  });

  it('caps a series that correlates with everything', () => {
    const cap = MACRO_COMOVEMENT_MODEL_CONFIG.seriesDegreeCap;
    const stocks: StockPriceWindow[] = [];
    for (let n = 0; n < cap + 5; n += 1) {
      const closes: number[] = [100];
      for (let i = 1; i < LENGTH; i += 1) {
        closes.push(closes[i - 1]! * Math.exp(-2 * (yieldLevels[i]! - yieldLevels[i - 1]!)));
      }
      stocks.push(stockWindow(9100 + n, closes));
    }
    const plan = planMacroComovementPairs([seriesWindow('fred:DGS10', 5001, yieldLevels)], stocks, [
      marketWindow(LENGTH),
    ]);
    assert.equal(plan.pairs.length, cap);
    assert.equal(plan.diagnostics.pairsDroppedByDegreeCap, 5);
  });

  it('removes what the stock and the series merely share with the market', () => {
    // Construct the exact failure the partial exists to prevent: the stock has
    // NO independent relationship to the macro series — its return is purely the
    // market's — while the series also loads on the market. A raw correlation
    // reads that as a strong link; the partial must read it as nothing.
    const market: number[] = [100];
    for (let i = 1; i < LENGTH; i += 1) market.push(market[i - 1]! * (1 + 0.01 * Math.sin(i / 2)));
    const marketReturn = (i: number) => Math.log(market[i]! / market[i - 1]!);

    // Series level whose change is 3x the market return — it loads on the market
    // and on nothing else.
    const seriesLevels: number[] = [50];
    for (let i = 1; i < LENGTH; i += 1)
      seriesLevels.push(seriesLevels[i - 1]! + 3 * marketReturn(i));
    // Stock whose log return IS the market return, exactly.
    const closes: number[] = [100];
    for (let i = 1; i < LENGTH; i += 1) closes.push(closes[i - 1]! * Math.exp(marketReturn(i)));

    const marketFactor = {
      marketKey: 'TEST',
      observations: dates(LENGTH).map((date, i) => ({ date, close: market[i]! })),
    };
    const plan = planMacroComovementPairs(
      [seriesWindow('fred:DGS10', 5001, seriesLevels)],
      [stockWindow(9001, closes)],
      [marketFactor],
    );

    // Raw would be ~1 and would have sailed past the 0.25 threshold. The pair
    // must not survive, because there is nothing left once the market is out.
    assert.equal(plan.pairs.length, 0, 'a pure-beta pair must not become an edge');
    assert.ok(
      plan.diagnostics.pairsWithEnoughOverlap > 0,
      'it must have been computed and then rejected, not skipped for want of data',
    );
  });

  it('refuses rather than guesses when no market factor covers the pair', () => {
    const closes: number[] = [100];
    for (let i = 1; i < LENGTH; i += 1) {
      closes.push(closes[i - 1]! * Math.exp(-2 * (yieldLevels[i]! - yieldLevels[i - 1]!)));
    }
    const plan = planMacroComovementPairs(
      [seriesWindow('fred:DGS10', 5001, yieldLevels)],
      [stockWindow(9001, closes)],
      [], // no factor supplied
    );
    assert.equal(plan.pairs.length, 0);
    assert.ok(
      plan.diagnostics.pairsDroppedByMissingMarket > 0,
      'the drop must be counted, not silent',
    );
  });

  it('documents every series it declines to measure', () => {
    const measured = Object.keys(MACRO_SERIES_TRANSFORMS);
    const excluded = Object.keys(MACRO_SERIES_EXCLUSIONS);
    // Every collected series is either measured or carries a stated reason. The
    // count is asserted so a series cannot be added to one map and forgotten in
    // the other, which is how a series ends up silently unmeasured.
    //
    // 14 → 20 on 2026-08-07, and the gap between those numbers is the point:
    //   +1  fred:DHHNGSP — collected 2026-08-06, in NEITHER map. This assertion
    //       counted 14 and passed, because 14 was also the number of series that
    //       had been thought about. A count only catches drift when it is the
    //       count of what EXISTS, so it is now 15 FRED + 5 ECOS = 20 collected.
    //   +5  the ECOS series (migration 076).
    // macro-series-list-parity.test.ts checks the same invariant against the
    // collector files themselves, which is the version that cannot go stale.
    assert.equal(measured.length + excluded.length, 20);
    assert.equal(new Set([...measured, ...excluded]).size, 20);
    for (const reason of Object.values(MACRO_SERIES_EXCLUSIONS)) {
      assert.ok(reason.length > 20, 'an exclusion must say why, not just that');
    }
    // Every measured series must declare a frequency — the alignment depends on
    // it, and a missing entry would silently fall through to daily.
    for (const seriesKey of measured) {
      assert.ok(MACRO_SERIES_FREQUENCY[seriesKey], `${seriesKey} must declare a frequency`);
    }
  });

  it('aligns a weekly series to its own grid instead of dropping it', () => {
    // ICSA's shape: week-ending dates that never fall on a trading day. Under
    // exact-date matching this pair is invisible; on the series grid it is a
    // clean -1 because the stock is built to move inversely week over week.
    const weekEnds: string[] = [];
    const cursor = new Date('2025-01-04T00:00:00.000Z'); // a Saturday
    while (weekEnds.length < 70) {
      weekEnds.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    const claims = weekEnds.map((_, i) => 200_000 * Math.exp(Math.sin(i / 4) * 0.05));
    const series: MacroSeriesWindow = {
      seriesKey: 'fred:ICSA',
      seriesEntityId: 5010,
      observations: weekEnds.map((date, i) => ({ date, value: claims[i]! })),
    };
    // Daily bars on business days only — none land on a Saturday.
    const bars: Array<{ date: string; close: number }> = [];
    const day = new Date('2025-01-01T00:00:00.000Z');
    let index = 0;
    while (day <= new Date(weekEnds.at(-1)!)) {
      const dow = day.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        const iso = day.toISOString().slice(0, 10);
        const week = weekEnds.findIndex((w) => w >= iso);
        bars.push({ date: iso, close: 100 / (claims[week === -1 ? 0 : week]! / 200_000) });
        index += 1;
      }
      day.setUTCDate(day.getUTCDate() + 1);
    }
    assert.ok(index > 200, 'fixture should produce a full daily series');
    assert.ok(
      bars.every((b) => ![0, 6].includes(new Date(`${b.date}T00:00:00Z`).getUTCDay())),
      'no bar may fall on a weekend — that is the condition being tested',
    );
    const plan = planMacroComovementPairs(
      [series],
      [{ stockEntityId: 9500, marketKey: 'TEST', observations: bars }],
      [
        {
          marketKey: 'TEST',
          // Independent of the claims signal: driven by the bar index, not by
          // the claims series the stock was built to invert. A factor that
          // mirrors either side collapses the partial's denominator.
          observations: bars.map((b, i) => ({
            date: b.date,
            close: 100 * (1 + 0.02 * Math.cos(i / 5)),
          })),
        },
      ],
    );
    assert.equal(plan.pairs.length, 1, 'weekly series must produce a pair via grid alignment');
    assert.ok(
      Math.abs(plan.pairs[0]!.correlation) > 0.9,
      `expected a strong inverse relationship, got ${plan.pairs[0]!.correlation}`,
    );
    assert.ok(plan.pairs[0]!.overlappingObservations >= 60);
  });
});

describe('macro co-movement builder', () => {
  const base = {
    seriesEntityId: 5001,
    stockEntityId: 9001,
    seriesKey: 'fred:DGS10',
    correlation: -0.62,
    rawCorrelation: -0.71,
    stockMarketCorrelation: 0.45,
    overlappingObservations: 240,
    windowStartDate: '2025-08-04',
    windowEndDate: '2026-08-03',
    modelConfig: { model: 'pearson-macro-comovement-v1', threshold: 0.25 },
    sourceRevisionIds: [7001, 7002],
    availableAt: '2026-08-03T00:00:00.000Z',
    validFrom: '2026-08-03T00:00:00.000Z',
  };

  it('accepts a candidate carrying both windows and a model config', () => {
    const built = buildMacroComovementCandidates([base], { asOf: '2026-08-04T00:00:00.000Z' });
    assert.equal(built.candidates.length, 1);
    const candidate = built.candidates[0]!;
    assert.equal(candidate.targetRevisionStatus, 'accepted');
    assert.equal(candidate.relationKind, 'statistical');
    // Canonical undirected order regardless of which endpoint is the series.
    assert.equal(candidate.subjectEntityId, 5001);
    assert.equal(candidate.objectEntityId, 9001);
    // The sign survives; confidence downstream is the magnitude.
    assert.equal(candidate.metadata['correlation'], -0.62);
    assert.equal(candidate.metadata['correlationDirection'], 'opposite');
    assert.equal(candidate.metadata['interpretation'], 'statistical_comovement_not_causal');
    assert.equal(candidate.evidence.length, 2);
  });

  it('quarantines a candidate whose model config is missing', () => {
    const built = buildMacroComovementCandidates([{ ...base, modelConfig: null }], {
      asOf: '2026-08-04T00:00:00.000Z',
    });
    assert.equal(built.candidates[0]!.targetRevisionStatus, 'quarantined_unverified');
    assert.ok(built.candidates[0]!.policyDecision.reasons.includes('missing_model_config'));
  });

  it('quarantines a candidate backed by only one window', () => {
    const built = buildMacroComovementCandidates([{ ...base, sourceRevisionIds: [7001] }], {
      asOf: '2026-08-04T00:00:00.000Z',
    });
    assert.equal(built.candidates[0]!.targetRevisionStatus, 'quarantined_unverified');
    assert.ok(
      built.candidates[0]!.policyDecision.reasons.includes('insufficient_source_revisions'),
    );
  });

  it('excludes an observation that was not available at the run cutoff', () => {
    const built = buildMacroComovementCandidates(
      [{ ...base, availableAt: '2026-08-05T00:00:00.000Z' }],
      { asOf: '2026-08-04T00:00:00.000Z' },
    );
    assert.equal(built.candidates.length, 0);
  });

  it('produces nothing at all from empty windows — the skip path must not throw', () => {
    // Load-bearing. run-v2-graph-publish skips the macro stage by handing in
    // empty windows when migration 066 has not approved the predicate yet. That
    // whole publish is ONE transaction, and persistRelationCandidates THROWS on a
    // predicate with no approved ontology row rather than quarantining it — so if
    // this chain produced even one candidate while unapproved, the daily publish
    // would roll back entirely. Empty in, empty out, no exception.
    const plan = planMacroComovementPairs([], []);
    assert.deepEqual(plan.pairs, []);
    assert.equal(plan.diagnostics.seriesConsidered, 0);
    assert.equal(plan.diagnostics.stocksConsidered, 0);
    const built = buildMacroComovementCandidates([], { asOf: '2026-08-04T00:00:00.000Z' });
    assert.deepEqual(built.candidates, []);
    assert.deepEqual(built.exclusions, []);
  });

  it('rejects a correlation outside [-1,1] rather than clamping it', () => {
    assert.throws(
      () =>
        buildMacroComovementCandidates([{ ...base, correlation: 1.4 }], {
          asOf: '2026-08-04T00:00:00.000Z',
        }),
      /correlation must be within/i,
    );
  });
});
