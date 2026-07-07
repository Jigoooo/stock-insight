import { healthStatusSchema, type HealthStatus } from '@stock-insight/contracts';
import { additiveAppMigrations } from '@stock-insight/db-schema';

export {
  createFallbackDashboardReadModel,
  createPostgresDashboardReadModel,
  getDashboardBootstrap,
} from './dashboard';
export {
  createFallbackDiscoverStocksReadModel,
  createPostgresDiscoverStocksReadModel,
  getDiscoverStocks,
} from './discover';
export type {
  DiscoverStocksReadModel,
  DiscoverStocksRowQueryExecutor,
  GetDiscoverStocksOptions,
} from './discover';
export {
  createFallbackMarketNewsReadModel,
  createPostgresMarketNewsReadModel,
  getMarketNews,
} from './market-news';
export {
  createPostgresManualPortfolioWriteModel,
  createFallbackMeBootstrapReadModel,
  createPostgresMeBootstrapReadModel,
  getManualPortfolioBootstrapAfterMutation,
  getMeBootstrap,
} from './me';
export {
  createFallbackPortfolioDigestReadModel,
  createPostgresPortfolioDigestReadModel,
  getPortfolioDigest,
} from './portfolio';
export {
  createFallbackStockReadModel,
  createPostgresStockReadModel,
  getStockDetail,
  getStockList,
} from './stocks';
export { createDatabaseClient, createReadOnlyDatabaseClient, parseServerEnv } from './server';
export type {
  DashboardReadModel,
  DashboardRowQueryExecutor,
  GetDashboardBootstrapOptions,
} from './dashboard';
export type {
  GetMarketNewsOptions,
  MarketNewsReadModel,
  MarketNewsRowQueryExecutor,
} from './market-news';
export type {
  GetMeBootstrapOptions,
  ManualPortfolioWriteExecutor,
  ManualPortfolioWriteModel,
  MeBootstrapReadModel,
  MeBootstrapRowQueryExecutor,
} from './me';
export type {
  GetPortfolioDigestOptions,
  PortfolioDigestReadModel,
  PortfolioDigestRowQueryExecutor,
} from './portfolio';
export type {
  GetStockDetailOptions,
  GetStockListOptions,
  StockReadModel,
  StockRowQueryExecutor,
} from './stocks';
export type { DatabaseClient, ReadOnlyDatabaseClient, ServerEnv } from './server';

export function getHealthStatus(now = new Date()): HealthStatus {
  return healthStatusSchema.parse({
    ok: true,
    service: 'stock-insight-api',
    checkedAt: now.toISOString(),
  });
}

export function listAppMigrations() {
  return additiveAppMigrations;
}
