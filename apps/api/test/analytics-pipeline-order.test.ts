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

test('the valuation band is produced before the packet that reads it', () => {
  // 블록 7 은 analytics.valuation_estimate_revision 을 읽는다. 순서가 뒤집히면 패킷은
  // 하루 전 밴드를 싣고 — 첫 실행에서는 아무것도 못 싣고 — 297종목 not_produced 가
  // 그대로 유지되는데, 아무것도 실패하지 않으므로 회귀가 보이지 않는다.
  assert.ok(
    stepLine('run-k4-valuation-band.ts') < stepLine('run-scenario-thesis.ts'),
    'thesis 는 밴드의 해석이므로 밴드 뒤여야 한다',
  );
  assert.ok(
    stepLine('run-scenario-thesis.ts') < stepLine('run-common-asset-view.ts'),
    'the valuation band producer must run before the common asset view builder',
  );
});

test('the anomaly radar reads the snapshot that owns the move definition', () => {
  // ret_1d 와 vol_20d 를 레이더가 다시 계산하지 않는다는 것이 이 순서의 요점이다.
  // 앞에 두면 어제 스냅샷으로 오늘의 이상치를 판정하게 되고, 그 어긋남은 아무것도
  // 실패시키지 않은 채 하루치 레이더를 통째로 틀리게 만든다.
  assert.ok(
    stepLine('run-feature-snapshot.ts') < stepLine('run-market-anomaly.ts'),
    '레이더는 움직임의 정의를 소유한 스냅샷 뒤여야 한다',
  );
});

test('spans are verified before the packet that reports whether they were', () => {
  // 블록 10 이 읽는 것은 knowledge.assertion 의 verification_state 다. 순서가
  // 뒤집히면 오늘 승격한 것이 내일 패킷에 나타나고, 그 하루 동안 화면은
  // unverified_only 를 말하면서 원장은 verified_span 을 들고 있다. 아무것도
  // 실패하지 않으므로 그 불일치는 사람이 두 곳을 나란히 열어봐야만 보인다.
  assert.ok(
    stepLine('run-assertion-span-verification.ts') < stepLine('run-common-asset-view.ts'),
    '인용 검증은 그것을 읽는 패킷보다 먼저 돌아야 한다',
  );
});

test('span verification shares the K4 canary cutoff', () => {
  // 검증 시각이 곧 새 리비전의 known_at 이다. 다른 시계를 주면 같은 실행 안에서
  // 원장의 두 부분이 서로 다른 시각을 주장한다.
  assert.match(wrapper, /run-assertion-span-verification\.ts --cutoff "\$K4_CANARY_CUTOFF"/);
});

test('the valuation band shares the K4 canary cutoff', () => {
  // information_set_id 는 컷오프와 시맨틱 스냅샷의 다이제스트다. 다른 컷오프를 주면
  // 같은 날에 두 번째 governance.analysis_information_set 행이 생기고, 계보가
  // 잡 목록이 된다.
  assert.match(wrapper, /run-k4-valuation-band\.ts --live --cutoff "\$K4_CANARY_CUTOFF"/);
});

test('the reason for the ordering is recorded next to it', () => {
  // Without this, the next person tidying the file has no way to know the order
  // is load-bearing and will sort the steps back together.
  assert.match(wrapper, /runs before report publishing on purpose/);
  assert.match(wrapper, /Neither reads what the other writes/);
});
