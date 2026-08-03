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

  // v2 publishing sits ahead of report publishing since 2026-08-03 so a rejected
  // report block cannot stop impact serving; feed building still trails report
  // publishing because it reads content.report.
  const stages = [
    'run-feature-snapshot.ts',
    'run-graph-inference.ts',
    'run-v2-graph-publish.ts',
    'run-v2-analytics-publish.ts',
    'run-report-publish.ts',
    'run-feed-build.ts',
    'run-probability-calibration.ts',
  ].map((stage) => pipeline.indexOf(stage));

  assert.ok(stages.every((position) => position >= 0));
  assert.deepEqual(
    stages,
    [...stages].sort((left, right) => left - right),
  );
  assert.match(
    pipeline,
    /claim\.natural_run_key LIKE 'v2-graph-publish:'[\s\S]*claim_status='completed'/,
  );
  assert.match(pipeline, /serving\.v_relation_graph_freshness[\s\S]*servable=true/);
  assert.match(pipeline, /cd "\$ROOT"/);
});
