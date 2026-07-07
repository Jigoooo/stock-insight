import type {
  DataAvailability,
  PortfolioDigest,
  PortfolioDigestResponse,
  ResponseMeta,
} from '@stock-insight/contracts';

export type ResolvedPortfolioDigest = {
  digest: PortfolioDigest;
  source: ResponseMeta['source'];
  availability: DataAvailability;
  isLiveData: boolean;
};

export const emptyPortfolioDigest: PortfolioDigest = {
  alerts: [],
  exposures: [],
  freshness: [],
  stats: {
    watchlistCount: 0,
    positionCount: 0,
    alertCount: 0,
    changeEventCount: 0,
    freshnessRiskCount: 0,
    nonStockFilteredCount: 0,
  },
};

export function resolvePortfolioDigest(
  response: PortfolioDigestResponse | undefined,
): ResolvedPortfolioDigest {
  if (response?.availability === 'available' && response.meta.source === 'database') {
    return {
      digest: response.data,
      source: response.meta.source,
      availability: response.availability,
      isLiveData: true,
    };
  }

  return {
    digest: emptyPortfolioDigest,
    source: response?.meta.source ?? 'fallback',
    availability: response?.availability ?? 'collecting',
    isLiveData: false,
  };
}
