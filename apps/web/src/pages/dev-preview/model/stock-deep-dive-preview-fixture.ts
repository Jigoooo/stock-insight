import { stocksPreviewFixture } from './stocks-preview-fixture';

import {
  DEEP_DIVE_SECTION_IDS,
  type StockDeepDiveLoader,
  type StockDeepDiveSectionId,
} from '@/pages/research-workspace/model/stock-deep-dive';

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

export const loadPreviewStockDeepDive: StockDeepDiveLoader = async (entityKey) => {
  const stock = stocksPreviewFixture.stocks.data.find((item) => item.entityKey === entityKey);
  if (!stock) throw new Error('개발 미리보기 fixture에서 종목을 찾지 못했습니다.');

  return {
    relation: null,
    deepDive: {
      entityKey: stock.entityKey,
      displayName: stock.displayName,
      availability: 'partial',
      generatedAt: stocksPreviewFixture.stocks.meta.generatedAt,
      sections: DEEP_DIVE_SECTION_IDS.map((id) => {
        const items =
          id === 'identity'
            ? [stock.displayName, stock.ticker, stock.market]
            : id === 'holding_judgment' && stock.isHolding
              ? ['개발 fixture의 보유 상태', stock.primaryThesis].filter((item): item is string =>
                  Boolean(item),
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
