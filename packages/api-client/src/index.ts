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
  type ManualPositionInput,
  type ManualWatchlistInput,
  type MarketNewsResponse,
  type MeBootstrapResponse,
  type PortfolioDigestResponse,
  type StockDetailResponse,
  type StockListQuery,
  type StockListResponse,
} from '@stock-insight/contracts';
import {
  decisionHistoryPageSchema,
  entityRelationGraphSchema,
  myResearchOverviewSchema,
  radarSignalPageSchema,
  researchFeedPageSchema,
  researchRecordDetailSchema,
  systemStatusSchema,
  themeResearchListSchema,
  workspaceTodaySchema,
  type DecisionHistoryPage,
  type EntityRelationGraph,
  type MyResearchOverview,
  type RadarSignalPage,
  type ResearchFeedLaneId,
  type ResearchFeedPage,
  type ResearchRecordDetail,
  type SystemStatus,
  type ThemeResearchList,
  type WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type ApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export type MutationRequestOptions = {
  idempotencyKey?: string;
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

  function mutationHeaders(
    options: MutationRequestOptions,
    includeJsonContentType = false,
  ): Record<string, string> {
    const idempotencyKey = options.idempotencyKey ?? globalThis.crypto.randomUUID();
    return {
      ...(includeJsonContentType ? { 'content-type': 'application/json' } : {}),
      'idempotency-key': idempotencyKey,
    };
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
    async upsertWatchlist(
      input: ManualWatchlistInput,
      options: MutationRequestOptions = {},
    ): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl('/api/watchlist'), {
        method: 'POST',
        headers: mutationHeaders(options, true),
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Watchlist upsert failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async removeWatchlist(
      entityKey: string,
      options: MutationRequestOptions = {},
    ): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl(`/api/watchlist/${encodeURIComponent(entityKey)}`), {
        method: 'DELETE',
        headers: mutationHeaders(options),
      });
      if (!response.ok) {
        throw new Error(`Watchlist remove failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async upsertPosition(
      input: ManualPositionInput,
      options: MutationRequestOptions = {},
    ): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl('/api/positions'), {
        method: 'POST',
        headers: mutationHeaders(options, true),
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Position upsert failed with ${response.status}`);
      }

      return meBootstrapResponseSchema.parse(await response.json());
    },
    async closePosition(
      entityKey: string,
      options: MutationRequestOptions = {},
    ): Promise<MeBootstrapResponse> {
      const response = await fetcher(buildUrl(`/api/positions/${encodeURIComponent(entityKey)}`), {
        method: 'DELETE',
        headers: mutationHeaders(options),
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
    async researchWorkspace(): Promise<WorkspaceToday> {
      const response = await fetcher(buildUrl('/api/workspace'));
      if (!response.ok) throw new Error(`Research workspace failed with ${response.status}`);
      return workspaceTodaySchema.parse(await response.json());
    },
    async researchFeed(
      options: {
        lane?: ResearchFeedLaneId;
        cursor?: string;
        limit?: number;
      } = {},
    ): Promise<ResearchFeedPage> {
      const response = await fetcher(
        buildUrl('/api/feed', {
          lane: options.lane,
          cursor: options.cursor,
          limit: options.limit === undefined ? undefined : String(options.limit),
        }),
      );
      if (!response.ok) throw new Error(`Research feed failed with ${response.status}`);
      return researchFeedPageSchema.parse(await response.json());
    },
    async researchRecord(
      recordKey: string,
      snapshot?: { analysisRunId: string; analysisRevision: number },
    ): Promise<ResearchRecordDetail> {
      const response = await fetcher(
        buildUrl(`/api/records/${encodeURIComponent(recordKey)}`, {
          analysisRunId: snapshot?.analysisRunId,
          analysisRevision: snapshot === undefined ? undefined : String(snapshot.analysisRevision),
        }),
      );
      if (!response.ok) throw new Error(`Research record failed with ${response.status}`);
      return researchRecordDetailSchema.parse(await response.json());
    },
    async researchStatus(): Promise<SystemStatus> {
      const response = await fetcher(buildUrl('/api/status'));
      if (!response.ok) throw new Error(`Research status failed with ${response.status}`);
      return systemStatusSchema.parse(await response.json());
    },
    async decisionHistory(
      options: {
        cursor?: string;
        limit?: number;
      } = {},
    ): Promise<DecisionHistoryPage> {
      const response = await fetcher(
        buildUrl('/api/history', {
          cursor: options.cursor,
          limit: options.limit === undefined ? undefined : String(options.limit),
        }),
      );
      if (!response.ok) throw new Error(`Decision history failed with ${response.status}`);
      return decisionHistoryPageSchema.parse(await response.json());
    },
    async radarSignals(
      options: {
        cursor?: string;
        limit?: number;
      } = {},
    ): Promise<RadarSignalPage> {
      const response = await fetcher(
        buildUrl('/api/radar', {
          cursor: options.cursor,
          limit: options.limit === undefined ? undefined : String(options.limit),
        }),
      );
      if (!response.ok) throw new Error(`Radar signals failed with ${response.status}`);
      return radarSignalPageSchema.parse(await response.json());
    },
    async themeResearch(): Promise<ThemeResearchList> {
      const response = await fetcher(buildUrl('/api/themes'));
      if (!response.ok) throw new Error(`Theme research failed with ${response.status}`);
      return themeResearchListSchema.parse(await response.json());
    },
    async myResearch(): Promise<MyResearchOverview> {
      const response = await fetcher(buildUrl('/api/my-research'));
      if (!response.ok) throw new Error(`My Research failed with ${response.status}`);
      return myResearchOverviewSchema.parse(await response.json());
    },
    async entityRelations(
      entityKey: string,
      depth = 1,
      snapshot?: { analysisRunId: string; analysisRevision: number },
    ): Promise<EntityRelationGraph> {
      const response = await fetcher(
        buildUrl(`/api/entities/${encodeURIComponent(entityKey)}/relations`, {
          depth: String(depth),
          analysisRunId: snapshot?.analysisRunId,
          analysisRevision: snapshot === undefined ? undefined : String(snapshot.analysisRevision),
        }),
      );
      if (!response.ok) throw new Error(`Entity relations failed with ${response.status}`);
      return entityRelationGraphSchema.parse(await response.json());
    },
  };
}
