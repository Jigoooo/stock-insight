import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { containsActionAdvice } from '../src/shared/action-advice.ts';

// run-report-publish.ts and run-event-brief.ts both carried a comment saying they
// reused the production action-advice gate while actually running a hand-rolled
// copy that matched bare 매수/매도/추격/익절. On 2026-08-03 that copy failed the
// whole analytics pipeline on the headline "최태원, 하이닉스 주식 48억 매수" — a
// chairman's disclosed purchase of his own company's stock, which is exactly the
// kind of signal this product exists to surface.
//
// Because report publishing runs before v2 graph publishing in the wrapper, that
// one headline also blocked every impact path from reaching the product.

const publishers = ['run-report-publish.ts', 'run-event-brief.ts'].map((name) => ({
  name,
  source: readFileSync(new URL(`../src/publish/${name}`, import.meta.url).pathname, 'utf8'),
}));

for (const { name, source } of publishers) {
  test(`${name} calls the shared gate instead of restating it`, () => {
    assert.match(
      source,
      /import \{ containsActionAdvice \} from '\.\.\/shared\/action-advice\.ts'/,
    );
    assert.match(source, /containsActionAdvice\(/);
    // A local regex naming these tokens is the copy that drifted; the canonical
    // gate matches 매수/매도 only when an advice form follows.
    assert.doesNotMatch(source, /const ACTION_ADVICE_PATTERN/);
    assert.doesNotMatch(source, /매수\|매도\|사세요/);
  });
}

test('advice is still blocked', () => {
  for (const text of [
    '지금 매수하세요',
    '삼성전자 매도 추천',
    '매수 타이밍입니다',
    'HD현대중공업 iM증권 목표가 860000 Buy',
    '손절가 70000 설정',
    'strong buy now',
    'sell recommendation',
    'take-profit 설정',
  ]) {
    assert.equal(containsActionAdvice(text), true, `should block: ${text}`);
  }
});

test('reported market activity is not advice', () => {
  // Each of these was blocked by the hand-rolled copy.
  for (const text of [
    '최태원, 하이닉스 주식 48억 매수',
    '[속보] 코스피 이어 코스닥도 매도 사이드카',
    '일본 “미국과 ‘엔화매수’ 공동개입” 공식 발표',
    '삼성전기 임원 순매수 14,851,645주',
    'Broadcom 내부자 순매도 1,544,638주',
    '아마존, 2028년 위성 모바일 서비스 추진…스타링크 추격',
  ]) {
    assert.equal(containsActionAdvice(text), false, `should pass: ${text}`);
  }
});

test('a disclaimer does not trip the gate against itself', () => {
  // shared/action-advice.ts strips safe-boundary wording before testing, which is
  // why the product's own "매수·매도 지시 없이" copy can be published.
  assert.equal(containsActionAdvice('매수·매도 지시 없이 맥락을 연결합니다.'), false);
});
