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

  it('catches the fuller Korean spelling of target price, not only the abbreviation', () => {
    // 2026-08-11 라이브 학습 카드 불릿이 이 철자로 게이트를 통과했다.
    assert.equal(containsActionAdvice('목표주가 평균 약 748,755원'), true);
    assert.equal(containsActionAdvice('목표 주가 860000'), true);
    assert.equal(containsActionAdvice('목표가 100000원'), true);
    // 사건 제목에 흔한 매매 기록은 여전히 지나간다 — 이 변경은 그 축을 건드리지 않는다.
    assert.equal(containsActionAdvice('삼성전기 임원 순매수 14,851,645주'), false);
  });

  it('catches the four report vocabularies that used to walk past the gate', () => {
    // 2026-08-11 2차 확장. 라이브가 이 철자들에서 깨끗한 것은 데이터의 우연이라
    // 각 패턴을 케이스로 못박는다.
    assert.equal(containsActionAdvice('적정주가 56000원 제시'), true);
    assert.equal(containsActionAdvice('적정 주가 56,000'), true);
    assert.equal(containsActionAdvice('현재가 대비 상승여력 50.7%'), true);
    assert.equal(containsActionAdvice('하락 여력 12%'), true);
    assert.equal(containsActionAdvice('투자의견 매수 유지'), true);
    assert.equal(containsActionAdvice('투자의견: 비중확대'), true);
    assert.equal(containsActionAdvice('투자의견 Buy'), true);
    assert.equal(containsActionAdvice('TP 56,000원'), true);
    assert.equal(containsActionAdvice('TP 상향'), true);
    // 질문 형태로 쓴 추천. 라이브 사건 제목에 8건 있었고 CAV 블록4 로 나가고 있었다.
    assert.equal(containsActionAdvice('Should You Buy Lockheed Martin After Its Q2 Rally?'), true);
    assert.equal(containsActionAdvice('Netflix Is Sinking — Should You Buy the Dip?'), true);
    assert.equal(containsActionAdvice('Should you sell ARM stock?'), true);
    // 감수한 무딤을 기록해 둔다. `적정가치` 는 중립적 개념어로도 쓰이지만 붙여 쓴
    // `적정가` 가 그 앞부분을 문다. 라이브 용례 0건이고, 문맥으로 가르려 들면
    // 이 파일 첫 주석이 경고한 "영리한 게이트" 가 된다.
    assert.equal(containsActionAdvice('기업의 적정가치 산정 방법'), true);
  });

  it('lets a space between 목표/적정 and an ordinary noun through', () => {
    // 2026-08-12 회귀. 패턴이 `(?:목표|적정)\s*주?가` 였을 때 `주` 가 선택적인데
    // 공백은 허용돼서, `목표`/`적정` 뒤에 오는 **가로 시작하는 아무 낱말이나** 물었다.
    //
    // 라이브 반증: source_documents id=52181 `AI 에이전트의 적정 가격은 얼마인가?
    // 합의점 부재로 인한 혼란` (rss_news). AI 과금 모델 보도인데 차단됐다.
    // containsActionAdvice 는 뉴스 읽기 모델 여럿이 공유하므로 그 기사가 조용히
    // 사라진다 — 2026-08-03 회귀와 같은 종류의 대가다.
    //
    // 이제 공백은 `주` 가 붙을 때만 허용한다. 아래 다섯은 전부 지나가야 한다.
    assert.equal(containsActionAdvice('AI 에이전트의 적정 가격은 얼마인가'), false);
    assert.equal(containsActionAdvice('적정 가치 평가 방법론'), false);
    assert.equal(containsActionAdvice('공장 적정 가동률 회복'), false);
    assert.equal(containsActionAdvice('목표 가운데 하나를 먼저 달성했다'), false);
    assert.equal(containsActionAdvice('중장기 목표 가격대를 논의했다'), false);

    // 그리고 막아야 하는 여섯 철자는 그대로 막힌다 — 좁힘이 게이트를 약하게
    // 만들지 않았다는 반대 방향 단언이다.
    for (const blocked of [
      '목표주가 상향',
      '목표 주가 조정',
      '적정주가 5만원',
      '적정 주가 제시',
      '목표가 74만원',
      '적정가 산정',
    ]) {
      assert.equal(containsActionAdvice(blocked), true, blocked);
    }
  });

  it('does not read plain market description as a recommendation', () => {
    // 여기 다섯 문장은 전부 라이브에 실재하거나 그 꼴을 그대로 본뜬 것이다.
    // 하나라도 막히면 이 확장은 사실을 지운 것이 된다.
    assert.equal(
      containsActionAdvice(
        '국내 조선 3사가 액화천연가스(LNG) 운반선과 같은 고부가가치 선박 비중 확대로 2분기 호실적을 기록하자',
      ),
      false,
    );
    assert.equal(containsActionAdvice('POSCO홀딩스 메리츠증권 투자의견없음'), false);
    assert.equal(containsActionAdvice('외국인 매수세 유입으로 지수가 상승했다'), false);
    assert.equal(containsActionAdvice('MSCI 지수 편입 비중 확대'), false);
    assert.equal(containsActionAdvice('TP-Link 공유기 보안 취약점 공개'), false);
    // 공시된 매매 사실. 2026-08-03 에 이 구별을 잃고 파이프라인 전체가 멈췄다.
    assert.equal(
      containsActionAdvice('최태원, SK하이닉스 주식 장내매수…48억원어치 산 이유'),
      false,
    );
    assert.equal(
      containsActionAdvice('Cathie Wood’s ARK Buys More Coinbase, Circle And Bullish Shares'),
      false,
    );
  });

  it('filters only unsafe action-advice snippets from lists', () => {
    assert.deepEqual(
      filterActionSafeTexts(['실적 발표 확인', '목표가 100000원', '메모리 가격 변동성']),
      ['실적 발표 확인', '메모리 가격 변동성'],
    );
  });
});
