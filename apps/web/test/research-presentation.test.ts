import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  presentResearchSummary,
  sourceAttributionLabel,
  themeTitleLabel,
} from '../src/pages/research-workspace/model/presentation.ts';

describe('research presentation copy', () => {
  it('removes internal relation and hierarchy codes while preserving the investment thesis', () => {
    assert.equal(
      presentResearchSummary(
        '계층 2/2/1/0. SEC Companyfacts XBRL 재무 모멘텀 +37.9%. R/R 4.17. related_ticker:US:NVDA → US:AMD',
      ),
      'SEC 공시 재무 모멘텀 +37.9%.',
    );
    assert.equal(
      presentResearchSummary(
        '로컬 계층 신뢰1/촉매2. AI 데이터센터 전력 CAPEX 사이클 수혜. related_ticker:KR:005380 → KR:267260',
      ),
      'AI 데이터센터 전력 CAPEX 사이클 수혜.',
    );
    assert.equal(
      presentResearchSummary(
        '계층정렬 데이터신뢰 2·촉매 2와 fresh GraphRAG에서 공급망 변화가 근거이며이다. 기대 손익비 3.25.',
      ),
      '최근 관계 분석에서 공급망 변화가 근거입니다.',
    );
  });

  it('translates source jargon and normalizes whitespace without inventing claims', () => {
    assert.equal(
      presentResearchSummary(
        'SEC segment Compute & Networking +88%지만 news-bullish 2채널이 확인됨.  R/R 2.86.',
      ),
      'SEC 사업부 공시의 Compute & Networking +88%지만 긍정 뉴스 2개 출처가 확인됨.',
    );
    assert.equal(
      presentResearchSummary('이벤트 갭은 추격하지 않는다. R/R 2.17이다.'),
      '이벤트 갭은 가격 부담을 함께 확인한다.',
    );
    assert.equal(
      presentResearchSummary('재무 흐름을 확인합니다. 진입구간 중간값 기준 R/R 2.00.'),
      '재무 흐름을 확인합니다.',
    );
    assert.equal(
      presentResearchSummary('첫 문장. 눌림과 SOXX 동행 시 승격하며 R/R 1.77이다.'),
      '첫 문장.',
    );
    assert.equal(presentResearchSummary('첫 문장. 공식 흐름을 확인했고 R/R 1.25다.'), '첫 문장.');
    assert.equal(
      presentResearchSummary(
        '계층정렬 데이터신뢰 2·촉매 2이며 fresh GraphRAG AI 흐름을 확인했고다.',
      ),
      '최근 관계 분석 AI 흐름을 확인했습니다.',
    );
    assert.equal(
      presentResearchSummary('3-A 계층정렬 최상단이고 SEC XBRL/세그먼트 매출 흐름을 확인했다.'),
      'SEC 공시 매출 흐름을 확인했다.',
    );
    assert.equal(
      presentResearchSummary('SEC XBRL 재무 모멘텀은 강하지만 현재는 추격 구간이다.'),
      'SEC 공시 재무 모멘텀은 강하지만 현재는 가격 부담을 확인할 구간이다.',
    );
    assert.equal(
      presentResearchSummary('전일 관심구간을 상회해 추격을 피한다.'),
      '전일 관심구간을 상회해 가격 부담을 함께 확인한다.',
    );
    assert.equal(
      presentResearchSummary(
        '현재가가 기존 목표 225달러에 접근해 감시로 강등했다. 눌림 지지 시 승격합니다.',
      ),
      '현재가가 기존 확인 기준에 접근해 추가 확인이 필요하다. 눌림 지지 시 다시 확인합니다.',
    );
    assert.equal(
      presentResearchSummary('전일 목표 155달러를 넘었지만 변동이 컸다.'),
      '전일 확인 기준을 넘었지만 변동이 컸다.',
    );
  });

  it('maps source identifiers without hiding real publisher names', () => {
    assert.equal(sourceAttributionLabel('stock_candidate'), '종목 후보 분석');
    assert.equal(sourceAttributionLabel('Reuters'), 'Reuters');
    assert.equal(sourceAttributionLabel('opaque_source_v2'), '리서치 출처');
  });

  it('presents theme keys as readable labels without leaking snake_case identifiers', () => {
    assert.equal(themeTitleLabel('ai_semi'), 'AI 반도체');
    assert.equal(themeTitleLabel('megacap_ai'), '대형 AI 기업');
    assert.equal(themeTitleLabel('electronic_components'), '전자부품');
    assert.equal(themeTitleLabel('unknown_theme'), 'Unknown Theme');
    assert.equal(themeTitleLabel('로봇·산업자동화'), '로봇·산업자동화');
  });
});
