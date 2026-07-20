import '@tanstack/react-start/server-only';

import {
  createPostgresDashboardReadModel,
  createPostgresMarketNewsReadModel,
  createPostgresMeBootstrapReadModel,
  createPostgresPortfolioDigestReadModel,
  createPostgresStockReadModel,
  createScopedReadOnlyDatabaseClient,
  getDashboardBootstrap,
  getMarketNews,
  getMeBootstrap,
  getPortfolioDigest,
  getStockList,
  parseServerEnv,
  type StockDatabaseRow,
} from '@stock-insight/api';
import type {
  DashboardResponse,
  MarketNewsResponse,
  MeBootstrapResponse,
  PortfolioDigestResponse,
  StockListResponse,
} from '@stock-insight/contracts';

export type WorkspaceBootstrap = {
  dashboardResponse: DashboardResponse;
  marketNewsResponse: MarketNewsResponse;
  meBootstrapResponse: MeBootstrapResponse;
  portfolioDigestResponse: PortfolioDigestResponse;
  stockListResponse: StockListResponse;
};

export async function loadWorkspaceBootstrapDirect(userId: string): Promise<WorkspaceBootstrap> {
  const userScope = { userId };
  const db = createScopedReadOnlyDatabaseClient(userId, parseServerEnv());

  if (db.kind === 'disabled') {
    const [
      dashboardResponse,
      marketNewsResponse,
      meBootstrapResponse,
      portfolioDigestResponse,
      stockListResponse,
    ] = await Promise.all([
      getDashboardBootstrap(),
      getMarketNews(),
      getMeBootstrap(),
      getPortfolioDigest(),
      getStockList(),
    ]);

    return {
      dashboardResponse,
      marketNewsResponse,
      meBootstrapResponse,
      portfolioDigestResponse,
      stockListResponse,
    };
  }

  const [
    dashboardResponse,
    marketNewsResponse,
    meBootstrapResponse,
    portfolioDigestResponse,
    stockListResponse,
  ] = await Promise.all([
    getDashboardBootstrap({
      readModel: createPostgresDashboardReadModel(
        (sql, params) => db.queryRows(sql, params),
        userScope,
      ),
    }),
    getMarketNews({
      readModel: createPostgresMarketNewsReadModel((sql, params) => db.queryRows(sql, params)),
    }),
    getMeBootstrap({
      readModel: createPostgresMeBootstrapReadModel(
        (sql, params) => db.queryRows(sql, params),
        userScope,
      ),
    }),
    getPortfolioDigest({
      readModel: createPostgresPortfolioDigestReadModel(
        (sql, params) => db.queryRows(sql, params),
        userScope,
      ),
    }),
    getStockList({
      readModel: createPostgresStockReadModel(
        (sql, params) => db.queryRows<StockDatabaseRow>(sql, params),
        userScope,
      ),
    }),
  ]);

  return {
    dashboardResponse,
    marketNewsResponse,
    meBootstrapResponse,
    portfolioDigestResponse,
    stockListResponse,
  };
}
