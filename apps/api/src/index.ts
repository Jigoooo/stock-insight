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
export { claimMutation, completeMutation, hashMutationRequest } from './mutations/idempotency';
export type {
  ExecuteMutationClaim,
  MutationClaim,
  MutationIdempotencyExecutor,
} from './mutations/idempotency';
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
export { getEntityRelations } from './relations/read-model';
export type { GetEntityRelationsOptions, RelationGraphQueryExecutor } from './relations/read-model';
export { getDecisionHistory } from './history/read-model';
export type { DecisionHistoryQueryExecutor, GetDecisionHistoryOptions } from './history/read-model';
export { getMyResearchOverview } from './my-research/read-model';
export type {
  GetMyResearchOverviewOptions,
  MyResearchQueryExecutor,
} from './my-research/read-model';
export { getRadarSignals } from './radar/read-model';
export type { GetRadarSignalsOptions, RadarSignalQueryExecutor } from './radar/read-model';
export { getThemeResearchList } from './themes/read-model';
export type { GetThemeResearchListOptions, ThemeResearchQueryExecutor } from './themes/read-model';
export { getSystemStatus } from './status/read-model';
export type { GetSystemStatusOptions, SystemStatusQueryExecutor } from './status/read-model';
export { getResearchRecordDetail } from './workspace/record-detail';
export type {
  GetResearchRecordDetailOptions,
  RecordDetailRowQueryExecutor,
} from './workspace/record-detail';
export { getResearchFeedPage, getWorkspaceToday } from './workspace/read-model';
export type {
  GetResearchFeedPageOptions,
  GetWorkspaceTodayOptions,
  WorkspaceRowQueryExecutor,
} from './workspace/read-model';
export {
  createDatabaseClient,
  createReadOnlyDatabaseClient,
  parseServerEnv,
  requireUserScope,
} from './server';
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
  StockDatabaseRow,
  StockReadModel,
  StockRowQueryExecutor,
} from './stocks';
export type {
  DatabaseClient,
  ReadOnlyDatabaseClient,
  ReadSnapshotExecutor,
  ReadSnapshotOptions,
  ServerEnv,
  UserScope,
} from './server';

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
