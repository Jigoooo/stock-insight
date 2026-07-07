import type { PortfolioSnapshot } from '@/entities/portfolio/model/types';
import type { DataAvailability, MeBootstrapResponse, ResponseMeta } from '@stock-insight/contracts';

type Market = 'KR' | 'US';

type PortfolioEntity = {
  entityKey: string;
  market: Market;
  isHolding: boolean;
};

export type ResolvedPortfolio = {
  portfolio: PortfolioSnapshot;
  source: ResponseMeta['source'];
  availability: DataAvailability;
  isLiveData: boolean;
};

function isLiveMeBootstrap(response: MeBootstrapResponse | undefined) {
  return response?.availability === 'available' && response.meta.source === 'database';
}

function hasCompletePositionInput(position: MeBootstrapResponse['data']['positions'][number]) {
  return (
    typeof position.avgPrice === 'number' &&
    Number.isFinite(position.avgPrice) &&
    typeof position.quantity === 'number' &&
    Number.isFinite(position.quantity)
  );
}

function uniquePortfolioEntities(data: MeBootstrapResponse['data']) {
  const entities = new Map<string, PortfolioEntity>();

  for (const item of data.watchlist) {
    entities.set(item.entityKey, {
      entityKey: item.entityKey,
      market: item.market,
      isHolding: false,
    });
  }

  for (const position of data.positions) {
    entities.set(position.entityKey, {
      entityKey: position.entityKey,
      market: position.market,
      isHolding: true,
    });
  }

  return [...entities.values()];
}

function marketFocusLabel(entities: PortfolioEntity[]) {
  const krCount = entities.filter((item) => item.market === 'KR').length;
  const usCount = entities.filter((item) => item.market === 'US').length;
  return `KR ${krCount} · US ${usCount}`;
}

function buildMarketShare(
  entities: PortfolioEntity[],
  fallback: PortfolioSnapshot,
): PortfolioSnapshot['themeShare'] {
  if (entities.length === 0) return fallback.themeShare;

  const marketCounts: Record<Market, number> = {
    KR: entities.filter((item) => item.market === 'KR').length,
    US: entities.filter((item) => item.market === 'US').length,
  };
  const nonEmptyMarkets = [
    { market: 'KR' as const, count: marketCounts.KR, colorRole: 'semiconductor' as const },
    { market: 'US' as const, count: marketCounts.US, colorRole: 'platform' as const },
  ].filter((item) => item.count > 0);
  let remainingShare = 100;

  return nonEmptyMarkets.map((item, index) => {
    const isLast = index === nonEmptyMarkets.length - 1;
    const value = isLast ? remainingShare : Math.round((item.count / entities.length) * 100);
    remainingShare -= value;
    return {
      id: `market-${item.market.toLowerCase()}`,
      label: item.market,
      value,
      colorRole: item.colorRole,
    };
  });
}

function buildLivePortfolio(
  response: MeBootstrapResponse,
  fallback: PortfolioSnapshot,
): PortfolioSnapshot {
  const { positions, watchlist } = response.data;
  const entities = uniquePortfolioEntities(response.data);
  const completePositionCount = positions.filter(hasCompletePositionInput).length;
  const hasIncompletePositions = positions.length > 0 && completePositionCount < positions.length;

  return {
    value: `보유종목 ${positions.length}개 · 관심 ${watchlist.length}개`,
    dailyChange:
      positions.length > 0
        ? `수동 입력 ${completePositionCount}/${positions.length}개 가격·수량 확인 · 주문 기능 없음`
        : `보유 입력 없음 · 관심 ${watchlist.length}개`,
    relatedIssueCount: entities.length,
    focusTheme: marketFocusLabel(entities),
    scheduleCount: positions.length,
    cautionLevel: hasIncompletePositions ? '중간' : '낮음',
    bars: fallback.bars,
    trend: fallback.trend,
    themeShare: buildMarketShare(entities, fallback),
  };
}

export function resolvePortfolioForDashboard(
  response: MeBootstrapResponse | undefined,
  fallback: PortfolioSnapshot,
): ResolvedPortfolio {
  if (response && isLiveMeBootstrap(response)) {
    return {
      portfolio: buildLivePortfolio(response, fallback),
      source: response.meta.source,
      availability: response.availability,
      isLiveData: true,
    };
  }

  return {
    portfolio: fallback,
    source: response?.meta.source ?? 'fallback',
    availability: response?.availability ?? 'collecting',
    isLiveData: false,
  };
}
