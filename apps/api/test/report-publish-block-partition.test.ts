import assert from 'node:assert/strict';
import test from 'node:test';

import { partitionBlocks, type ReportBlock } from '../src/publish/run-report-publish.ts';

/**
 * 픽스처는 2026-08-13 에 실제로 파이프라인을 멈춘 문장이다.
 *
 * 주장 블록 137건 중 1건("카카오 GUIDES — 목표가 하향")이 걸려 682건(주장 137 +
 * 이벤트 545)의 발행을 통째로 막았다. `목표가` 는 CLAUDE.md 제품 경계가 이름으로
 * 금지한 낱말이므로 **게이트 판정 자체는 옳다** — 틀린 것은 실패 방식이었다.
 */
function claim(id: string, text: string): ReportBlock {
  return {
    block_id: id,
    block_type: 'reported_claim',
    text,
    citation_ids: ['cit-1'],
    confidence: 0.5,
  };
}

test('행동 조언 문구가 든 블록은 제외되고 세어진다', () => {
  const result = partitionBlocks([
    claim('watch_claims-1', '한국전력 ANNOUNCED — 어닝쇼크 (asserted_fact)'),
    claim('watch_claims-2', '카카오 GUIDES — 목표가 하향 (guidance)'),
  ]);
  assert.deepEqual(
    result.kept.map((block) => block.block_id),
    ['watch_claims-1'],
  );
  assert.equal(result.excludedForAdvice, 1);
  // 제외는 실패가 아니다. 이것이 이 변경의 전부다 — 1건이 전체를 막지 않는다.
  assert.deepEqual(result.failures, []);
});

test('인용 없는 사실형 블록은 여전히 하드 실패다', () => {
  // 이쪽은 **우리 코드의 결함**이다. 근거 없는 문장이 제품에 실리는 것을
  // 제외로 넘기면, 조립이 틀렸다는 신호가 조용해진다.
  const result = partitionBlocks([
    {
      block_id: 'verified_events-1',
      block_type: 'fact',
      text: '실적 발표',
      citation_ids: [],
      confidence: 1,
    },
  ]);
  assert.equal(result.kept.length, 0);
  assert.equal(result.excludedForAdvice, 0);
  assert.deepEqual(result.failures, ['verified_events-1: fact-type block without citation']);
});

test('공용 게이트가 허용하는 문장은 그대로 실린다', () => {
  // 2026-08-03: 손으로 베낀 게이트가 "최태원, 하이닉스 주식 48억 매수" 에서
  // 파이프라인 전체를 죽였다. 회장의 공시된 자기 회사 주식 매입은 이 제품이
  // 드러내려는 바로 그 신호다. 공용 게이트는 그 경계를 안다 — 이 변경이
  // 탐지기를 건드리지 않았다는 것을 여기서 못 박는다.
  const result = partitionBlocks([
    claim('watch_claims-1', '최태원 ACQUIRED — 하이닉스 주식 48억 매수 (asserted_fact)'),
  ]);
  assert.equal(result.kept.length, 1);
  assert.equal(result.excludedForAdvice, 0);
});

test('전부 제외되면 남는 것이 없다는 사실이 그대로 드러난다', () => {
  // 발행기는 제외 **후** 개수로 빈 발행을 거부한다. 제외 전 개수로 재면
  // 내용이 하나도 없는 리포트가 통과한다.
  const result = partitionBlocks([
    claim('watch_claims-1', '카카오 GUIDES — 목표가 하향 (guidance)'),
  ]);
  assert.equal(result.kept.length, 0);
  assert.equal(result.excludedForAdvice, 1);
});
