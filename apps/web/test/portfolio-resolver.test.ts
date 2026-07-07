import assert from 'node:assert/strict';
import process from 'node:process';
import { describe, it } from 'node:test';

import { loadPortfolioDigestResponse } from '../src/pages/dashboard/model/load-portfolio-digest-response.ts';
import { resolvePortfolioDigest } from '../src/pages/dashboard/model/resolve-portfolio-digest.ts';
import { resolvePortfolioForDashboard } from '../src/pages/dashboard/model/resolve-portfolio.ts';
import type { MeBootstrapResponse, PortfolioDigestResponse } from '@stock-insight/contracts';

const fallbackPortfolio = {
  value: 'fallback-value',
  dailyChange: 'fallback-change',
  relatedIssueCount: 0,
  focusTheme: 'fallback-theme',
  scheduleCount: 0,
  cautionLevel: '낮음' as const,
  bars: [10, 20, 30],
  trend: [{ label: 'fallback', value: 10 }],
  themeShare: [{ id: 'fallback', label: 'fallback', value: 100, colorRole: 'reserve' as const }],
};

const liveMeBootstrapResponse: MeBootstrapResponse = {
  meta: { source: 'database', generatedAt: '2026-07-07T00:00:00.000Z' },
  availability: 'available',
  error: null,
  data: {
    user: { id: 'default', label: '기본 사용자' },
    watchlist: [
      {
        entityKey: 'KR:005930',
        ticker: '005930',
        market: 'KR',
        displayName: '삼성전자',
        source: 'manual',
      },
      {
        entityKey: 'US:NVDA',
        ticker: 'NVDA',
        market: 'US',
        displayName: 'NVIDIA',
        source: 'manual',
      },
    ],
    positions: [
      {
        entityKey: 'KR:005930',
        ticker: '005930',
        market: 'KR',
        displayName: '삼성전자',
        avgPrice: 81200,
        quantity: 3,
        status: 'open',
        source: 'manual',
      },
      {
        entityKey: 'US:TSLA',
        ticker: 'TSLA',
        market: 'US',
        displayName: 'Tesla',
        status: 'open',
        source: 'manual',
      },
    ],
    preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
  },
};

describe('resolvePortfolioForDashboard', () => {
  it('derives a portfolio snapshot from the dedicated me bootstrap loader when database data is available', () => {
    const resolved = resolvePortfolioForDashboard(liveMeBootstrapResponse, fallbackPortfolio);

    assert.equal(resolved.isLiveData, true);
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'available');
    assert.equal(resolved.portfolio.value, '보유종목 2개 · 관심 2개');
    assert.equal(resolved.portfolio.dailyChange, '수동 입력 1/2개 가격·수량 확인 · 주문 기능 없음');
    assert.equal(resolved.portfolio.relatedIssueCount, 3);
    assert.equal(resolved.portfolio.focusTheme, 'KR 1 · US 2');
    assert.equal(resolved.portfolio.scheduleCount, 2);
    assert.equal(resolved.portfolio.cautionLevel, '중간');
    assert.deepEqual(resolved.portfolio.themeShare, [
      { id: 'market-kr', label: 'KR', value: 33, colorRole: 'semiconductor' },
      { id: 'market-us', label: 'US', value: 67, colorRole: 'platform' },
    ]);
    assert.deepEqual(resolved.portfolio.trend, fallbackPortfolio.trend);
  });

  it('keeps the local fallback portfolio when the me bootstrap loader is not live', () => {
    const collectingResponse: MeBootstrapResponse = {
      ...liveMeBootstrapResponse,
      meta: { source: 'fallback', generatedAt: '2026-07-07T00:00:00.000Z' },
      availability: 'collecting',
      data: { ...liveMeBootstrapResponse.data, watchlist: [], positions: [] },
    };

    const resolved = resolvePortfolioForDashboard(collectingResponse, fallbackPortfolio);

    assert.equal(resolved.isLiveData, false);
    assert.equal(resolved.source, 'fallback');
    assert.equal(resolved.availability, 'collecting');
    assert.equal(resolved.portfolio, fallbackPortfolio);
  });
  it('normalizes rounded market shares to exactly 100 percent for display', () => {
    const response: MeBootstrapResponse = {
      ...liveMeBootstrapResponse,
      data: {
        ...liveMeBootstrapResponse.data,
        watchlist: [
          ...liveMeBootstrapResponse.data.watchlist,
          {
            entityKey: 'KR:005380',
            ticker: '005380',
            market: 'KR',
            displayName: '현대차',
            source: 'manual',
          },
          {
            entityKey: 'US:PLTR',
            ticker: 'PLTR',
            market: 'US',
            displayName: 'Palantir',
            source: 'manual',
          },
          {
            entityKey: 'US:TSLA',
            ticker: 'TSLA',
            market: 'US',
            displayName: 'Tesla',
            source: 'manual',
          },
        ],
        positions: [],
      },
    };

    const resolved = resolvePortfolioForDashboard(response, fallbackPortfolio);
    const shareSum = resolved.portfolio.themeShare.reduce((sum, item) => sum + item.value, 0);

    assert.equal(shareSum, 100);
    assert.deepEqual(
      resolved.portfolio.themeShare.map((item) => `${item.label} ${item.value}%`),
      ['KR 40%', 'US 60%'],
    );
  });
});

describe('resolvePortfolioDigest', () => {
  const digestResponse: PortfolioDigestResponse = {
    meta: { source: 'database', generatedAt: '2026-07-07T00:00:00.000Z' },
    availability: 'available',
    error: null,
    data: {
      alerts: [
        {
          id: 'feed:580',
          title: '삼성전자 변화 후보',
          summary: '직접 feed 변화',
          severity: 'medium',
          reason: 'feed_change',
          entityKey: 'KR:005930',
          market: 'KR',
        },
      ],
      exposures: [
        {
          id: 'market-kr',
          label: 'KR',
          kind: 'market',
          value: 100,
          itemCount: 1,
          riskLevel: 'medium',
          summary: 'KR 노출 1개',
        },
      ],
      freshness: [
        {
          id: 'feed',
          label: '개인화 피드',
          status: 'available',
          ageHours: 12,
          summary: '최근 12시간 내 갱신',
        },
      ],
      stats: {
        watchlistCount: 1,
        positionCount: 0,
        alertCount: 1,
        changeEventCount: 0,
        freshnessRiskCount: 0,
        nonStockFilteredCount: 0,
      },
    },
  };

  it('uses database portfolio digest when available', () => {
    const resolved = resolvePortfolioDigest(digestResponse);

    assert.equal(resolved.isLiveData, true);
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'available');
    assert.equal(resolved.digest.alerts[0]?.reason, 'feed_change');
    assert.equal(resolved.digest.stats.nonStockFilteredCount, 0);
  });

  it('keeps an empty digest when loader is not live', () => {
    const resolved = resolvePortfolioDigest({
      ...digestResponse,
      meta: { source: 'fallback', generatedAt: '2026-07-07T00:00:00.000Z' },
      availability: 'collecting',
      data: { ...digestResponse.data, alerts: [], exposures: [], freshness: [] },
    });

    assert.equal(resolved.isLiveData, false);
    assert.equal(resolved.source, 'fallback');
    assert.deepEqual(resolved.digest.alerts, []);
  });

  it('uses an absolute API base URL for server-side portfolio digest loading', async () => {
    const previousBaseUrl = process.env.STOCK_INSIGHT_API_BASE_URL;
    process.env.STOCK_INSIGHT_API_BASE_URL = 'http://127.0.0.1:6127/';
    const requestedUrls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify(digestResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    try {
      const response = await loadPortfolioDigestResponse(fetcher);

      assert.equal(response?.availability, 'available');
      assert.deepEqual(requestedUrls, ['http://127.0.0.1:6127/api/portfolio/digest']);
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.STOCK_INSIGHT_API_BASE_URL;
      } else {
        process.env.STOCK_INSIGHT_API_BASE_URL = previousBaseUrl;
      }
    }
  });
});
