import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeProbabilityMetrics,
  expandingLabelProbabilities,
  type ExpandingForecast,
} from '../src/analytics/probability-calibration.ts';

test('probability metrics compute exact Brier and bounded calibration bins', () => {
  const metrics = computeProbabilityMetrics([
    { probability: 0.8, outcome: true },
    { probability: 0.2, outcome: false },
  ]);
  assert.equal(metrics.sample_n, 2);
  assert.equal(metrics.brier_score, 0.04);
  assert.equal(metrics.expected_calibration_error, 0.2);
  assert.equal(metrics.calibration_bins.length, 2);
  assert.ok(metrics.log_loss !== null && metrics.log_loss > 0);
});

test('probability metrics reject values outside 0..1', () => {
  assert.throws(
    () => computeProbabilityMetrics([{ probability: 1.01, outcome: true }]),
    /out of range/,
  );
});

test('expanding baseline cannot see outcomes known after issuance', () => {
  const day = (value: string) => new Date(`${value}T00:00:00Z`);
  const rows: ExpandingForecast[] = [
    {
      id: 1,
      market: 'US',
      horizonDays: 7,
      confidenceLabel: 'medium',
      issuedAt: day('2026-01-01'),
      knownAt: day('2026-01-10'),
      targetHit: true,
    },
    {
      id: 2,
      market: 'US',
      horizonDays: 7,
      confidenceLabel: 'medium',
      issuedAt: day('2026-01-05'),
      knownAt: day('2026-01-12'),
      targetHit: false,
    },
    {
      id: 3,
      market: 'US',
      horizonDays: 7,
      confidenceLabel: 'medium',
      issuedAt: day('2026-01-11'),
      knownAt: day('2026-01-20'),
      targetHit: false,
    },
  ];
  const output = expandingLabelProbabilities(rows, 1);
  assert.deepEqual(output.map((row) => row.id), [3]);
  assert.equal(output[0]!.probability, 1, 'only id=1 was known at id=3 issuance');
  assert.equal(output[0]!.priorSampleN, 1);
});
