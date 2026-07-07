import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stockSchema } from '../src/entities/stock/model/schema.ts';
import {
  buildDataQualitySummary,
  buildEmptyStateCopy,
  buildQualityTestId,
  buildStatusText,
  getAvailabilityLabel,
  getAvailabilityTone,
  getSourceLabel,
  shouldShowDelayedFeedback,
} from '../src/shared/ui/primitives/status.ts';
import { dataAvailabilitySchema } from '@stock-insight/contracts';

describe('shared UI status primitives', () => {
  it('formats source and availability labels consistently for Korean UI badges', () => {
    assert.equal(getSourceLabel('database'), 'DB');
    assert.equal(getSourceLabel('fallback'), 'Fallback');
    assert.equal(getAvailabilityLabel('available'), '사용 가능');
    assert.equal(getAvailabilityLabel('collecting'), '수집 중');
    assert.equal(getAvailabilityLabel('text_only'), '텍스트만');
    assert.equal(getAvailabilityLabel('unsupported'), '지원 안 됨');
    assert.equal(
      buildStatusText({ label: '포트폴리오', source: 'database', availability: 'available' }),
      '포트폴리오 DB · 사용 가능',
    );
    assert.equal(
      buildStatusText({ label: '종목 상세', source: 'database', availability: 'unsupported' }),
      '종목 상세 DB · 지원 안 됨',
    );
  });

  it('maps availability into a restrained semantic tone without relying on emoji', () => {
    assert.equal(getAvailabilityTone('available'), 'success');
    assert.equal(getAvailabilityTone('collecting'), 'neutral');
    assert.equal(getAvailabilityTone('text_only'), 'info');
    assert.equal(getAvailabilityTone('stale'), 'warning');
    assert.equal(getAvailabilityTone('error'), 'danger');
    assert.equal(getAvailabilityTone('missing'), 'muted');
    assert.equal(getAvailabilityTone('unsupported'), 'muted');
  });

  it('explains data quality state with an explicit reason and next action', () => {
    assert.deepEqual(
      buildDataQualitySummary({
        label: '회사 개요',
        source: 'database',
        availability: 'text_only',
        updatedAt: '2026-07-07T00:00:00.000Z',
      }),
      {
        title: '회사 개요 텍스트 기반',
        summary: '원문/리포트에는 있으나 구조화 테이블로 승격 전입니다.',
        nextAction: '출처 있는 구조화 collector가 채워질 때까지 숫자 승격을 보류하세요.',
        sourceLabel: 'DB',
        freshnessLabel: '2026-07-07T00:00:00.000Z',
        tone: 'info',
      },
    );

    assert.deepEqual(
      buildDataQualitySummary({
        label: '종목 상세',
        source: 'database',
        availability: 'unsupported',
      }),
      {
        title: '종목 상세 지원 범위 밖',
        summary: 'KR/US 주식 기본 범위 밖이라 이 화면에서는 구조화하지 않습니다.',
        nextAction: '기본 주식 화면에서는 제외하고 별도 도메인으로 분리하세요.',
        sourceLabel: 'DB',
        freshnessLabel: '갱신시각 없음',
        tone: 'muted',
      },
    );
  });

  it('builds stable quality popover test ids from section labels', () => {
    assert.equal(buildQualityTestId('market-news'), 'market-news-quality-popover');
    assert.equal(buildQualityTestId(' Portfolio Digest '), 'portfolio-digest-quality-popover');
    assert.equal(buildQualityTestId('종목 상세'), 'section-quality-popover');
  });

  it('formats empty states with one reason and one next action', () => {
    assert.deepEqual(
      buildEmptyStateCopy({
        label: '시장 뉴스',
        reason: '선택한 범위에 표시할 뉴스가 아직 수집되지 않았습니다.',
        nextAction: '상단 데이터 품질 상태를 확인하세요.',
      }),
      {
        title: '시장 뉴스 없음',
        reason: '선택한 범위에 표시할 뉴스가 아직 수집되지 않았습니다.',
        nextAction: '상단 데이터 품질 상태를 확인하세요.',
        text: '시장 뉴스 없음 — 선택한 범위에 표시할 뉴스가 아직 수집되지 않았습니다. 다음 행동: 상단 데이터 품질 상태를 확인하세요.',
      },
    );

    assert.equal(
      buildEmptyStateCopy({
        label: '검색 결과',
        reason: '일치하는 종목이 없습니다',
        nextAction: '검색어를 지우세요',
      }).text,
      '검색 결과 없음 — 일치하는 종목이 없습니다. 다음 행동: 검색어를 지우세요.',
    );
  });

  it('keeps unsupported in the shared contract and web stock schema for out-of-scope assets', () => {
    assert.equal(dataAvailabilitySchema.safeParse('unsupported').success, true);

    const parsed = stockSchema.parse({
      id: 'crypto-btc',
      entityKey: 'CRYPTO:BTC',
      dataAvailability: 'unsupported',
      dataSource: 'database',
      holding: false,
      ticker: 'BTC',
      name: 'Bitcoin',
      logo: 'BTC',
      theme: '범위 밖 자산',
      price: '데이터 확인 제한',
      change: '수집 제외',
      stance: '지원 범위 밖',
      summary: 'KR/US 주식 범위 밖이라 주식 리서치 화면에서는 구조화하지 않습니다.',
      founded: '지원 범위 밖',
      hq: '지원 범위 밖',
      capital: '지원 범위 밖',
      shares: '지원 범위 밖',
      marketCap: '지원 범위 밖',
      sales: '지원 범위 밖',
      operatingProfit: '지원 범위 밖',
      debtRatio: '지원 범위 밖',
      roe: '지원 범위 밖',
      segments: [],
      shareholders: [],
      history: [],
      positives: [],
      risks: [],
      review: ['지원 범위 밖', 'KR/US 주식만 기본 지원', '주문 기능 없음'],
    });

    assert.equal(parsed.dataAvailability, 'unsupported');
  });

  it('delays skeleton and loading feedback to prevent sub-300ms flicker', () => {
    assert.equal(shouldShowDelayedFeedback({ active: false, elapsedMs: 500 }), false);
    assert.equal(shouldShowDelayedFeedback({ active: true, elapsedMs: 299 }), false);
    assert.equal(shouldShowDelayedFeedback({ active: true, elapsedMs: 300 }), true);
    assert.equal(shouldShowDelayedFeedback({ active: true, elapsedMs: 500, delayMs: 400 }), true);
    assert.equal(shouldShowDelayedFeedback({ active: true, elapsedMs: 399, delayMs: 400 }), false);
  });
});
