import type { Insight } from '../../../entities/insight/model/types';
import type {
  DataAvailability,
  MarketNewsItem,
  MarketNewsResponse,
} from '@stock-insight/contracts';

export type ResolvedMarketNewsInsights = {
  insights: Insight[];
  source: MarketNewsResponse['meta']['source'];
  availability: DataAvailability;
  isLiveData: boolean;
};

export function resolveMarketNewsInsights(
  response: MarketNewsResponse | undefined,
  fallbackInsights: Insight[],
): ResolvedMarketNewsInsights {
  if (response?.availability === 'available' && response.meta.source === 'database') {
    return {
      insights: response.data.map(mapMarketNewsItemToInsight),
      source: response.meta.source,
      availability: response.availability,
      isLiveData: true,
    };
  }

  return {
    insights: fallbackInsights,
    source: response?.meta.source ?? 'fallback',
    availability: response?.availability ?? 'collecting',
    isLiveData: false,
  };
}

function mapMarketNewsItemToInsight(item: MarketNewsItem): Insight {
  return {
    id: `market-news-${item.id}`,
    title: item.title,
    context: buildContext(item),
    impact: impactFromMagnitude(item.magnitude),
    icon: iconFromPolarity(item.polarity),
  };
}

function buildContext(item: MarketNewsItem) {
  const affectedNames = item.affectedEntities.map((entity) => entity.name).filter(Boolean);
  const parts = [
    item.market,
    item.sourceName,
    affectedNames.length > 0 ? affectedNames.join(', ') : undefined,
    item.summary,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' · ') : '시장 전체 뉴스';
}

function impactFromMagnitude(magnitude: number | undefined): Insight['impact'] {
  if ((magnitude ?? 0) >= 0.7) return '높음';
  if ((magnitude ?? 0) >= 0.35) return '중간';
  return '낮음';
}

function iconFromPolarity(polarity: MarketNewsItem['polarity']): Insight['icon'] {
  if (polarity === 'positive') return 'bolt';
  if (polarity === 'negative') return 'triangle-alert';
  return 'newspaper';
}
