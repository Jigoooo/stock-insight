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
export {
  createFallbackPriceSeriesReadModel,
  createPostgresPriceSeriesReadModel,
  getPriceSeries,
} from './prices/read-model';
export type {
  GetPriceSeriesOptions,
  PriceSeriesDatabaseRow,
  PriceSeriesReadModel,
  PriceSeriesRowQueryExecutor,
} from './prices/read-model';
export { getEntityRelationsWithV2Preference } from './relations/entity-relation-adapter';
export type {
  EntityRelationAdapterResult,
  EntityRelationSourceExecutor,
  GetEntityRelationsWithV2Options,
} from './relations/entity-relation-adapter';
export { getServableContentPack } from './relations/graph-read-model-v2';
export type {
  ContentPackQueryExecutor,
  ContentPackReadResult,
  ServedContentPack,
} from './relations/graph-read-model-v2';
export { getDecisionHistory } from './history/read-model';
export type { DecisionHistoryQueryExecutor, GetDecisionHistoryOptions } from './history/read-model';
export { getMyResearchOverview } from './my-research/read-model';
export type {
  GetMyResearchOverviewOptions,
  MyResearchQueryExecutor,
} from './my-research/read-model';
export { getRadarSignals } from './radar/read-model';
export type { GetRadarSignalsOptions, RadarSignalQueryExecutor } from './radar/read-model';
export { getGeoMvtTile, getGeoSnapshot } from './geo/read-model';
export type {
  GetGeoMvtTileOptions,
  GetGeoSnapshotOptions,
  GeoSnapshotQueryExecutor,
} from './geo/read-model';
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
  getCalibrationScorecard,
  getFeatureSnapshots,
  getImpactSummaries,
  getLatestReports,
  getMarketConfirmations,
  getPersonalizedFeed,
  normalizeProductLimitParam,
  normalizeProductTextParam,
} from './product/read-model';
export type { ProductListOptions, ProductQueryExecutor } from './product/read-model';
export {
  DECISION_REASON_CODES,
  compileDecisionRuntimePacket,
} from './personalization/decision-runtime';
export type {
  DecisionReasonCode,
  DecisionRuntimeInput,
  DecisionRuntimePacket,
  ThesisState,
} from './personalization/decision-runtime';
export { buildDynamicProbabilityContext } from './personalization/dynamic-probability-model';
export type {
  DynamicProbabilityModelInput,
  DynamicProbabilityModelResult,
  DynamicProbabilityRuntimeContext,
} from './personalization/dynamic-probability-model';
export { optimizeConvexPortfolio } from './personalization/multi-asset-optimizer';
export type {
  ExposureConstraintKind,
  MultiAssetOptimizerInput,
  MultiAssetOptimizerResult,
} from './personalization/multi-asset-optimizer';
export { optimizeTargetWeight } from './personalization/portfolio-optimizer';
export type {
  ConvexTargetOptimizerInput,
  ConvexTargetOptimizerResult,
  OptimizerBindingConstraint,
} from './personalization/portfolio-optimizer';
export { getPersonalizationPortfolioSnapshot } from './personalization/portfolio-read-model';
export type {
  GetPersonalizationPortfolioSnapshotOptions,
  PersonalizationQueryExecutor,
} from './personalization/portfolio-read-model';
export { getPersonalizationPortfolioImpact } from './personalization/impact-read-model';
export type {
  GetPersonalizationPortfolioImpactOptions,
  PersonalizationImpactQueryExecutor,
} from './personalization/impact-read-model';
export {
  getPersonalizationDecisionHistory,
  getPersonalizationDecisionSupport,
} from './personalization/decision-read-model';
export type {
  GetPersonalizationDecisionHistoryOptions,
  GetPersonalizationDecisionOptions,
  PersonalizationDecisionQueryExecutor,
} from './personalization/decision-read-model';
export { appendUserThesisRevision, getPersonalizationThesis } from './personalization/thesis-model';
export type {
  AppendUserThesisRevisionOptions,
  GetPersonalizationThesisOptions,
  PersonalizationThesisExecutor,
} from './personalization/thesis-model';
export { evaluatePersonalizationReleaseGate } from './personalization/evaluation-gate';
export type {
  EvaluatePersonalizationReleaseGateInput,
  PersonalizationEvaluationMetrics,
  PersonalizationEvaluationPolicy,
} from './personalization/evaluation-gate';
export { retrieveEventCandidates } from './experimental/eventrag-retriever';
export type {
  EventRagEntityEdge,
  EventRagEvent,
  EventRagEventEdge,
  EventRagInput,
  EventRagPathStep,
  EventRagResult,
} from './experimental/eventrag-retriever';
export { rankGraphCandidates } from './experimental/graph-candidate-ranker';
export type {
  GraphCandidateRankingResult,
  GraphRankingMethod,
} from './experimental/graph-candidate-ranker';
export { compileCausalDiscoveryCandidates } from './experimental/causal-discovery-candidate';
export type { CausalDiscoveryCandidateResult } from './experimental/causal-discovery-candidate';
export { runSequentialConformal } from './experimental/sequential-conformal';
export type { SequentialConformalResult } from './experimental/sequential-conformal';
export { evaluateContentRankingPolicy } from './experimental/contextual-bandit-ope';
export type { BanditOpeResult } from './experimental/contextual-bandit-ope';
export { evaluatePolicySandbox } from './experimental/policy-sandbox-gate';
export type {
  PolicySandboxFailedGate,
  PolicySandboxResult,
} from './experimental/policy-sandbox-gate';
export { compileFacilityCandidates } from './experimental/remote-sensing-candidate';
export type {
  RemoteSensingCandidateResult,
  RemoteSensingFacilityKind,
} from './experimental/remote-sensing-candidate';
export { appendShadowExperimentArtifact } from './experimental/shadow-artifact-writer';
export type {
  AppendShadowArtifactResult,
  ShadowArtifactQueryExecutor,
} from './experimental/shadow-artifact-writer';
export { compileCryptoIdentityKey } from './crypto/identity-key';
export type { CryptoEntityKind, CryptoIdentityKeyResult } from './crypto/identity-key';
export { compileCryptoTruthEvent } from './crypto/truth-event';
export type {
  CryptoEventLifecycleState,
  CryptoEventParticipantRole,
  CryptoFinalityState,
  CryptoTruthEventResult,
  CryptoTruthEventType,
} from './crypto/truth-event';
export {
  createDatabaseClient,
  createReadOnlyDatabaseClient,
  createScopedDatabaseClient,
  createScopedReadOnlyDatabaseClient,
  createSignupDatabaseClient,
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
