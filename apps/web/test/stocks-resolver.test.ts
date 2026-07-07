import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDiscoverStocksForDashboard } from '../src/pages/dashboard/model/resolve-discover-stocks.ts';
import {
  resolveStockDetailForDashboard,
  resolveStockListForDashboard,
} from '../src/pages/dashboard/model/resolve-stocks.ts';
import type {
  DashboardStock,
  DiscoverStocksResponse,
  StockDetailResponse,
  StockListResponse,
} from '@stock-insight/contracts';

const fallbackStock: DashboardStock = {
  id: 'samsung-electronics',
  holding: true,
  ticker: '005930',
  name: '삼성전자',
  logo: 'SEC',
  theme: '메모리 · 파운드리 · 모바일',
  price: '₩78,400',
  change: '+3.6%',
  stance: '관찰',
  summary: '기존 목업 기업 개요 fallback',
  founded: '1969',
  hq: '경기 수원',
  capital: '8,975억',
  shares: '5.97B주',
  marketCap: '468조',
  sales: '300조',
  operatingProfit: '36조',
  debtRatio: '28%',
  roe: '9.6%',
  segments: [['DS/반도체', 38]],
  shareholders: [['외국인', 55]],
  history: [['1969', '삼성전자공업 설립']],
  positives: ['메모리 업황 회복 시 실적 회복 탄력'],
  risks: ['HBM 경쟁력 회복 속도 불확실'],
  review: ['2026.02.21', '메모리 업황 회복 기대 형성', '방어적 진입은 무난했지만 촉매 확인은 부족'],
};

const liveStockListResponse: StockListResponse = {
  meta: { source: 'database', generatedAt: '2026-07-06T00:00:00.000Z' },
  availability: 'available',
  error: null,
  data: [
    {
      entityKey: 'KR:005930',
      ticker: '005930',
      market: 'KR',
      name: '삼성전자',
      displayName: '삼성전자 · 005930',
      isWatched: true,
      isHolding: false,
      latestPrice: 81200,
      currency: 'KRW',
      changePct: 1.25,
      primaryThesis: 'AI 메모리 노출 50.8점, 펀더멘털 우호.',
      confidence: 'medium',
      analysisStatus: 'cached',
      lastAnalyzedAt: '2026-07-05T12:00:00.000Z',
    },
  ],
};

const liveDiscoverStocksResponse: DiscoverStocksResponse = {
  meta: { source: 'database', generatedAt: '2026-07-06T00:00:00.000Z' },
  availability: 'available',
  error: null,
  data: [
    {
      entityKey: 'KR:005380',
      ticker: '005380',
      market: 'KR',
      name: '현대차',
      reasonType: 'market_candidate',
      reasonTitle: '시장 모멘텀 후보',
      reasonSummary: '폭락장 방어 후 반등 후보.',
      confidence: 'medium',
      topRisks: ['환율 변동성'],
      checkpoints: ['거래량 동반 회복'],
      sourceCount: 1,
      sources: [{ label: 'example.com', url: 'https://example.com/hyundai' }],
      canStartAnalysis: true,
      analysisStatus: 'none',
    },
  ],
};

describe('resolveDiscoverStocksForDashboard', () => {
  it('preserves discover availability and candidates from the dedicated response', () => {
    const resolved = resolveDiscoverStocksForDashboard(liveDiscoverStocksResponse);

    assert.equal(resolved.isLiveData, true);
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'available');
    assert.equal(resolved.candidates[0]?.name, '현대차');
  });

  it('keeps response-level quality state even when discover data is not live', () => {
    const staleResponse: DiscoverStocksResponse = {
      ...liveDiscoverStocksResponse,
      meta: { source: 'fallback', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'stale',
      data: [],
    };

    const resolved = resolveDiscoverStocksForDashboard(staleResponse);

    assert.equal(resolved.isLiveData, false);
    assert.equal(resolved.source, 'fallback');
    assert.equal(resolved.availability, 'stale');
    assert.deepEqual(resolved.candidates, []);
  });
});

describe('resolveStockListForDashboard', () => {
  it('uses the dedicated stock list response instead of dashboard bootstrap stocks when database data is available', () => {
    const resolved = resolveStockListForDashboard(liveStockListResponse, [fallbackStock]);

    assert.equal(resolved.isLiveData, true);
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'available');
    assert.equal(resolved.stocks.length, 1);
    assert.equal(resolved.stocks[0]?.id, 'kr-005930');
    assert.equal(resolved.stocks[0]?.entityKey, 'KR:005930');
    assert.equal(resolved.stocks[0]?.price, '₩81,200');
    assert.equal(resolved.stocks[0]?.change, '+1.25%');
    assert.equal(resolved.stocks[0]?.holding, false);
    assert.equal(resolved.stocks[0]?.summary, 'AI 메모리 노출 50.8점, 펀더멘털 우호.');
    assert.equal(resolved.stocks[0]?.theme, 'AI 메모리 노출 50.8점, 펀더멘털 우호.');
    assert.equal(resolved.stocks[0]?.founded, '구조화 수집중');
    assert.equal(resolved.stocks[0]?.capital, '출처 수집중');
    assert.deepEqual(resolved.stocks[0]?.segments, []);
    assert.deepEqual(resolved.stocks[0]?.risks, ['리스크 구조화 수집중']);
    assert.notEqual(resolved.stocks[0]?.summary, fallbackStock.summary);
    assert.deepEqual(resolved.stocks[0]?.review, [
      '심층 리포트 보유',
      '2026.07.05 갱신',
      '조회 전용 리서치 데이터이며 주문 기능은 없습니다',
    ]);
  });

  it('keeps local fallback stocks when the dedicated stock loader is not live', () => {
    const collectingResponse: StockListResponse = {
      ...liveStockListResponse,
      meta: { source: 'fallback', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'collecting',
      data: [],
    };

    const resolved = resolveStockListForDashboard(collectingResponse, [fallbackStock]);

    assert.equal(resolved.isLiveData, false);
    assert.equal(resolved.source, 'fallback');
    assert.equal(resolved.availability, 'collecting');
    assert.equal(resolved.stocks[0], fallbackStock);
  });
});

describe('resolveStockDetailForDashboard', () => {
  it('returns dedicated detail data only from an available database detail envelope', () => {
    const detailResponse: StockDetailResponse = {
      meta: { source: 'database', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'available',
      error: null,
      data: {
        stock: liveStockListResponse.data[0]!,
        deepReport: {
          status: 'available',
          reportMarkdown: '## 삼성전자 심층 리포트\n출처 기반 요약입니다.',
          researchedAt: '2026-07-05T12:00:00.000Z',
          sources: [{ label: 'KRX', url: 'https://data.krx.co.kr/' }],
        },
        relatedNews: [
          {
            id: 'feed:101',
            title: '삼성전자 HBM 뉴스',
            context: '관심종목 직접 이슈',
            impact: '중간',
            icon: 'newspaper',
          },
        ],
        risks: ['HBM 경쟁력 확인 필요'],
        checkpoints: ['잠정실적 발표 확인'],
        companyProfile: {
          status: 'text_only',
          symbol: '005930',
          market: 'KR',
          name: '삼성전자',
          sector: '반도체',
          industry: '메모리',
          summaryText: '출처 있는 회사 개요만 표시합니다.',
          sources: [{ label: 'KRX', url: 'https://data.krx.co.kr/' }],
          capturedAt: '2026-07-05T12:00:00.000Z',
        },
        companyMetrics: [
          {
            metricGroup: 'market_snapshot',
            fiscalPeriod: 'latest',
            currency: 'KRW',
            availability: 'available',
            reportedAt: '2026-07-06T00:00:00.000Z',
            sources: [{ label: 'KRX', url: 'https://data.krx.co.kr/' }],
            metrics: [
              { key: 'latestPrice', label: '현재가', value: 81200, unit: 'currency' },
              { key: 'changePct', label: '등락률', value: 1.25, unit: 'percent' },
            ],
          },
        ],
        learningCards: [
          {
            cardKey: 'deep-cache-summary',
            section: '핵심 학습',
            title: 'HBM 수요가 실적 민감도를 키웁니다',
            bodyMarkdown: 'AI 서버 증설과 HBM 공급 계약을 같이 봅니다.',
            bullets: ['HBM 공급', '파운드리 가동률'],
            availability: 'available',
            sources: [{ label: '리서치 캐시', url: 'https://example.com/deep-cache' }],
            updatedAt: '2026-07-06T01:20:00.000Z',
          },
        ],
        glossaryTerms: [
          {
            term: 'HBM',
            definition: 'AI 가속기 주변에 붙는 고대역폭 메모리입니다.',
            sources: [],
          },
        ],
        analysisJob: {
          id: '42',
          status: 'running',
          progressPct: 37.5,
          queuedAt: '2026-07-06T00:00:00.000Z',
          startedAt: '2026-07-06T00:01:00.000Z',
        },
      },
    };

    const resolved = resolveStockDetailForDashboard(detailResponse);

    assert.equal(resolved?.stock.entityKey, 'KR:005930');
    assert.equal(resolved?.deepReport.status, 'available');
    assert.equal(resolved?.relatedNews[0]?.title, '삼성전자 HBM 뉴스');
    assert.equal(resolved?.companyProfile?.summaryText, '출처 있는 회사 개요만 표시합니다.');
    assert.equal(resolved?.companyMetrics?.[0]?.metricGroup, 'market_snapshot');
    assert.equal(resolved?.companyMetrics?.[0]?.metrics[1]?.value, 1.25);
    assert.equal(resolved?.learningCards?.[0]?.cardKey, 'deep-cache-summary');
    assert.equal(resolved?.glossaryTerms?.[0]?.term, 'HBM');
    assert.equal(resolved?.analysisJob?.status, 'running');
  });

  it('does not surface fallback or missing detail envelopes as live detail data', () => {
    const missingResponse: StockDetailResponse = {
      meta: { source: 'fallback', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'missing',
      error: { code: 'STOCK_NOT_FOUND', message: '없음' },
      data: null,
    };

    assert.equal(resolveStockDetailForDashboard(missingResponse), undefined);
    assert.equal(resolveStockDetailForDashboard(undefined), undefined);
  });
});
