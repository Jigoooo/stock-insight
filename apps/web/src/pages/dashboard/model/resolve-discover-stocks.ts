import type {
  DataAvailability,
  DiscoverStockItem,
  DiscoverStocksResponse,
  ResponseMeta,
} from '@stock-insight/contracts';

export type ResolvedDiscoverStocksForDashboard = {
  availability: DataAvailability;
  candidates: DiscoverStockItem[];
  isLiveData: boolean;
  source: ResponseMeta['source'];
};

export function resolveDiscoverStocksForDashboard(
  response: DiscoverStocksResponse | undefined,
): ResolvedDiscoverStocksForDashboard {
  return {
    availability: response?.availability ?? 'collecting',
    candidates: response?.data ?? [],
    isLiveData: response?.availability === 'available' && response.meta.source === 'database',
    source: response?.meta.source ?? 'fallback',
  };
}
