import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pipeline = readFileSync(
  new URL('../scripts/run_analytics_pipeline.sh', import.meta.url),
  'utf8',
);

test('analytics pipeline fails closed on stale OHLCV and preserves stage order', () => {
  assert.match(pipeline, /job_name='stock-insight-ohlcv-wrapper'/);
  assert.match(pipeline, /finished_at >= now\(\) - interval '36 hours'/);

  const stages = [
    'run-feature-snapshot.ts',
    'run-graph-inference.ts',
    'run-report-publish.ts',
    'run-feed-build.ts',
    'run-probability-calibration.ts',
  ].map((stage) => pipeline.indexOf(stage));

  assert.ok(stages.every((position) => position >= 0));
  assert.deepEqual(stages, [...stages].sort((left, right) => left - right));
  assert.match(pipeline, /cd "\$ROOT"/);
});
