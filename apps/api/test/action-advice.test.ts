import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  actionSafeText,
  containsActionAdvice,
  filterActionSafeTexts,
} from '../src/shared/action-advice.ts';

describe('action-advice read-model guard', () => {
  it('allows explicit read-only boundary wording without treating it as advice', () => {
    assert.equal(containsActionAdvice('조회 전용 리서치 데이터이며 주문 기능은 없습니다'), false);
    assert.equal(containsActionAdvice('주문·브로커 연결은 없습니다'), false);
    assert.equal(containsActionAdvice('매수·매도 지시 없음'), false);
  });

  it('catches direct imperative buy/sell wording in Korean and English', () => {
    assert.equal(containsActionAdvice('삼성전자 매수하세요'), true);
    assert.equal(containsActionAdvice('삼성전자 매도하세요'), true);
    assert.equal(containsActionAdvice('buy now before earnings'), true);
    assert.equal(containsActionAdvice('sell now after the spike'), true);
  });

  it('does not let safe boundary wording whitelist adjacent buy/sell advice', () => {
    assert.equal(containsActionAdvice('조회 전용 안내입니다. 지금 사세요'), true);
    assert.equal(containsActionAdvice('주문 기능 없음. 목표가 100000원'), true);
    assert.equal(actionSafeText('매수·매도 지시 없음. 손절가 70000원'), undefined);
  });

  it('filters only unsafe action-advice snippets from lists', () => {
    assert.deepEqual(
      filterActionSafeTexts(['실적 발표 확인', '목표가 100000원', '메모리 가격 변동성']),
      ['실적 발표 확인', '메모리 가격 변동성'],
    );
  });
});
