import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPostgresDashboardReadModel as createScopedDashboardReadModel,
  getDashboardBootstrap,
  type DashboardRowQueryExecutor,
} from '../src/dashboard/read-model.ts';
import {
  createPostgresDiscoverStocksReadModel as createScopedDiscoverStocksReadModel,
  getDiscoverStocks,
  type DiscoverStocksReadModel,
  type DiscoverStocksRowQueryExecutor,
} from '../src/discover/read-model.ts';
import {
  createPostgresMarketNewsReadModel,
  getMarketNews,
  type MarketNewsReadModel,
  type MarketNewsRowQueryExecutor,
} from '../src/market-news/read-model.ts';
import {
  createPostgresMeBootstrapReadModel,
  getMeBootstrap,
  type MeBootstrapRowQueryExecutor,
  type MeBootstrapReadModel,
} from '../src/me/read-model.ts';
import { getPortfolioDigest, type PortfolioDigestReadModel } from '../src/portfolio/read-model.ts';
import {
  createPostgresStockReadModel as createScopedStockReadModel,
  getStockDetail,
  getStockList,
  type StockReadModel,
  type StockRowQueryExecutor,
} from '../src/stocks/read-model.ts';
import type { DiscoverStockItem, StockDetail, StockListItem } from '@stock-insight/contracts';

const now = new Date('2026-07-06T00:00:00.000Z');
const userScope = { userId: '11111111-1111-4111-8111-111111111111' } as const;

function createPostgresDashboardReadModel(executor: DashboardRowQueryExecutor) {
  return createScopedDashboardReadModel(
    (sql, params) => executor(sql, params.slice(0, -1)),
    userScope,
  );
}

function createPostgresDiscoverStocksReadModel(executor: DiscoverStocksRowQueryExecutor) {
  return createScopedDiscoverStocksReadModel(
    (sql, params) => executor(sql, params.slice(0, -1)),
    userScope,
  );
}

function createPostgresStockReadModel(executor: StockRowQueryExecutor) {
  return createScopedStockReadModel((sql, params) => executor(sql, params.slice(0, -1)), userScope);
}

const stock: StockListItem = {
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
  primaryThesis: '반도체 업황 회복 관찰',
  confidence: 'medium',
  analysisStatus: 'cached',
  lastAnalyzedAt: '2026-07-05T12:00:00.000Z',
};

const detail: StockDetail = {
  stock,
  latestSnapshot: {
    price: 81200,
    currency: 'KRW',
    changePct: 1.25,
    capturedAt: '2026-07-05T12:00:00.000Z',
  },
  deepReport: {
    status: 'available',
    reportMarkdown: '## 삼성전자\n반도체 업황 회복 관찰',
    researchedAt: '2026-07-05T12:00:00.000Z',
    sources: [{ label: '공시', url: 'https://example.com/report' }],
  },
  relatedNews: [],
  risks: ['메모리 가격 변동성'],
  checkpoints: ['실적 발표 확인'],
};

describe('dashboard read model fallback policy', () => {
  it('returns collecting fallback when no dashboard DB model is provided', async () => {
    const response = await getDashboardBootstrap({ now });

    assert.equal(response.availability, 'collecting');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.meta.generatedAt, now.toISOString());
    assert.equal(response.error, null);
    assert.deepEqual(response.data.stocks, []);
  });

  it('returns an error envelope instead of throwing when dashboard read fails', async () => {
    const response = await getDashboardBootstrap({
      now,
      readModel: {
        loadDashboardBootstrap() {
          throw new Error('database unavailable');
        },
      },
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'DASHBOARD_READ_FAILED');
    assert.deepEqual(response.data.stocks, []);
  });
  it('marks dashboard database rows stale when the projection watermark is older than 72 hours', async () => {
    const readModel = createPostgresDashboardReadModel(async () => [
      {
        projection_updated_at: '2026-07-01T00:00:00.000Z',
        stocks: [
          {
            entity_key: 'KR:005930',
            ticker: '005930',
            market: 'KR',
            name: '삼성전자',
          },
        ],
      } as never,
    ]);

    const response = await getDashboardBootstrap({ now, readModel });

    assert.equal(response.availability, 'stale');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.data.stocks[0]?.ticker, '005930');
  });
});

describe('me bootstrap read model fallback policy', () => {
  it('returns collecting fallback when no me DB model is provided', async () => {
    const response = await getMeBootstrap({ now });

    assert.equal(response.availability, 'collecting');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.meta.generatedAt, now.toISOString());
    assert.equal(response.error, null);
    assert.deepEqual(response.data.watchlist, []);
    assert.deepEqual(response.data.positions, []);
  });

  it('returns database me bootstrap when a read model has watchlist rows', async () => {
    const readModel: MeBootstrapReadModel = {
      loadMeBootstrap() {
        return {
          user: { id: 'default', label: '기본 사용자' },
          watchlist: [
            {
              entityKey: 'KR:005930',
              ticker: '005930',
              market: 'KR',
              displayName: '삼성전자',
              source: 'stock_watchlist_sqlite',
              addedAt: '2026-06-07T07:58:39.191Z',
            },
          ],
          positions: [],
          preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
        };
      },
    };

    const response = await getMeBootstrap({ now, readModel });

    assert.equal(response.availability, 'available');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.error, null);
    assert.equal(response.data.watchlist[0]?.entityKey, 'KR:005930');
  });

  it('returns an error envelope instead of throwing when me bootstrap read fails', async () => {
    const response = await getMeBootstrap({
      now,
      readModel: {
        loadMeBootstrap() {
          throw new Error('database unavailable');
        },
      },
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'ME_BOOTSTRAP_READ_FAILED');
    assert.deepEqual(response.data.watchlist, []);
  });
});

describe('portfolio digest read model fallback policy', () => {
  it('returns collecting fallback when no portfolio digest DB model is provided', async () => {
    const response = await getPortfolioDigest({ now });

    assert.equal(response.availability, 'collecting');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.meta.generatedAt, now.toISOString());
    assert.equal(response.error, null);
    assert.deepEqual(response.data.alerts, []);
    assert.deepEqual(response.data.exposures, []);
  });

  it('returns database digest with bounded exposure weights and stock-only filters', async () => {
    const readModel: PortfolioDigestReadModel = {
      loadPortfolioDigest() {
        return {
          alerts: [
            {
              id: 'feed:580',
              title: '삼성전자 실적 확인 필요',
              summary: '관심종목 직접 feed에서 변화를 감지했습니다.',
              severity: 'medium',
              reason: 'feed_change',
              entityKey: 'KR:005930',
              market: 'KR',
              createdAt: '2026-07-06T00:00:00.000Z',
            },
          ],
          exposures: [
            {
              id: 'market-kr',
              label: 'KR',
              kind: 'market',
              value: 60,
              itemCount: 3,
              riskLevel: 'medium',
              summary: 'KR 노출 3개',
            },
            {
              id: 'market-us',
              label: 'US',
              kind: 'market',
              value: 40,
              itemCount: 2,
              riskLevel: 'low',
              summary: 'US 노출 2개',
            },
          ],
          freshness: [
            {
              id: 'feed',
              label: '개인화 피드',
              status: 'available',
              latestAt: '2026-07-06T00:00:00.000Z',
              ageHours: 24,
              summary: '최근 24시간 이내 갱신',
            },
          ],
          stats: {
            watchlistCount: 5,
            positionCount: 0,
            alertCount: 1,
            changeEventCount: 0,
            freshnessRiskCount: 0,
            nonStockFilteredCount: 0,
          },
        };
      },
    };

    const response = await getPortfolioDigest({ now, readModel });
    const exposureTotal = response.data.exposures.reduce((sum, item) => sum + item.value, 0);

    assert.equal(response.availability, 'available');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.error, null);
    assert.equal(response.data.alerts[0]?.reason, 'feed_change');
    assert.equal(Math.round(exposureTotal), 100);
    assert.equal(response.data.stats.nonStockFilteredCount, 0);
  });

  it('filters action-advice alerts before exposing the portfolio digest envelope', async () => {
    const readModel: PortfolioDigestReadModel = {
      loadPortfolioDigest() {
        return {
          alerts: [
            {
              id: 'feed:bad-advice',
              title: '삼성전자 지금 사세요',
              summary: '목표가 100000원, 손절가 70000원',
              severity: 'high',
              reason: 'feed_change',
              entityKey: 'KR:005930',
              market: 'KR',
            },
            {
              id: 'feed:safe',
              title: '삼성전자 실적 확인 필요',
              summary: '잠정실적 발표 전후 변동성 관찰',
              severity: 'medium',
              reason: 'feed_change',
              entityKey: 'KR:005930',
              market: 'KR',
            },
          ],
          exposures: [],
          freshness: [],
          stats: {
            watchlistCount: 1,
            positionCount: 0,
            alertCount: 2,
            changeEventCount: 0,
            freshnessRiskCount: 0,
            nonStockFilteredCount: 0,
          },
        };
      },
    };

    const response = await getPortfolioDigest({ now, readModel });

    assert.deepEqual(
      response.data.alerts.map((item) => item.id),
      ['feed:safe'],
    );
    assert.doesNotMatch(JSON.stringify(response.data), /지금 사세요|목표가|손절가/);
  });

  it('returns an error envelope instead of throwing when portfolio digest read fails', async () => {
    const response = await getPortfolioDigest({
      now,
      readModel: {
        loadPortfolioDigest() {
          throw new Error('database unavailable');
        },
      },
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'PORTFOLIO_DIGEST_READ_FAILED');
    assert.deepEqual(response.data.alerts, []);
  });
});

describe('market news read model fallback policy', () => {
  it('returns collecting fallback when no market news DB model is provided', async () => {
    const response = await getMarketNews({ now });

    assert.equal(response.availability, 'collecting');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.meta.generatedAt, now.toISOString());
    assert.equal(response.error, null);
    assert.deepEqual(response.data, []);
  });

  it('returns database market news when a read model has stock-domain rows', async () => {
    const readModel: MarketNewsReadModel = {
      listMarketNews(query) {
        assert.deepEqual(query, { market: 'KR', type: 'all' });
        return [
          {
            id: 'feed:580',
            market: 'KR',
            title: '삼성전자',
            summary: 'AI 메모리 노출 50.8점, 펀더멘털 우호.',
            publishedAt: '2026-07-05T15:00:00.000Z',
            affectedEntities: [
              { entityKey: 'KR:005930', ticker: '005930', name: '삼성전자', market: 'KRX' },
            ],
            signalType: 'candidate',
            polarity: 'neutral',
            magnitude: 1,
          },
        ];
      },
    };

    const response = await getMarketNews({ now, query: { market: 'KR', type: 'all' }, readModel });

    assert.equal(response.availability, 'available');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.error, null);
    assert.equal(response.data[0]?.id, 'feed:580');
  });

  it('marks market news stale when the newest published row is older than 72 hours', async () => {
    const readModel: MarketNewsReadModel = {
      listMarketNews() {
        return [
          {
            id: 'feed:stale',
            market: 'KR',
            title: '오래된 시장 뉴스',
            publishedAt: '2026-07-01T00:00:00.000Z',
            affectedEntities: [],
            polarity: 'neutral',
          },
        ];
      },
    };

    const response = await getMarketNews({ now, readModel });

    assert.equal(response.availability, 'stale');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.data[0]?.id, 'feed:stale');
  });

  it('does not call market news available when row freshness is unknown', async () => {
    const readModel: MarketNewsReadModel = {
      listMarketNews() {
        return [
          {
            id: 'feed:unknown-time',
            market: 'US',
            title: '시각 정보 없는 시장 뉴스',
            affectedEntities: [],
            polarity: 'neutral',
          },
        ];
      },
    };

    const response = await getMarketNews({ now, readModel });

    assert.equal(response.availability, 'stale');
    assert.equal(response.meta.source, 'database');
  });

  it('filters action-advice market news before exposing the news envelope', async () => {
    const readModel: MarketNewsReadModel = {
      listMarketNews() {
        return [
          {
            id: 'feed:bad-advice',
            market: 'KR',
            title: '삼성전자 지금 사세요',
            summary: '목표가 100000원, 익절가 110000원',
            affectedEntities: [],
            polarity: 'positive',
          },
          {
            id: 'feed:safe',
            market: 'KR',
            title: '삼성전자 실적 확인 필요',
            summary: '잠정실적 발표 전후 변동성 관찰',
            affectedEntities: [],
            polarity: 'neutral',
          },
        ];
      },
    };

    const response = await getMarketNews({ now, readModel });

    assert.deepEqual(
      response.data.map((item) => item.id),
      ['feed:safe'],
    );
    assert.doesNotMatch(JSON.stringify(response.data), /지금 사세요|목표가|익절가/);
  });

  it('returns an error envelope instead of throwing when market news read fails', async () => {
    const response = await getMarketNews({
      now,
      readModel: {
        listMarketNews() {
          throw new Error('database unavailable');
        },
      },
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'MARKET_NEWS_READ_FAILED');
    assert.deepEqual(response.data, []);
  });
});

describe('discover stocks read model fallback policy', () => {
  const discoverItem: DiscoverStockItem = {
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
  };

  it('returns collecting fallback when no discover stocks DB model is provided', async () => {
    const response = await getDiscoverStocks({ now });

    assert.equal(response.availability, 'collecting');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.meta.generatedAt, now.toISOString());
    assert.equal(response.error, null);
    assert.deepEqual(response.data, []);
  });

  it('returns database discover stocks when a read model has candidate rows', async () => {
    const readModel: DiscoverStocksReadModel = {
      listDiscoverStocks(query) {
        assert.deepEqual(query, { market: 'KR', reason: 'new_candidate' });
        return [discoverItem];
      },
    };

    const response = await getDiscoverStocks({
      now,
      query: { market: 'KR', reason: 'new_candidate' },
      readModel,
    });

    assert.equal(response.availability, 'available');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.error, null);
    assert.deepEqual(response.data, [discoverItem]);
  });

  it('filters action-advice discover candidates before exposing the discover envelope', async () => {
    const readModel: DiscoverStocksReadModel = {
      listDiscoverStocks() {
        return [
          {
            ...discoverItem,
            entityKey: 'KR:005930',
            ticker: '005930',
            name: '삼성전자',
            reasonSummary: '지금 매수 추천, 목표가 100000원',
          },
          discoverItem,
        ];
      },
    };

    const response = await getDiscoverStocks({ now, readModel });

    assert.deepEqual(
      response.data.map((item) => item.entityKey),
      ['KR:005380'],
    );
    assert.doesNotMatch(JSON.stringify(response.data), /매수 추천|목표가/);
  });

  it('returns an error envelope instead of throwing when discover stocks read fails', async () => {
    const response = await getDiscoverStocks({
      now,
      readModel: {
        listDiscoverStocks() {
          throw new Error('database unavailable');
        },
      },
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'DISCOVER_STOCKS_READ_FAILED');
    assert.deepEqual(response.data, []);
  });
});

describe('stock read model fallback policy', () => {
  it('returns collecting fallback list when no stock DB model is provided', async () => {
    const response = await getStockList({ now });

    assert.equal(response.availability, 'collecting');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.meta.generatedAt, now.toISOString());
    assert.equal(response.error, null);
    assert.deepEqual(response.data, []);
  });

  it('returns database stock list when a read model has rows', async () => {
    const receivedQueries: unknown[] = [];
    const readModel: StockReadModel = {
      listStocks(query) {
        receivedQueries.push(query);
        return [stock];
      },
      getStockDetail() {
        return null;
      },
    };

    const response = await getStockList({
      now,
      query: { market: 'KR', scope: 'watchlist', q: '삼성' },
      readModel,
    });

    assert.deepEqual(receivedQueries, [{ market: 'KR', scope: 'watchlist', q: '삼성' }]);
    assert.equal(response.availability, 'available');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.error, null);
    assert.deepEqual(response.data, [stock]);
  });

  it('removes action-advice stock fields without dropping the stock identity', async () => {
    const readModel: StockReadModel = {
      listStocks() {
        return [{ ...stock, primaryThesis: '지금 매수 추천, 목표가 100000원' }];
      },
      getStockDetail() {
        return {
          ...detail,
          deepReport: {
            status: 'available',
            reportMarkdown: '지금 사세요. 목표가 100000원.',
            sources: [],
          },
          relatedNews: [
            {
              id: 'feed:bad',
              title: '매도 추천',
              context: '손절가 70000원',
              impact: '높음',
              icon: 'newspaper',
            },
            {
              id: 'feed:safe',
              title: '실적 확인 필요',
              context: '잠정실적 발표 관찰',
              impact: '중간',
              icon: 'newspaper',
            },
          ],
          risks: ['손절가 70000원', '메모리 가격 변동성'],
          checkpoints: ['익절가 110000원', '실적 발표 확인'],
          companyProfile: {
            status: 'available',
            name: '삼성전자',
            summaryText: '삼성전자 매수하세요',
            sources: [],
          },
          learningCards: [
            {
              cardKey: 'unsafe-title',
              section: 'risk',
              title: '삼성전자 매도하세요',
              bullets: ['업황 확인'],
              availability: 'available',
              sources: [],
            },
            {
              cardKey: 'mixed-body',
              section: 'business',
              title: '사업 구조 확인',
              bodyMarkdown: 'buy now before earnings',
              bullets: ['목표가 100000원', 'HBM 수요 확인'],
              availability: 'available',
              sources: [],
            },
          ],
          glossaryTerms: [
            { term: 'unsafe', definition: 'sell now after the spike', sources: [] },
            { term: 'HBM', definition: '고대역폭 메모리', sources: [] },
          ],
          analysisJob: {
            id: 'job-1',
            status: 'failed',
            progressPct: 20,
            errorMessage: '매도하세요',
          },
        };
      },
    };

    const listResponse = await getStockList({ now, readModel });
    const detailResponse = await getStockDetail('KR:005930', { now, readModel });

    assert.equal(listResponse.data[0]?.entityKey, 'KR:005930');
    assert.equal(listResponse.data[0]?.primaryThesis, undefined);
    assert.equal(detailResponse.data?.deepReport.status, 'missing');
    assert.deepEqual(
      detailResponse.data?.relatedNews.map((item) => item.id),
      ['feed:safe'],
    );
    assert.deepEqual(detailResponse.data?.risks, ['메모리 가격 변동성']);
    assert.deepEqual(detailResponse.data?.checkpoints, ['실적 발표 확인']);
    assert.equal(detailResponse.data?.companyProfile?.summaryText, undefined);
    assert.deepEqual(
      detailResponse.data?.learningCards?.map((card) => ({
        cardKey: card.cardKey,
        title: card.title,
        bodyMarkdown: card.bodyMarkdown,
        bullets: card.bullets,
      })),
      [
        {
          cardKey: 'mixed-body',
          title: '사업 구조 확인',
          bodyMarkdown: undefined,
          bullets: ['HBM 수요 확인'],
        },
      ],
    );
    assert.deepEqual(detailResponse.data?.glossaryTerms, [
      { term: 'HBM', definition: '고대역폭 메모리', sources: [] },
    ]);
    assert.equal(detailResponse.data?.analysisJob?.errorMessage, undefined);
    assert.doesNotMatch(
      JSON.stringify({ listResponse, detailResponse }),
      /매수 추천|매수하세요|매도하세요|buy now|sell now|목표가|손절가|익절가|지금 사세요/,
    );
  });

  it('drops every live learning card: pipeline accident, assistant voice, or investment stance', async () => {
    // `public.stock_learning_cards` 라이브 8행 전부(2026-08-11 실측)에 판정을
    // 못박는다. Asset Deep Dive 가 이 표의 첫 화면 소비자이므로, 어느 행이
    // 살아남고 어느 행이 떨어지는지는 희망이 아니라 단언이어야 한다.
    //
    // 오늘 기준 **여덟 행이 전부 떨어진다.** 남은 둘(KR:005930 · KR:452450)은
    // 파이프라인 오류도 1인칭 발화도 아니지만 종목에 대한 **입장**을 싣는다 —
    // "조건부 보유 논리", "관망형 보유 판단", "…로 보는 게 맞습니다". 화면은
    // 그 자리에 "실을 수 있는 것이 남지 않았습니다" 라는 이름 붙은 부재를
    // 그린다. 기준을 낮춰 내용을 남기는 것은 이 게이트의 방향이 아니다.
    const liveRows: {
      entityKey: string;
      title: string;
      bodyMarkdown: string;
      /** 이 행이 화면에 남아야 하는가. */
      kept: boolean;
    }[] = [
      {
        entityKey: 'KR:005930',
        title: '삼성전자 학습 요약',
        bodyMarkdown:
          '결론: 삼성전자는 “조건부 보유 논리”가 있는 종목입니다. 다만 지금의 강세는 구조적 AI 메모리 사이클에 기반합니다. 신규 공격 접근보다는 관망형 보유 판단이 더 합리적입니다.',
        // 투자 스탠스다. 섹션 헤더가 "판단이 아니라 설명이며" 를 그린 바로 아래
        // 문단에서 종목에 대한 입장을 말한다.
        kept: false,
      },
      {
        entityKey: 'KR:452450',
        title: '피아이이 학습 요약',
        bodyMarkdown:
          '결론: 피아이이는 “기술 옵션은 크지만, 지금은 실적 회복과 CB 오버행을 먼저 통과해야 하는 고변동 소형 장비주”로 보는 게 맞습니다. 보유 판단은 본업 수주 회복이 확인되는가에 달려 있습니다.',
        kept: false,
      },
      {
        entityKey: 'KR:005380',
        title: '현대차 학습 요약',
        bodyMarkdown:
          '검증 결론: 웹 도구(Firecrawl)가 search·extract 모두 크레딧 소진으로 전면 차단. 외부 교차확인을 단 한 건도 수행하지 못했습니다. 지어내지 않겠습니다.',
        // 정직한 고백이지만 종목이 아니라 자기 실행에 대한 진술이고, 내부 도구
        // 이름과 그 크레딧 상태를 화면으로 데리고 나온다.
        kept: false,
      },
      {
        entityKey: 'US:FIG',
        title: 'Figma, Inc. 학습 요약',
        bodyMarkdown: 'API call failed after 3 retries: [Errno 32] Broken pipe',
        kept: false,
      },
      {
        entityKey: 'US:TSLA',
        title: 'Tesla, Inc. 학습 요약',
        bodyMarkdown: 'API call failed after 3 retries: [Errno 32] Broken pipe',
        kept: false,
      },
      {
        entityKey: 'US:NVDA',
        title: 'NVIDIA Corporation 학습 요약',
        bodyMarkdown:
          '주인님, 검증 결과를 충실히 반영해 최종 보고서를 작성했습니다. 정정 2건은 사실관계를 바로잡았습니다. 🌍',
        kept: false,
      },
      {
        entityKey: 'US:PLTR',
        title: 'Palantir Technologies (PLTR) 심층 투자 리서치',
        bodyMarkdown: '충분합니다. 보고서 작성합니다.',
        kept: false,
      },
      {
        entityKey: 'US:BMNR',
        title: 'BitMine Immersion Technologies, 심층 리서치 (종합 단계 실패 — 원본 제공)',
        // 본문은 읽을 만하지만 제목이 내부 잡 단계 이름을 화면으로 내보낸다.
        // 제목만 다듬으면 기록을 고쳐 쓰는 것이 되므로 카드째 뺀다.
        bodyMarkdown:
          '결론: BMNR은 ETH를 대량 보유하고 주식·우선주 발행으로 ETH-per-share를 키우려는 상장형 트레저리 회사입니다.',
        kept: false,
      },
    ];

    const readModel: StockReadModel = {
      listStocks() {
        return [stock];
      },
      getStockDetail() {
        return {
          ...detail,
          learningCards: liveRows.map((row) => ({
            cardKey: row.entityKey,
            section: '심층 리서치',
            title: row.title,
            bodyMarkdown: row.bodyMarkdown,
            bullets: [],
            availability: 'text_only' as const,
            sources: [],
          })),
        };
      },
    };

    const response = await getStockDetail('KR:005930', { now, readModel });
    assert.deepEqual(
      response.data?.learningCards?.map((card) => card.cardKey),
      liveRows.filter((row) => row.kept).map((row) => row.entityKey),
    );
    // 오늘 살아남는 행이 하나도 없다는 사실을 따로 못박는다. 위 `deepEqual` 은
    // 표를 고치면 함께 조용히 바뀌지만, 이 줄은 "0장" 이 우연이 아니라 관측된
    // 결과였음을 남긴다. `undefined`(카드 자체가 없음)와 `[]`(있었는데 전부
    // 떨어짐)는 화면에서 다른 문구이므로 `[]` 인 것까지 확인한다.
    assert.deepEqual(response.data?.learningCards, []);
    // 격하가 아니라 제외인 이유: `text_only` 는 본문 렌더를 막지 않는다. 라이브
    // 8장 중 7장이 이미 `text_only` 였고 그래서 오류 문자열이 화면에 있었다.
    assert.doesNotMatch(
      JSON.stringify(response),
      /Broken pipe|주인님|보고서 작성합니다|단계 실패|지어내지 않겠습니다|보유 논리|보유 판단|보는 게 맞습니다/,
    );
  });

  it('keeps learning cards that use 보유 descriptively rather than as a stance', async () => {
    // 스탠스 게이트가 넓어지면 정상 문구를 조용히 떨어뜨린다. `보유` 는
    // 포트폴리오·지분·현금 서술에 흔히 쓰이는 낱말이고, 그 용법은 통과해야
    // 한다. 걸러야 하는 것은 뒤에 판단어(`논리`·`판단`·`스탠스`)가 붙은 형태다.
    const descriptive = [
      '이 종목은 국민연금이 5% 이상 보유 중인 보유 종목입니다.',
      '현금 보유가 늘면서 순차입금은 줄었습니다.',
      '원가 상승분을 판가에 반영했고 영업이익률은 유지됐습니다.',
      '결론: 이 회사는 반도체 후공정 장비를 만듭니다.',
    ];
    const readModel: StockReadModel = {
      listStocks() {
        return [stock];
      },
      getStockDetail() {
        return {
          ...detail,
          learningCards: descriptive.map((bodyMarkdown, index) => ({
            cardKey: `descriptive-${index}`,
            section: '심층 리서치',
            title: '사업 설명',
            bodyMarkdown,
            bullets: [],
            availability: 'text_only' as const,
            sources: [],
          })),
        };
      },
    };

    const response = await getStockDetail('KR:005930', { now, readModel });
    assert.deepEqual(
      response.data?.learningCards?.map((card) => card.bodyMarkdown),
      descriptive,
    );
  });

  it('returns an error envelope instead of throwing when stock list read fails', async () => {
    const response = await getStockList({
      now,
      readModel: {
        listStocks() {
          throw new Error('database unavailable');
        },
        getStockDetail() {
          return null;
        },
      },
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'STOCK_LIST_READ_FAILED');
    assert.deepEqual(response.data, []);
  });

  it('returns missing fallback detail when stock detail is absent', async () => {
    const response = await getStockDetail('KR:005930', { now });

    assert.equal(response.availability, 'missing');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'STOCK_NOT_FOUND');
    assert.equal(response.error?.detail, 'KR:005930');
    assert.equal(response.data, null);
  });

  it('returns database stock detail when a read model has a detail row', async () => {
    const response = await getStockDetail('KR:005930', {
      now,
      readModel: {
        listStocks() {
          return [];
        },
        getStockDetail(entityKey) {
          assert.equal(entityKey, 'KR:005930');
          return detail;
        },
      },
    });

    assert.equal(response.availability, 'available');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.error, null);
    assert.deepEqual(response.data, detail);
  });

  it('returns an error envelope instead of throwing when stock detail read fails', async () => {
    const response = await getStockDetail('KR:005930', {
      now,
      readModel: {
        listStocks() {
          return [];
        },
        getStockDetail() {
          throw new Error('database unavailable');
        },
      },
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'STOCK_DETAIL_READ_FAILED');
    assert.equal(response.error?.detail, 'KR:005930');
    assert.equal(response.data, null);
  });
});

describe('PostgreSQL stock list read model', () => {
  it('maps latest candidate, snapshot, watchlist, and deep-cache rows to stock list DTOs', async () => {
    const executedSql: string[] = [];
    const executor: StockRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, ['KR', 'watchlist', '%삼성%']);
      return [
        {
          entity_key: 'KR:005930',
          ticker: '005930',
          market: 'KR',
          name: '삼성전자',
          latest_price: null,
          currency: null,
          change_pct: null,
          primary_thesis: 'AI 메모리 노출 50.8점, 펀더멘털 우호.',
          confidence: 'medium',
          is_watched: true,
          is_holding: false,
          deep_report_length: 7739,
          last_analyzed_at: '2026-06-26T02:40:56.304774+09:00',
        },
      ];
    };

    const readModel = createPostgresStockReadModel(executor);
    const rows = await readModel.listStocks({ market: 'KR', scope: 'watchlist', q: '삼성' });

    assert.equal(executedSql.length, 1);
    assert.match(executedSql[0] ?? '', /stock\.candidates/i);
    assert.match(executedSql[0] ?? '', /regexp_replace\(ticker,/i);
    assert.match(executedSql[0] ?? '', /KS\|KQ/);
    assert.doesNotMatch(executedSql[0] ?? '', /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    assert.deepEqual(rows, [
      {
        entityKey: 'KR:005930',
        ticker: '005930',
        market: 'KR',
        name: '삼성전자',
        displayName: '삼성전자 · 005930',
        isWatched: true,
        isHolding: false,
        primaryThesis: 'AI 메모리 노출 50.8점, 펀더멘털 우호.',
        confidence: 'medium',
        analysisStatus: 'cached',
        lastAnalyzedAt: '2026-06-25T17:40:56.304Z',
      },
    ]);
  });

  it('keeps sparse KR candidates instead of dropping rows without latest prices', async () => {
    const readModel = createPostgresStockReadModel(async () => [
      {
        entity_key: 'KR:005380',
        ticker: '005380',
        market: 'KR',
        name: '현대차',
        latest_price: null,
        currency: null,
        change_pct: null,
        primary_thesis: null,
        confidence: 'medium',
        is_watched: true,
        is_holding: false,
        deep_report_length: 4804,
        last_analyzed_at: '2026-06-30T02:37:33.561921+09:00',
      },
    ]);

    const rows = await readModel.listStocks({});

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.entityKey, 'KR:005380');
    assert.equal(rows[0]?.latestPrice, undefined);
    assert.equal(rows[0]?.currency, undefined);
    assert.equal(rows[0]?.analysisStatus, 'cached');
  });
});

describe('PostgreSQL stock detail read model', () => {
  it('maps candidate, snapshot, deep-cache, risks, checkpoints, and feed rows to a detail DTO', async () => {
    const executedSql: string[] = [];
    const executor: StockRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, ['KR:005930']);
      return [
        {
          entity_key: 'KR:005930',
          ticker: '005930',
          market: 'KR',
          name: '삼성전자',
          latest_price: '81200',
          currency: 'KRW',
          change_pct: '1.25',
          primary_thesis: 'AI 메모리 노출 50.8점, 펀더멘털 우호.',
          confidence: 'medium',
          is_watched: 1,
          is_holding: 0,
          deep_report_length: '45',
          last_analyzed_at: '2026-06-26T02:40:56.304774+09:00',
          snapshot_captured_at: '2026-07-06T10:20:00+09:00',
          deep_report: '결론: 삼성전자는 조건부 보유 논리가 있는 종목입니다.',
          deep_report_sources: '[]',
          risks_text: 'HBM 기대 미달; 원화 약세; 반도체 ETF 투매 재개',
          checkpoints_text: '7/7 실적; 외국인 순매도 둔화; 310000 회복',
          source_urls:
            '["https://data.krx.co.kr/", "https://www.goldmansachs.com/insights/articles/why-koreas-stock-market-is-forecast-to-rise-to-record-highs"]',
          related_news: [
            {
              id: 'feed:101',
              title: '삼성전자',
              context: 'HBM4·풀스택 내재화 기대',
              impact: '중간',
              icon: 'newspaper',
            },
          ],
        } as never,
      ];
    };

    const readModel = createPostgresStockReadModel(executor);
    const row = await readModel.getStockDetail('KR:005930');

    assert.equal(executedSql.length, 1);
    assert.match(executedSql[0] ?? '', /stock\.candidates/i);
    assert.match(executedSql[0] ?? '', /watchlist\.deep_cache/i);
    assert.match(executedSql[0] ?? '', /public\.v_user_feed_dedup/i);
    assert.doesNotMatch(executedSql[0] ?? '', /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    assert.deepEqual(row, {
      stock: {
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
        lastAnalyzedAt: '2026-06-25T17:40:56.304Z',
      },
      latestSnapshot: {
        price: 81200,
        currency: 'KRW',
        changePct: 1.25,
        capturedAt: '2026-07-06T01:20:00.000Z',
      },
      deepReport: {
        status: 'available',
        reportMarkdown: '결론: 삼성전자는 조건부 보유 논리가 있는 종목입니다.',
        researchedAt: '2026-06-25T17:40:56.304Z',
        sources: [
          { label: 'data.krx.co.kr', url: 'https://data.krx.co.kr/' },
          {
            label: 'www.goldmansachs.com',
            url: 'https://www.goldmansachs.com/insights/articles/why-koreas-stock-market-is-forecast-to-rise-to-record-highs',
          },
        ],
      },
      relatedNews: [
        {
          id: 'feed:101',
          title: '삼성전자',
          context: 'HBM4·풀스택 내재화 기대',
          impact: '중간',
          icon: 'newspaper',
        },
      ],
      risks: ['HBM 기대 미달', '원화 약세', '반도체 ETF 투매 재개'],
      checkpoints: ['7/7 실적', '외국인 순매도 둔화', '310000 회복'],
    });
  });

  it('maps Phase 3 learning cards, glossary terms, and analysis job status to stock detail', async () => {
    const executedSql: string[] = [];
    const executor: StockRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, ['KR:005930']);
      return [
        {
          entity_key: 'KR:005930',
          ticker: '005930',
          market: 'KR',
          name: '삼성전자',
          latest_price: null,
          currency: null,
          change_pct: null,
          primary_thesis: 'HBM과 파운드리 회복을 공부 카드로 추적합니다.',
          confidence: 'medium',
          is_watched: true,
          is_holding: false,
          deep_report_length: '0',
          last_analyzed_at: null,
          learning_cards: [
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
          glossary_terms: [
            {
              term: 'HBM',
              definition: 'AI 가속기 주변에 붙는 고대역폭 메모리입니다.',
              sources: [],
            },
          ],
          analysis_job_id: '42',
          analysis_job_status: 'running',
          analysis_progress_pct: '37.5',
          analysis_queued_at: '2026-07-06T00:00:00.000Z',
          analysis_started_at: '2026-07-06T00:01:00.000Z',
          analysis_completed_at: null,
          analysis_error_message: null,
        } as never,
      ];
    };

    const readModel = createPostgresStockReadModel(executor);
    const row = await readModel.getStockDetail('KR:005930');

    assert.match(executedSql[0] ?? '', /public\.stock_learning_cards/i);
    assert.match(executedSql[0] ?? '', /public\.entity_glossary_terms/i);
    assert.match(executedSql[0] ?? '', /public\.v_stock_learning_status/i);
    assert.equal(row?.learningCards[0]?.cardKey, 'deep-cache-summary');
    assert.equal(row?.learningCards[0]?.bullets[1], '파운드리 가동률');
    assert.equal(row?.glossaryTerms[0]?.term, 'HBM');
    assert.deepEqual(row?.analysisJob, {
      id: '42',
      status: 'running',
      progressPct: 37.5,
      queuedAt: '2026-07-06T00:00:00.000Z',
      startedAt: '2026-07-06T00:01:00.000Z',
    });
  });

  it('maps Phase 4 company profile and source-backed market metrics without showing unsourced financial numbers', async () => {
    const executedSql: string[] = [];
    const executor: StockRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, ['US:NVDA']);
      return [
        {
          entity_key: 'US:NVDA',
          ticker: 'NVDA',
          market: 'US',
          name: 'NVIDIA',
          latest_price: '196.52',
          currency: 'USD',
          change_pct: '0.87',
          primary_thesis: 'AI accelerator demand remains the core check.',
          confidence: 'medium',
          is_watched: true,
          is_holding: false,
          deep_report_length: '0',
          last_analyzed_at: null,
          snapshot_captured_at: '2026-07-06T00:00:00.000Z',
          company_profile: {
            status: 'text_only',
            symbol: 'NVDA',
            market: 'US',
            name: 'NVIDIA',
            sector: '반도체',
            industry: 'GPU',
            summaryText: 'AI accelerator demand remains the core check.',
            sources: [{ label: 'deep cache', url: 'https://example.com/nvda-profile' }],
            capturedAt: '2026-07-05T00:00:00.000Z',
          },
          company_metrics: [
            {
              metricGroup: 'market_snapshot',
              fiscalPeriod: 'latest',
              currency: 'USD',
              availability: 'available',
              reportedAt: '2026-07-06T00:00:00.000Z',
              sources: [{ label: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/NVDA' }],
              metrics: [
                { key: 'latestPrice', label: '현재가', value: 196.52, unit: 'currency' },
                { key: 'rsi14', label: 'RSI(14)', value: 41.9, unit: 'score' },
                { key: 'volume', label: '거래량', value: 51535676, unit: 'shares' },
              ],
            },
            {
              metricGroup: 'financial_statement',
              fiscalYear: 2026,
              fiscalPeriod: 'FY',
              currency: null,
              availability: 'available',
              reportedAt: '2026-07-06T00:00:00.000Z',
              sources: [],
              metrics: [{ key: 'revenue', label: '매출', value: 999, unit: 'currency' }],
            },
          ],
        } as never,
      ];
    };

    const readModel = createPostgresStockReadModel(executor);
    const row = await readModel.getStockDetail('US:NVDA');

    assert.match(executedSql[0] ?? '', /public\.company_profiles/i);
    assert.match(executedSql[0] ?? '', /public\.company_financials/i);
    assert.equal(row?.companyProfile?.status, 'text_only');
    assert.equal(row?.companyProfile?.summaryText, 'AI accelerator demand remains the core check.');
    assert.equal(row?.companyMetrics?.length, 1);
    assert.equal(row?.companyMetrics?.[0]?.metricGroup, 'market_snapshot');
    assert.equal(row?.companyMetrics?.[0]?.sources[0]?.label, 'Yahoo Finance');
    assert.equal(row?.companyMetrics?.[0]?.metrics[1]?.value, 41.9);
    assert.equal(
      row?.companyMetrics?.some((group) => group.metricGroup === 'financial_statement'),
      false,
    );
  });

  it('anchors stock detail on source-backed financial rows when no candidate row exists', async () => {
    const executedSql: string[] = [];
    const executor: StockRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, ['US:FIG']);
      return [
        {
          entity_key: 'US:FIG',
          ticker: 'FIG',
          market: 'US',
          name: 'Figma Inc',
          latest_price: null,
          currency: null,
          change_pct: null,
          primary_thesis: null,
          confidence: null,
          is_watched: true,
          is_holding: false,
          deep_report_length: '0',
          last_analyzed_at: null,
          company_metrics: [
            {
              metricGroup: 'sec_annual_facts',
              fiscalYear: 2025,
              fiscalPeriod: 'FY',
              currency: 'USD',
              availability: 'available',
              reportedAt: '2026-02-18T00:00:00.000Z',
              sources: [
                {
                  label: 'SEC EDGAR companyfacts',
                  url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0001579878.json',
                },
              ],
              metrics: [
                { key: 'revenue', label: '매출', value: 1055788000, unit: 'currency' },
                { key: 'netMarginPct', label: '순이익률', value: -118.44, unit: 'percent' },
              ],
            },
          ],
        } as never,
      ];
    };

    const readModel = createPostgresStockReadModel(executor);
    const row = await readModel.getStockDetail('US:FIG');

    assert.match(executedSql[0] ?? '', /detail_anchor/i);
    assert.equal(row?.stock.entityKey, 'US:FIG');
    assert.equal(row?.stock.name, 'Figma Inc');
    assert.equal(row?.stock.analysisStatus, 'none');
    assert.equal(row?.companyMetrics?.[0]?.metricGroup, 'sec_annual_facts');
    assert.equal(row?.companyMetrics?.[0]?.metrics[1]?.value, -118.44);
  });

  it('preserves unsupported availability from DB-backed detail sections instead of collapsing it to missing', async () => {
    const readModel = createPostgresStockReadModel(async () => [
      {
        entity_key: 'CRYPTO:BTC',
        ticker: 'BTC',
        market: 'US',
        name: 'Bitcoin proxy row',
        latest_price: null,
        currency: null,
        change_pct: null,
        primary_thesis: 'KR/US stock detail does not structure crypto-native assets.',
        confidence: 'low',
        is_watched: false,
        is_holding: false,
        deep_report_length: '0',
        last_analyzed_at: null,
        company_profile: {
          status: 'unsupported',
          symbol: 'BTC',
          name: 'Bitcoin',
          summaryText: 'KR/US 주식 범위 밖이라 구조화하지 않습니다.',
          sources: [],
        },
        learning_cards: [
          {
            cardKey: 'unsupported-asset',
            section: '지원 범위',
            title: 'KR/US 주식 범위 밖',
            bullets: ['주문 기능 없음', '기본 주식 리서치 화면에서는 구조화 제외'],
            availability: 'unsupported',
            sources: [],
          },
        ],
      } as never,
    ]);

    const row = await readModel.getStockDetail('CRYPTO:BTC');

    assert.equal(row?.companyProfile?.status, 'unsupported');
    assert.equal(row?.learningCards?.[0]?.availability, 'unsupported');
  });
});

describe('PostgreSQL me bootstrap read model', () => {
  it('maps active watchlist and open positions to a me bootstrap DTO without write SQL', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const executedSql: string[] = [];
    const executor: MeBootstrapRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, [userId]);
      return [
        {
          user_id: userId,
          watchlist: [
            {
              entity_key: 'KR:005930',
              ticker: '005930',
              market: 'KR',
              display_name: '삼성전자',
              source: 'stock_watchlist_sqlite',
              added_at: '2026-06-07T16:58:39.191232+09:00',
            },
            {
              entity_key: 'US:NVDA',
              ticker: 'NVDA',
              market: 'US',
              display_name: 'NVIDIA',
              source: 'stock_watchlist_sqlite',
              added_at: '2026-06-07T16:58:39.050713+09:00',
            },
          ],
          positions: [
            {
              entity_key: 'US:NVDA',
              ticker: 'NVDA',
              market: 'US',
              display_name: 'NVIDIA',
              avg_price: '121.5',
              quantity: '3.25',
              status: 'open',
              source: 'manual',
              opened_at: '2026-06-10T09:00:00+09:00',
              closed_at: null,
            },
          ],
        } as never,
      ];
    };

    const readModel = createPostgresMeBootstrapReadModel(executor, { userId });
    const data = await readModel.loadMeBootstrap();

    assert.equal(executedSql.length, 1);
    assert.match(executedSql[0] ?? '', /public\.user_watchlist/i);
    assert.match(executedSql[0] ?? '', /public\.user_positions/i);
    assert.match(executedSql[0] ?? '', /user_id\s*=\s*\$1::uuid/i);
    assert.match(executedSql[0] ?? '', /position\.user_id\s*=\s*\$1::uuid/i);
    assert.match(executedSql[0] ?? '', /watch\.user_id\s*=\s*position\.user_id/i);
    assert.doesNotMatch(executedSql[0] ?? '', /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    assert.deepEqual(data, {
      user: { id: userId, label: '기본 사용자' },
      watchlist: [
        {
          entityKey: 'KR:005930',
          ticker: '005930',
          market: 'KR',
          displayName: '삼성전자',
          source: 'stock_watchlist_sqlite',
          addedAt: '2026-06-07T07:58:39.191Z',
        },
        {
          entityKey: 'US:NVDA',
          ticker: 'NVDA',
          market: 'US',
          displayName: 'NVIDIA',
          source: 'stock_watchlist_sqlite',
          addedAt: '2026-06-07T07:58:39.050Z',
        },
      ],
      positions: [
        {
          entityKey: 'US:NVDA',
          ticker: 'NVDA',
          market: 'US',
          displayName: 'NVIDIA',
          avgPrice: 121.5,
          quantity: 3.25,
          status: 'open',
          source: 'manual',
          openedAt: '2026-06-10T00:00:00.000Z',
        },
      ],
      preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
    });
  });
});

describe('PostgreSQL market news read model', () => {
  it('maps stock-domain feed rows to market news DTOs without write SQL', async () => {
    const executedSql: string[] = [];
    const executor: MarketNewsRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, ['KR', 'all']);
      return [
        {
          record_id: '580',
          market: 'KR',
          record_entity_key: 'KR:005930',
          ticker: '005930',
          title: '삼성전자',
          summary_text: 'AI 메모리 노출 50.8점, 펀더멘털 우호.',
          record_type: 'candidate',
          primary_kind: 'direct',
          relevance_score: '1.0',
          published_at: null,
          effective_date: '2026-07-06T00:00:00+09:00',
          source_name: 'Example News',
          url: 'https://example.com/news/580',
        } as never,
      ];
    };

    const readModel = createPostgresMarketNewsReadModel(executor);
    const rows = await readModel.listMarketNews({ market: 'KR', type: 'all' });

    assert.equal(executedSql.length, 1);
    assert.match(executedSql[0] ?? '', /public\.v_user_feed_dedup/i);
    assert.match(executedSql[0] ?? '', /public\.source_documents/i);
    assert.match(executedSql[0] ?? '', /coalesce\(nullif\(document\.title_ko/i);
    assert.match(executedSql[0] ?? '', /domain\s*=\s*'stock'/i);
    assert.doesNotMatch(executedSql[0] ?? '', /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    assert.deepEqual(rows, [
      {
        id: 'feed:580',
        market: 'KR',
        title: '삼성전자',
        summary: 'AI 메모리 노출 50.8점, 펀더멘털 우호.',
        sourceName: 'Example News',
        url: 'https://example.com/news/580',
        publishedAt: '2026-07-05T15:00:00.000Z',
        affectedEntities: [
          { entityKey: 'KR:005930', ticker: '005930', name: '삼성전자', market: 'KRX' },
        ],
        signalType: 'candidate',
        polarity: 'neutral',
        magnitude: 1,
      },
    ]);
  });
});

describe('PostgreSQL discover stocks read model', () => {
  it('maps candidate and reach-cache rows to discover DTOs without write SQL', async () => {
    const executedSql: string[] = [];
    const executor: DiscoverStocksRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, ['KR', 'watchlist_related']);
      return [
        {
          entity_key: 'KR:005930',
          ticker: '005930',
          market: 'KR',
          name: '삼성전자',
          category: 'buy_interest',
          reason_type: 'related',
          reason_summary: '7/7 잠정실적 촉매와 반도체 반등 관찰.',
          confidence: 'medium',
          risks_text: '외국인 순매도; 메모리 가격 변동성',
          checkpoints_text: '실적 발표 확인; 거래량 동반 회복',
          source_urls: '["https://example.com/report"]',
          deep_report_length: '0',
          last_analyzed_at: null,
          related_to_my_stocks: [
            { entity_key: 'KR:000660', ticker: '000660', name: 'SK하이닉스', market: 'KR' },
          ],
        } as never,
      ];
    };

    const readModel = createPostgresDiscoverStocksReadModel(executor);
    const rows = await readModel.listDiscoverStocks({ market: 'KR', reason: 'watchlist_related' });

    assert.equal(executedSql.length, 1);
    assert.match(executedSql[0] ?? '', /stock\.candidates/i);
    assert.match(executedSql[0] ?? '', /regexp_replace\(ticker,/i);
    assert.match(executedSql[0] ?? '', /KS\|KQ/);
    assert.match(executedSql[0] ?? '', /public\.entity_reach_cache/i);
    assert.match(executedSql[0] ?? '', /public\.user_watchlist/i);
    assert.doesNotMatch(executedSql[0] ?? '', /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    assert.deepEqual(rows, [
      {
        entityKey: 'KR:005930',
        ticker: '005930',
        market: 'KR',
        name: '삼성전자',
        reasonType: 'related',
        reasonTitle: '관심종목 관련 후보',
        reasonSummary: '7/7 잠정실적 촉매와 반도체 반등 관찰.',
        confidence: 'medium',
        relatedToMyStocks: [
          { entityKey: 'KR:000660', ticker: '000660', name: 'SK하이닉스', market: 'KRX' },
        ],
        topRisks: ['외국인 순매도', '메모리 가격 변동성'],
        checkpoints: ['실적 발표 확인', '거래량 동반 회복'],
        sourceCount: 1,
        sources: [{ label: 'example.com', url: 'https://example.com/report' }],
        canStartAnalysis: true,
        analysisStatus: 'none',
      },
    ]);
  });
});

describe('PostgreSQL dashboard read model', () => {
  it('maps stock-domain dashboard rows to dashboard DTOs without write SQL', async () => {
    const executedSql: string[] = [];
    const executor: DashboardRowQueryExecutor = async (sql, params) => {
      executedSql.push(sql);
      assert.deepEqual(params, []);
      return [
        {
          projection_updated_at: '2026-07-06T00:00:00.000Z',
          watchlist_count: '8',
          position_count: '0',
          related_issue_count: '12',
          cached_report_count: '5',
          average_change_pct: '1.25',
          top_theme_label: 'buy_interest',
          bars: [53, 57, 61],
          trend: [
            { label: '07-04', value: 57 },
            { label: '07-05', value: 61 },
          ],
          theme_share: [
            { id: 'buy_interest', label: 'buy_interest', value: 60 },
            { id: 'watchlist', label: 'watchlist', value: 40 },
          ],
          themes: [
            {
              id: 'buy-interest',
              title: 'buy_interest',
              description: '7/7 잠정실적 촉매와 반도체 반등 관찰.',
              strength: 60,
            },
          ],
          insights: [
            {
              id: 'feed:580',
              title: '삼성전자 실적 촉매',
              context: '관심종목 뉴스',
              impact: '높음',
              icon: 'newspaper',
            },
          ],
          stocks: [
            {
              entity_key: 'KR:005930',
              ticker: '005930',
              market: 'KR',
              name: '삼성전자',
              category: 'buy_interest',
              latest_price: '81200',
              currency: 'KRW',
              change_pct: '1.25',
              primary_thesis: '7/7 잠정실적 촉매와 반도체 반등 관찰.',
              confidence: 'medium',
              is_watched: true,
              is_holding: false,
              deep_report_length: '7743',
              last_analyzed_at: '2026-07-05T12:00:00.000Z',
              risks_text: '외국인 순매도; 메모리 가격 변동성',
              checkpoints_text: '실적 발표 확인; 거래량 동반 회복',
            },
          ],
        },
      ];
    };

    const readModel = createPostgresDashboardReadModel(executor);
    const snapshot = await readModel.loadDashboardBootstrap();
    assert.ok('data' in snapshot);
    if (!('data' in snapshot)) throw new Error('expected dashboard read snapshot');
    const bootstrap = snapshot.data;

    assert.equal(executedSql.length, 1);
    assert.match(executedSql[0] ?? '', /stock\.candidates/i);
    assert.match(executedSql[0] ?? '', /regexp_replace\(ticker,/i);
    assert.match(executedSql[0] ?? '', /KS\|KQ/);
    assert.match(executedSql[0] ?? '', /stock\.market_snapshots/i);
    assert.match(executedSql[0] ?? '', /public\.v_user_feed_dedup/i);
    assert.match(executedSql[0] ?? '', /domain\s*=\s*'stock'/i);
    assert.match(executedSql[0] ?? '', /projection_updated_at/i);
    assert.doesNotMatch(executedSql[0] ?? '', /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    assert.equal(snapshot.latestAt, '2026-07-06T00:00:00.000Z');
    assert.equal(bootstrap.portfolio.value, '보유 0 · 관심 8개');
    assert.equal(bootstrap.portfolio.dailyChange, '+1.25% · 관심종목 평균');
    assert.equal(bootstrap.portfolio.relatedIssueCount, 12);
    assert.equal(bootstrap.portfolio.focusTheme, 'buy_interest');
    assert.deepEqual(bootstrap.portfolio.bars, [53, 57, 61]);
    assert.equal(bootstrap.insights[0]?.id, 'feed:580');
    assert.equal(bootstrap.themes[0]?.strength, 60);
    assert.equal(bootstrap.stocks[0]?.id, 'kr-005930');
    assert.equal(bootstrap.stocks[0]?.price, '₩81,200');
    assert.equal(bootstrap.stocks[0]?.change, '+1.25%');
    assert.equal(bootstrap.stocks[0]?.holding, false);
    assert.deepEqual(bootstrap.stocks[0]?.risks, ['외국인 순매도', '메모리 가격 변동성']);
    assert.deepEqual(bootstrap.stocks[0]?.positives, ['실적 발표 확인', '거래량 동반 회복']);
  });
});
