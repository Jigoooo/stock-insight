import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMacroComovementCandidates } from '../src/relations/builders/macro-comovement.ts';
import {
  MACRO_COMOVEMENT_MODEL_CONFIG,
  MACRO_SERIES_EXCLUSIONS,
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
    observations: dates(closes.length).map((date, index) => ({ date, close: closes[index]! })),
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
    );
    assert.equal(plan.pairs.length, 0);
    // The short series never reached the correlation step at all.
    assert.equal(plan.diagnostics.pairsWithEnoughOverlap, 1);
    assert.equal(plan.diagnostics.pairsOverThreshold, 0);
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

  it('refuses a series whose transform nobody declared', () => {
    assert.throws(
      () => planMacroComovementPairs([seriesWindow('fred:MADEUP', 5099, yieldLevels)], []),
      /no declared transform/i,
    );
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
    const plan = planMacroComovementPairs([seriesWindow('fred:DGS10', 5001, yieldLevels)], stocks);
    assert.equal(plan.pairs.length, cap);
    assert.equal(plan.diagnostics.pairsDroppedByDegreeCap, 5);
  });

  it('documents every series it declines to measure', () => {
    const measured = Object.keys(MACRO_SERIES_TRANSFORMS);
    const excluded = Object.keys(MACRO_SERIES_EXCLUSIONS);
    // 065 registered 13 series; each is either measured or has a stated reason.
    assert.equal(measured.length + excluded.length, 13);
    assert.equal(new Set([...measured, ...excluded]).size, 13);
    for (const reason of Object.values(MACRO_SERIES_EXCLUSIONS)) {
      assert.ok(reason.length > 20, 'an exclusion must say why, not just that');
    }
  });
});

describe('macro co-movement builder', () => {
  const base = {
    seriesEntityId: 5001,
    stockEntityId: 9001,
    seriesKey: 'fred:DGS10',
    correlation: -0.62,
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
