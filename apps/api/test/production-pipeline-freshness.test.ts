import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const market = read('../scripts/run_market_enrichment.sh');
const knowledge = read('../scripts/run_knowledge_pipeline.sh');
const ohlcv = read('../scripts/run_ohlcv_daily.sh');
const analytics = read('../scripts/run_analytics_pipeline.sh');
const common = read('../scripts/pipeline_common.sh');

test('production pipelines require outputs completed after their own run start', () => {
  for (const script of [market, knowledge, ohlcv, analytics]) {
    assert.match(script, /RUN_STARTED_AT=\$\(pipeline_db_now\)/);
    assert.match(script, /finished_at >= '\$\{RUN_STARTED_AT\}'::timestamptz/);
  }

  for (const job of [
    'stock-insight-dart-financial-facts',
    'stock-insight-sec-financial-facts',
    'stock-insight-finra-short-volume',
    'stock-insight-fred-vintage',
    'stock-insight-split-factors',
  ]) {
    assert.match(market, new RegExp(job));
  }
  assert.match(market, /status IN \('completed','partial'\)/);

  for (const job of ['stock-insight-knowledge-extraction-stage', 'stock-insight-event-brief']) {
    assert.match(knowledge, new RegExp(job));
  }

  for (const job of [
    'stock-insight-feature-snapshot-stage',
    'stock-insight-graph-inference-stage',
    'stock-insight-report-publish-stage',
    'stock-insight-feed-build-stage',
    'stock-insight-probability-calibration-stage',
  ]) {
    assert.match(analytics, new RegExp(job));
  }
});

test('downstream pipelines fail closed on fresh upstream audit SLAs', () => {
  assert.match(knowledge, /job_name='stock-insight-rss-news-ingest'/);
  assert.match(knowledge, /interval '2 hours'/);

  assert.match(analytics, /job_name='stock-insight-ohlcv-wrapper'/);
  assert.match(analytics, /interval '36 hours'/);
  assert.match(analytics, /interval '4 hours'/);
  assert.match(analytics, /job_name='stock-insight-knowledge-wrapper'/);
  assert.match(analytics, /job_name='stock-insight-market-enrichment-wrapper'/);
  assert.match(analytics, /SELECT DISTINCT ON \(job_name\)/);
  assert.match(analytics, /ORDER BY job_name, started_at DESC, id DESC/);
  assert.equal((analytics.match(/SELECT 1 FROM latest_wrapper/g) ?? []).length, 3);
});

test('wrapper attempts begin before work and complete only after each final readback gate', () => {
  for (const [script, marker] of [
    [market, 'stock-insight-market-enrichment-wrapper'],
    [knowledge, 'stock-insight-knowledge-wrapper'],
    [ohlcv, 'stock-insight-ohlcv-wrapper'],
    [analytics, 'stock-insight-analytics-wrapper'],
  ] as const) {
    assert.ok(script.indexOf('pipeline_start_wrapper_attempt') < script.indexOf('pipeline_require_db_assertion'));
    assert.ok(script.lastIndexOf('pipeline_require_db_assertion') < script.lastIndexOf('pipeline_finish_wrapper_attempt'));
    assert.match(script, new RegExp(`pipeline_start_wrapper_attempt ${marker}`));
    assert.match(script, /pipeline_finish_wrapper_attempt "\$WRAPPER_ATTEMPT_ID" completed/);
    assert.match(script, /pipeline_finish_wrapper_attempt "\$WRAPPER_ATTEMPT_ID" failed/);
  }
  assert.match(common, /pipeline_start_wrapper_attempt/);
  assert.match(common, /SELECT clock_timestamp\(\)/);
  assert.match(common, /'running'/);
  assert.match(common, /status = :'wrapper_status'/);
  assert.match(common, /"completed" && "\$status" != "failed"/);
});

test('systemd units do not pretend After alone is an upstream success dependency', () => {
  const marketService = read('../../../ops/systemd/user/stock-insight-market-enrichment.service');
  const knowledgeService = read('../../../ops/systemd/user/stock-insight-knowledge.service');
  const analyticsService = read('../../../ops/systemd/user/stock-insight-analytics.service');

  assert.doesNotMatch(marketService, /After=.*stock-insight-fundamentals\.service/);
  assert.doesNotMatch(knowledgeService, /After=.*stock-insight-news\.service/);
  assert.doesNotMatch(analyticsService, /After=.*stock-insight-(ohlcv|knowledge)\.service/);
  assert.match(marketService, /After=network-online\.target/);
  assert.match(knowledgeService, /After=network-online\.target/);
});
