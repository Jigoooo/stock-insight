import {
  dashboardResponseSchema,
  discoverStocksResponseSchema,
  healthStatusSchema,
  marketNewsResponseSchema,
  meBootstrapResponseSchema,
  portfolioDigestResponseSchema,
  stockDetailResponseSchema,
  stockListResponseSchema,
  type DashboardResponse,
  type DiscoverStocksQuery,
  type DiscoverStocksResponse,
  type HealthStatus,
  type MarketNewsQuery,
  type MarketNewsResponse,
  type MeBootstrapResponse,
  type PortfolioDigestResponse,
  type StockDetailResponse,
  type StockListQuery,
  type StockListResponse,
} from '@stock-insight/contracts';

type ManualWatchlistInput = {
  market: 'KR' | 'US';
  ticker: string;
  displayName?: string;
};

type ManualPositionInput = ManualWatchlistInput & {
  avgPrice?: number;
  quantity?: number;
};

export type ApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '';
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  function buildUrl(path: string, query?: Record<string, string | undefined>) {
    const url = new URL(`${baseUrl}${path}`, 'http://stock-insight.local');
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value) url.searchParams.set(key, value);
    }

    if (baseUrl) {
      return url.toString();
    }

    return `${url.pathname}${url.search}`;
  }

  return {
    async health(): Promise<HealthStatus> {
      const response = await fetcher(`${baseUrl}/api/health`);
      if (!response.ok) {
        throw new Error(`Health check failed with ${response.status}`);
      }

      return healthStatusSchema.parse(await response.json());
    },
    async dashboard(): Promise<DashboardResponse> {
      const response = await fetcher(`${baseUrl}/api/dashboard/today`);
      if (!response.ok) {
        throw new Error(`Dashboard bootstrap failed with ${response.status}`);
      }

      return dashboardResponseSchema.parse(await response.json());
    },
    async meBootstrap(): Promise<MeBootstrapResponse> {
      const response = await fetcher(`${baseUrl}/api/me/bootstrap`);
      if (!response.ok) {
        throw new Error(`Me bootstrap failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async upsertWatchlist(input: ManualWatchlistInput): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl('/api/watchlist'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Watchlist upsert failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async removeWatchlist(entityKey: string): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl(`/api/watchlist/${encodeURIComponent(entityKey)}`), {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Watchlist remove failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async upsertPosition(input: ManualPositionInput): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl('/api/positions'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Position upsert failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async closePosition(entityKey: string): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl(`/api/positions/${encodeURIComponent(entityKey)}`), {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Position close failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async marketNews(query: MarketNewsQuery = {}): Promise<MarketNewsResponse> {
      const response = await fetcher(
        buildUrl('/api/market-news', {
          market: query.market,
          type: query.type,
        }),
      );
      if (!response.ok) {
        throw new Error(`Market news failed with ${response.status}`);
      }

      return marketNewsResponseSchema.parse(await response.json());
    },
    async portfolioDigest(): Promise<PortfolioDigestResponse> {
      const response = await fetcher(buildUrl('/api/portfolio/digest'));
      if (!response.ok) {
        throw new Error(`Portfolio digest failed with ${response.status}`);
      }

      return portfolioDigestResponseSchema.parse(await response.json());
    },
    async discoverStocks(query: DiscoverStocksQuery = {}): Promise<DiscoverStocksResponse> {
      const response = await fetcher(
        buildUrl('/api/discover/stocks', {
          market: query.market,
          reason: query.reason,
        }),
      );
      if (!response.ok) {
        throw new Error(`Discover stocks failed with ${response.status}`);
      }

      return discoverStocksResponseSchema.parse(await response.json());
    },
    async stocks(query: StockListQuery = {}): Promise<StockListResponse> {
      const response = await fetcher(
        buildUrl('/api/stocks', {
          market: query.market,
          scope: query.scope,
          q: query.q,
        }),
      );
      if (!response.ok) {
        throw new Error(`Stock list failed with ${response.status}`);
      }

      return stockListResponseSchema.parse(await response.json());
    },
    async stockDetail(entityKey: string): Promise<StockDetailResponse> {
      const response = await fetcher(buildUrl(`/api/stocks/${encodeURIComponent(entityKey)}`));
      if (!response.ok) {
        throw new Error(`Stock detail failed with ${response.status}`);
      }

      return stockDetailResponseSchema.parse(await response.json());
    },
  };
}
