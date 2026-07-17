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
      'SEC 공시 재무 모멘텀 +37.9%. 기대 손익비 4.17.',
    );
    assert.equal(
      presentResearchSummary(
        '로컬 계층 신뢰1/촉매2. AI 데이터센터 전력 CAPEX 사이클 수혜. related_ticker:KR:005380 → KR:267260',
      ),
      'AI 데이터센터 전력 CAPEX 사이클 수혜.',
    );
  });

  it('translates source jargon and normalizes whitespace without inventing claims', () => {
    assert.equal(
      presentResearchSummary(
        'SEC segment Compute & Networking +88%지만 news-bullish 2채널이 확인됨.  R/R 2.86.',
      ),
      'SEC 사업부 공시의 Compute & Networking +88%지만 긍정 뉴스 2개 출처가 확인됨. 기대 손익비 2.86.',
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
