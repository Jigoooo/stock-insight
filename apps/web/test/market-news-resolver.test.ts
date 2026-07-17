import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveMarketNewsInsights } from '../src/pages/dashboard/model/resolve-market-news-insights.ts';
import type { MarketNewsResponse } from '@stock-insight/contracts';

const fallbackInsights = [
  {
    id: 'fallback-news',
    title: 'Fallback watchlist news',
    context: '기존 dashboard insight fallback',
    impact: '중간' as const,
    icon: 'newspaper' as const,
  },
];

const liveMarketNewsResponse: MarketNewsResponse = {
  meta: { source: 'database', generatedAt: '2026-07-06T00:00:00.000Z' },
  availability: 'available',
  error: null,
  data: [
    {
      id: 'news-positive',
      market: 'KR',
      title: '전력 인프라 수주 확대',
      summary: '변압기와 전력기기 수주가 늘며 관련 종목 관심이 커졌습니다.',
      sourceName: '리서치 피드',
      affectedEntities: [
        {
          entityKey: 'KR:267260',
          ticker: '267260',
          name: 'HD현대일렉트릭',
          market: 'KRX',
        },
      ],
      polarity: 'positive',
      magnitude: 0.82,
    },
    {
      id: 'news-negative',
      market: 'US',
      title: 'AI 서버 지연 리스크',
      affectedEntities: [],
      polarity: 'negative',
      magnitude: 0.41,
    },
  ],
};

describe('resolveMarketNewsInsights', () => {
  it('maps available database market news to market insight cards', () => {
    const resolved = resolveMarketNewsInsights(liveMarketNewsResponse, fallbackInsights);

    assert.equal(resolved.isLiveData, true);
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'available');
    assert.equal(resolved.insights.length, 2);
    assert.deepEqual(resolved.insights[0], {
      id: 'market-news-news-positive',
      title: '전력 인프라 수주 확대',
      context:
        'KR · 리서치 피드 · HD현대일렉트릭 · 변압기와 전력기기 수주가 늘며 관련 종목 관심이 커졌습니다.',
      impact: '높음',
      icon: 'bolt',
    });
    assert.equal(resolved.insights[1]?.impact, '중간');
    assert.equal(resolved.insights[1]?.icon, 'triangle-alert');
  });

  it('keeps fallback insights when market news loader has no live database data', () => {
    const collectingResponse: MarketNewsResponse = {
      ...liveMarketNewsResponse,
      meta: { source: 'fallback', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'collecting',
      data: [],
    };

    const resolved = resolveMarketNewsInsights(collectingResponse, fallbackInsights);

    assert.equal(resolved.isLiveData, false);
    assert.equal(resolved.source, 'fallback');
    assert.equal(resolved.availability, 'collecting');
    assert.equal(resolved.insights, fallbackInsights);
  });

  it('does not expose stale database market news as live insight cards', () => {
    const staleResponse: MarketNewsResponse = {
      ...liveMarketNewsResponse,
      availability: 'stale',
    };

    const resolved = resolveMarketNewsInsights(staleResponse, fallbackInsights);

    assert.equal(resolved.isLiveData, false);
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'stale');
    assert.equal(resolved.insights, fallbackInsights);
  });

  it('keeps fallback insights when market news loader failed before returning a response', () => {
    const resolved = resolveMarketNewsInsights(undefined, fallbackInsights);

    assert.equal(resolved.isLiveData, false);
    assert.equal(resolved.source, 'fallback');
    assert.equal(resolved.availability, 'collecting');
    assert.equal(resolved.insights, fallbackInsights);
  });
});
