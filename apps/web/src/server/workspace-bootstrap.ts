import '@tanstack/react-start/server-only';

import {
  createPostgresDashboardReadModel,
  createPostgresMarketNewsReadModel,
  createPostgresMeBootstrapReadModel,
  createPostgresPortfolioDigestReadModel,
  createPostgresStockReadModel,
  createReadOnlyDatabaseClient,
  getDashboardBootstrap,
  getMarketNews,
  getMeBootstrap,
  getPortfolioDigest,
  getStockList,
  parseServerEnv,
  requireUserScope,
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

export async function loadWorkspaceBootstrapDirect(): Promise<WorkspaceBootstrap> {
  const userScope = requireUserScope(parseServerEnv());
  const db = createReadOnlyDatabaseClient();

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
