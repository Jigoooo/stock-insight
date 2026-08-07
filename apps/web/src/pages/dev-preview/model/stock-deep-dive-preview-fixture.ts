import { stocksBriefingPreviewFixture, stocksPreviewFixture } from './stocks-preview-fixture.ts';

import type {
  StockBriefingDetail,
  StockBriefingItem,
  StockBriefingLoader,
} from '../../research-workspace/model/stock-briefing.ts';
import {
  DEEP_DIVE_SECTION_IDS,
  type StockDeepDiveLoader,
  type StockDeepDiveSectionId,
} from '../../research-workspace/model/stock-deep-dive.ts';

const generatedAt = stocksPreviewFixture.stocks.meta.generatedAt;

const previewSectionTitles: Record<StockDeepDiveSectionId, string> = {
  identity: '정체성',
  performance: '실적 구조',
  direct_relations: '직접 관계',
  secondary_exposure: '2차 노출',
  factor_exposure: '요인 노출',
  active_events: '진행 사건',
  historical_analog: '과거 유사 사례',
  scenario: '시나리오',
  counter_evidence: '반대 근거',
  derivation: '도출 과정',
  holding_judgment: '보유 판단',
  invalidation: '무효화 조건',
};

const newsByEntity: Readonly<Record<string, StockBriefingDetail['news']>> = {
  'KR:005930': [
    {
      id: 'samsung-news-1',
      title: '삼성전자 반도체 공급망 업데이트',
      summary: '공급 일정과 제품 구성을 확인할 수 있는 개발 예시입니다.',
      sourceName: 'Samsung Global Newsroom',
      publishedAt: '2026-08-06T02:00:00.000Z',
      url: 'https://news.samsung.com/global/',
    },
  ],
  'KR:000660': [
    {
      id: 'hynix-news-1',
      title: 'SK하이닉스 HBM 사업 업데이트',
      summary: '제품 수요와 생산 계획을 확인하는 개발 예시입니다.',
      sourceName: 'SK hynix Newsroom',
      publishedAt: '2026-08-05T01:00:00.000Z',
      url: 'https://news.skhynix.com/',
    },
  ],
  'KR:035420': [
    {
      id: 'naver-news-1',
      title: 'NAVER 사업 현황 자료',
      summary: '광고와 AI 서비스 지표를 확인하는 개발 예시입니다.',
      sourceName: 'NAVER IR',
      publishedAt: '2026-08-04T01:00:00.000Z',
      url: 'https://www.navercorp.com/investment/irEvents',
    },
  ],
  'US:NVDA': [
    {
      id: 'nvidia-news-1',
      title: 'NVIDIA 데이터센터 제품 업데이트',
      summary: '제품 공급 일정 변화를 확인하는 개발 예시입니다.',
      sourceName: 'NVIDIA Newsroom',
      publishedAt: '2026-08-03T01:00:00.000Z',
      url: 'https://nvidianews.nvidia.com/',
    },
  ],
  'US:MU': [
    {
      id: 'micron-news-1',
      title: 'Micron 메모리 시장 업데이트',
      summary: '메모리 수요와 공급 계획을 확인하는 개발 예시입니다.',
      sourceName: 'Micron Investor Relations',
      publishedAt: '2026-08-02T01:00:00.000Z',
      url: 'https://investors.micron.com/',
    },
  ],
};

const whyNowByEntity = new Map<string, StockBriefingItem>(
  [
    ...stocksBriefingPreviewFixture.priorityHoldings,
    ...stocksBriefingPreviewFixture.watchlistChanges,
  ].map((item) => [item.entityKey, item]),
);

function detailFor(entityKey: string): StockBriefingDetail {
  const stock = stocksPreviewFixture.stocks.data.find((item) => item.entityKey === entityKey);
  if (!stock) throw new Error('개발 미리보기 fixture에서 종목을 찾지 못했습니다.');
  const whyNow = whyNowByEntity.get(entityKey);
  return {
    stock,
    generatedAt,
    availability: whyNow ? 'available' : 'partial',
    evidenceLevel: stock.isHolding ? 'high' : 'medium',
    whyNow,
    paths: whyNow?.primaryPath
      ? [{ id: `${entityKey}-primary-path`, label: whyNow.primaryPath }]
      : [],
    news: newsByEntity[entityKey] ?? [],
    risks: whyNow?.riskSummary ? [whyNow.riskSummary] : [],
    checkpoints: stock.isHolding ? ['다음 분석에서 보유 당시 조건이 유지되는지 복기합니다.'] : [],
    primaryThesis: stock.primaryThesis,
    companyMetrics: [],
    partialFailures: {},
  };
}

export const stockBriefingDetailPreviewFixtures = Object.fromEntries(
  stocksPreviewFixture.stocks.data.map(({ entityKey }) => [entityKey, detailFor(entityKey)]),
) as Readonly<Record<string, StockBriefingDetail>>;

export const loadPreviewStockBriefing: StockBriefingLoader = async (entityKey) => {
  const detail = stockBriefingDetailPreviewFixtures[entityKey];
  if (!detail) throw new Error('개발 미리보기 fixture에서 종목을 찾지 못했습니다.');
  return { detail, relation: null };
};

/** Temporary compatibility until StocksView migrates to StockBriefingLoader. */
export const loadPreviewStockDeepDive: StockDeepDiveLoader = async (entityKey) => {
  const { detail } = await loadPreviewStockBriefing(entityKey);
  return {
    relation: null,
    deepDive: {
      entityKey: detail.stock.entityKey,
      displayName: detail.stock.displayName,
      availability: 'partial',
      generatedAt: detail.generatedAt,
      sections: DEEP_DIVE_SECTION_IDS.map((id) => {
        const items =
          id === 'identity'
            ? [detail.stock.displayName, detail.stock.ticker, detail.stock.market]
            : id === 'active_events'
              ? detail.news.map(({ title }) => title)
              : id === 'holding_judgment' && detail.stock.isHolding
                ? ['개발 fixture의 보유 상태', detail.primaryThesis].filter(
                    (item): item is string => Boolean(item),
                  )
                : [];
        return {
          id,
          title: previewSectionTitles[id],
          summary:
            items.length > 0
              ? '개발 미리보기 fixture로 구성된 예시입니다.'
              : '연결된 개발 미리보기 데이터가 없습니다.',
          availability: items.length > 0 ? 'partial' : 'missing',
          items,
          itemCount: items.length,
        };
      }),
    },
  };
};
