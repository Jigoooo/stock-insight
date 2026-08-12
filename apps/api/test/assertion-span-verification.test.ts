import assert from 'node:assert/strict';
import test from 'node:test';

import { planSpanVerification } from '../src/knowledge/assertion-span-verification-plan.ts';
import {
  parseSpanVerificationArgs,
  spanVerificationRunId,
} from '../src/knowledge/assertion-span-verification-writer.ts';

/**
 * 픽스처는 라이브에서 그대로 떠온 것이다.
 *
 * 지어낸 문자열로 시험하면 규칙이 통과하는 것만 확인되고, 규칙이 **놓쳐야 하는
 * 것을 놓치는지**는 확인되지 않는다. 오늘 이 저장소에서 그 실수를 이미 한 번
 * 했다 — 블록 10 픽스처가 코드와 같은 잘못된 상태값을 들고 있어서, 그 픽스처가
 * 버그를 탐지에서 보호하고 있었다.
 */
const base = {
  assertionId: 1,
  assertionKey: 'claim:2',
  revisionNo: 1,
  chunkContentHash: 'sha256:live',
  availableAt: '2026-08-01T00:00:00.000Z',
};

test('글자 그대로 있는 인용은 exact 로 올라간다', () => {
  const { plan, skip } = planSpanVerification({
    ...base,
    quotedText: 'Below Expectations',
    chunkContent:
      'Netflix Reported Record Quarterly Revenue But Guidance Came In Below Expectations',
  });
  assert.equal(skip, null);
  assert.equal(plan?.rule, 'exact');
  assert.equal(plan?.nextRevisionNo, 2);
  assert.ok((plan?.matchOffset ?? -1) > 0);
});

test('대소문자만 다른 인용은 case_insensitive 로 올라간다', () => {
  const { plan } = planSpanVerification({
    ...base,
    quotedText: 'SpaceX',
    chunkContent: 'The agreement with spacex was announced on Tuesday.',
  });
  assert.equal(plan?.rule, 'case_insensitive');
});

test('원문에 없는 문구는 올라가지 않는다', () => {
  // 라이브 실측 claim:393. 추출기가 원문에 없는 표현을 만들어냈고, 그것을 잡는
  // 것이 이 검증의 존재 이유다. 이 주장은 extracted 로 남아야 한다.
  const { plan, skip } = planSpanVerification({
    ...base,
    assertionKey: 'claim:393',
    quotedText: '85% returns',
    chunkContent:
      'The Robotic Surgery Leader: Intuitive Surgical Slides Further But One Wall Street Bull Pegs Returns',
  });
  assert.equal(plan, null);
  assert.equal(skip?.reason, 'quote_absent_from_source');
});

test('인용문이 없는 주장은 verified_span 이 되지 않는다', () => {
  // 라이브 실측 claim:421. object_entity_id 만 있고 literal_value 가 null 이다.
  // 대상 회사 이름이 조각에 나온다는 것은 확인할 수 있지만, 그것은 이 주장이
  // 그 조각에 근거한다는 말이 아니다. 같은 상태 이름에 서로 다른 강도의 확인을
  // 섞으면 verified_span 은 아무 뜻도 없어진다.
  const { plan, skip } = planSpanVerification({
    ...base,
    assertionKey: 'claim:421',
    quotedText: null,
    chunkContent: 'This Nvidia change could spell good news for Micron',
  });
  assert.equal(plan, null);
  assert.equal(skip?.reason, 'no_quoted_text');
});

test('빈 인용문은 통과시키지 않는다', () => {
  // indexOf('') 는 0 을 돌려준다. 이 가드가 없으면 검증하지 않은 것이 가장 강한
  // 규칙(exact)으로 통과하고, 매치 위치까지 0 으로 그럴듯하게 기록된다.
  const { plan, skip } = planSpanVerification({
    ...base,
    quotedText: '   ',
    chunkContent: 'anything at all',
  });
  assert.equal(plan, null);
  assert.equal(skip?.reason, 'no_quoted_text');
});

test('조각에 닿지 못하면 인용이 없는 것과 구별해서 센다', () => {
  // REQ-SRC-001. 원문을 못 읽은 것과 인용이 애초에 없는 것은 다른 이야기이고,
  // 한 사유로 합치면 수집 장애가 데이터 부재로 위장된다.
  const { skip } = planSpanVerification({
    ...base,
    quotedText: 'Takeover',
    chunkContent: null,
  });
  assert.equal(skip?.reason, 'chunk_unreachable');
});

test('컷오프 없이는 실행되지 않는다', () => {
  // REQ-PIT-003 — now() 는 업무 기준이 될 수 없다.
  assert.throws(() => parseSpanVerificationArgs(['--apply']), /requires --cutoff/);
  assert.throws(
    () => parseSpanVerificationArgs(['--cutoff', '2026-08-13', '--apply']),
    /canonical ISO timestamp/,
  );
});

test('실행 id 는 컷오프에서 결정된다', () => {
  // 같은 컷오프의 재실행이 같은 id 를 쓰는 것이 옳다 — 원장이 두 번째 실행을
  // 새 관측으로 오해하지 않는다.
  assert.equal(
    spanVerificationRunId('2026-08-13T00:00:00.000Z'),
    'span-verify:2026-08-13T00:00:00.000Z',
  );
});
