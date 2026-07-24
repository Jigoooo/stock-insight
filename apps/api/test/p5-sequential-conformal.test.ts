import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSequentialConformal } from '../src/experimental/sequential-conformal.ts';

const calibration = Array.from({ length: 20 }, (_, index) => ({
  absoluteResidual: 1,
  knownAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
}));

const base = {
  targetCoverage: 0.9,
  adaptationRate: 0.05,
  minimumCalibrationSize: 20,
  calibration,
  forecasts: [
    {
      forecastKey: 'f1',
      issuedAt: '2026-07-21T00:00:00.000Z',
      maturityAt: '2026-07-22T00:00:00.000Z',
      pointForecast: 10,
      observedValue: 12,
      outcomeKnownAt: '2026-07-22T01:00:00.000Z',
    },
    {
      forecastKey: 'f2',
      issuedAt: '2026-07-23T00:00:00.000Z',
      maturityAt: '2026-07-24T00:00:00.000Z',
      pointForecast: 10,
      observedValue: 10.5,
      outcomeKnownAt: '2026-07-24T01:00:00.000Z',
    },
  ],
};

describe('P5-4 adaptive sequential conformal', () => {
  it('uses only outcome-known residuals and widens after a miss', () => {
    const result = runSequentialConformal(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.deepEqual(result.intervals[0], {
      forecastKey: 'f1',
      issuedAt: '2026-07-21T00:00:00.000Z',
      lower: 9,
      upper: 11,
      quantile: 1,
      calibrationSize: 20,
      covered: false,
    });
    assert.ok(result.intervals[1]!.quantile >= 2);
    assert.equal(result.intervals[1]?.covered, true);
    assert.deepEqual(result.coverage, {
      maturedDue: 2,
      finalObserved: 2,
      missingOutcome: 0,
      covered: 1,
      rate: 0.5,
    });
    assert.ok(result.finalMiscoverageLevel < 0.1);
  });

  it('does not let future-known calibration residuals leak backward', () => {
    const withFuture = {
      ...base,
      calibration: [...calibration, { absoluteResidual: 100, knownAt: '2026-07-25T00:00:00.000Z' }],
    };
    assert.deepEqual(runSequentialConformal(withFuture), runSequentialConformal(base));
  });

  it('fails closed on missing calibration, invalid probability bounds, or outcome chronology', () => {
    for (const input of [
      { ...base, calibration: calibration.slice(0, 5) },
      { ...base, targetCoverage: 1 },
      {
        ...base,
        forecasts: [
          {
            ...base.forecasts[0]!,
            outcomeKnownAt: '2026-07-20T00:00:00.000Z',
          },
        ],
      },
    ]) {
      assert.deepEqual(runSequentialConformal(input), {
        status: 'abstained',
        reason: 'INVALID_SEQUENTIAL_CONFORMAL_INPUT',
        candidateOnly: true,
        acceptedFactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
