import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkNumericalConsistency,
  reconcileClaimType,
  verifyAssertionSemantics,
} from '../src/ingest/assertion-semantics.ts';

describe('P0-2 assertion semantic verifier', () => {
  it('accepts a plain affirmed factual sentence', () => {
    const verdict = verifyAssertionSemantics({
      quote: '삼성전자가 테일러 공장에 파운드리 라인을 증설했다.',
    });
    assert.equal(verdict.decision, 'accept');
    assert.equal(verdict.polarity, 1);
    assert.equal(verdict.modality, 'factual');
  });

  it('quarantines negated sentences (KR and EN)', () => {
    for (const quote of [
      'A사는 B사와 계약을 체결하지 않았다.',
      'The company denied reports of the acquisition.',
      '양사는 합병 논의를 철회했다.',
    ]) {
      const verdict = verifyAssertionSemantics({ quote });
      assert.equal(verdict.decision, 'quarantine', quote);
    }
  });

  it('quarantines corrections and retractions', () => {
    const verdict = verifyAssertionSemantics({
      quote: '회사 측은 앞선 공시를 정정한다고 밝혔다.',
    });
    assert.equal(verdict.decision, 'quarantine');
    assert.ok(verdict.reasons.includes('correction_or_retraction_language'));
  });

  it('downgrades planned/possible/forecast/attributed statements instead of accepting as fact', () => {
    const planned = verifyAssertionSemantics({ quote: 'A사는 미국 공장 증설을 추진할 계획이다.' });
    assert.equal(planned.decision, 'accept_downgraded');
    assert.equal(planned.modality, 'planned');

    const possible = verifyAssertionSemantics({ quote: 'A사가 B사 인수를 검토 중인 것으로 알려졌다.' });
    assert.equal(possible.decision, 'accept_downgraded');
    assert.notEqual(possible.modality, 'factual');

    const forecast = verifyAssertionSemantics({ quote: '증권가는 내년 영업이익이 개선될 것으로 전망했다.' });
    assert.equal(forecast.decision, 'accept_downgraded');
    assert.equal(forecast.modality, 'forecast');

    const attributed = verifyAssertionSemantics({ quote: '회사 관계자는 수주가 확정됐다고 말했다.' });
    assert.equal(attributed.decision, 'accept_downgraded');
    assert.equal(attributed.attributed, true);
  });

  it('flags conditional clauses', () => {
    const verdict = verifyAssertionSemantics({
      quote: '규제 당국의 승인 시 계약이 발효된다.',
    });
    assert.equal(verdict.decision, 'accept_downgraded');
    assert.equal(verdict.conditional, true);
  });

  it('quarantines numeric mismatch between claim value and quote', () => {
    const verdict = verifyAssertionSemantics({
      quote: '계약 규모는 1,200억원이다.',
      claimedValueText: '계약 규모 1,500억원',
    });
    assert.equal(verdict.decision, 'quarantine');
    assert.ok(verdict.reasons.includes('numeric_mismatch_with_quote'));
  });

  it('accepts matching numbers with comma normalization', () => {
    assert.equal(checkNumericalConsistency('매출 1,200억원 기록', '1200억원'), true);
    assert.equal(checkNumericalConsistency('매출 1,200억원 기록', '1300'), false);
    assert.equal(checkNumericalConsistency('숫자 없는 인용', '숫자 없는 값'), true);
  });

  it('quarantines disclaimer/advertisement sections regardless of content', () => {
    const verdict = verifyAssertionSemantics({
      quote: 'A사가 B사에 부품을 공급한다.',
      documentSectionType: 'disclaimer',
    });
    assert.equal(verdict.decision, 'quarantine');
  });

  it('reconciles claim types from modality', () => {
    const forecast = verifyAssertionSemantics({ quote: '실적이 개선될 것으로 전망된다.' });
    assert.equal(reconcileClaimType('asserted_fact', forecast), 'forecast');

    const attributed = verifyAssertionSemantics({ quote: '회사는 계약을 체결했다고 밝혔다.' });
    assert.equal(reconcileClaimType('asserted_fact', attributed), 'reported_claim');

    const plain = verifyAssertionSemantics({ quote: 'A사가 신제품을 출시했다.' });
    assert.equal(reconcileClaimType('asserted_fact', plain), 'asserted_fact');
  });
});
