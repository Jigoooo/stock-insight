import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// On 2026-08-03 a single news headline failed run-report-publish's action-advice
// gate. Report publishing ran before v2 impact publishing, so `set -e` took the
// whole pipeline down and no impact path reached the product that run. One
// rejected report block stopped the graph.

const wrapper = readFileSync(
  new URL('../scripts/run_analytics_pipeline.sh', import.meta.url).pathname,
  'utf8',
);

function stepLine(script: string): number {
  const index = wrapper.indexOf(script);
  assert.notEqual(index, -1, `${script} must run in the analytics pipeline`);
  return wrapper.slice(0, index).split('\n').length;
}

test('impact publishing is not downstream of report publishing', () => {
  // Checked in both directions before reordering: report publishing reads
  // content.report_definition, knowledge.claim, knowledge.event and
  // latest_report_pointer; v2 publishing writes analytics.graph_* and
  // impact_path_*. Neither reads what the other writes.
  assert.ok(
    stepLine('run-v2-graph-publish.ts') < stepLine('run-report-publish.ts'),
    'v2 graph publishing must run before report publishing',
  );
  assert.ok(
    stepLine('run-v2-analytics-publish.ts') < stepLine('run-report-publish.ts'),
    'v2 analytics publishing must run before report publishing',
  );
});

test('feed building stays after report publishing', () => {
  // run-feed-build reads content.report. It is the one later step that genuinely
  // depends on report output, so it must not be moved ahead of it.
  assert.ok(
    stepLine('run-report-publish.ts') < stepLine('run-feed-build.ts'),
    'feed building consumes content.report and must follow it',
  );
});

test('impact publishing still follows the graph it reads', () => {
  // v2 publishing reads analytics.graph_snapshot_edge, so graph inference has to
  // come first. Moving it above that would trade one ordering bug for another.
  assert.ok(
    stepLine('run-graph-inference.ts') < stepLine('run-v2-graph-publish.ts'),
    'graph inference must precede v2 publishing',
  );
});

test('the reason for the ordering is recorded next to it', () => {
  // Without this, the next person tidying the file has no way to know the order
  // is load-bearing and will sort the steps back together.
  assert.match(wrapper, /runs before report publishing on purpose/);
  assert.match(wrapper, /Neither reads what the other writes/);
});
