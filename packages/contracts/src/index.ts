import { z } from 'zod';

const percentTupleSchema = z.tuple([z.string(), z.number()]);
const timelineTupleSchema = z.tuple([z.string(), z.string()]);
const reviewTupleSchema = z.tuple([z.string(), z.string(), z.string()]);

export const dataAvailabilitySchema = z.enum([
  'available',
  'missing',
  'collecting',
  'stale',
  'text_only',
  'unsupported',
  'error',
]);

export type DataAvailability = z.infer<typeof dataAvailabilitySchema>;

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  detail: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const responseMetaSchema = z.object({
  source: z.enum(['mock', 'database', 'fallback']),
  generatedAt: z.string().datetime(),
});

export type ResponseMeta = z.infer<typeof responseMetaSchema>;

export function createApiEnvelopeSchema<TData extends z.ZodType>(dataSchema: TData) {
  return z.object({
    data: dataSchema,
    error: apiErrorSchema.nullable(),
    availability: dataAvailabilitySchema,
    meta: responseMetaSchema,
  });
}

export type ApiEnvelope<TData> = {
  data: TData;
  error: ApiError | null;
  availability: DataAvailability;
  meta: ResponseMeta;
};

export const healthStatusSchema = z.object({
  ok: z.boolean(),
  service: z.string().min(1),
  checkedAt: z.string().datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const companyProfileSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  market: z.string().min(1),
  sector: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const researchInsightSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  riskLabels: z.array(z.string().min(1)),
  publishedAt: z.string().datetime(),
});

export type ResearchInsight = z.infer<typeof researchInsightSchema>;

export const stockIdentitySchema = z.object({
  entityKey: z.string().min(1),
  ticker: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(['KRX', 'KOSDAQ', 'NASDAQ', 'NYSE', 'AMEX', 'UNKNOWN']),
});

export type StockIdentity = z.infer<typeof stockIdentitySchema>;

export const dashboardStockSchema = z.object({
  id: z.string().min(1),
  holding: z.boolean(),
  ticker: z.string().min(1),
  name: z.string().min(1),
  logo: z.string().min(1),
  theme: z.string().min(1),
  price: z.string().min(1),
  change: z.string().min(1),
  stance: z.string().min(1),
  summary: z.string().min(1),
  founded: z.string().min(1),
  hq: z.string().min(1),
  capital: z.string().min(1),
  shares: z.string().min(1),
  marketCap: z.string().min(1),
  sales: z.string().min(1),
  operatingProfit: z.string().min(1),
  debtRatio: z.string().min(1),
  roe: z.string().min(1),
  segments: z.array(percentTupleSchema),
  shareholders: z.array(percentTupleSchema),
  history: z.array(timelineTupleSchema),
  positives: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)),
  review: reviewTupleSchema,
});

export type DashboardStock = z.infer<typeof dashboardStockSchema>;

export const dashboardPortfolioSchema = z.object({
  value: z.string().min(1),
  dailyChange: z.string().min(1),
  relatedIssueCount: z.number().int().nonnegative(),
  focusTheme: z.string().min(1),
  scheduleCount: z.number().int().nonnegative(),
  cautionLevel: z.enum(['낮음', '중간', '높음']),
  bars: z.array(z.number()),
  trend: z.array(z.object({ label: z.string().min(1), value: z.number() })),
  themeShare: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      value: z.number(),
      colorRole: z.enum(['semiconductor', 'infrastructure', 'platform', 'reserve']),
    }),
  ),
});

export type DashboardPortfolio = z.infer<typeof dashboardPortfolioSchema>;

export const dashboardInsightSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  context: z.string().min(1),
  impact: z.enum(['높음', '중간', '낮음']),
  icon: z.enum(['bolt', 'cpu', 'newspaper', 'triangle-alert']),
});

export type DashboardInsight = z.infer<typeof dashboardInsightSchema>;

export const dashboardThemeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  strength: z.number(),
});

export type DashboardTheme = z.infer<typeof dashboardThemeSchema>;

export const dashboardBootstrapSchema = z.object({
  portfolio: dashboardPortfolioSchema,
  insights: z.array(dashboardInsightSchema),
  stocks: z.array(dashboardStockSchema),
  themes: z.array(dashboardThemeSchema),
});

export type DashboardBootstrap = z.infer<typeof dashboardBootstrapSchema>;

export const dashboardResponseSchema = createApiEnvelopeSchema(dashboardBootstrapSchema);

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const apiStockMarketSchema = z.enum(['KR', 'US']);

export type ApiStockMarket = z.infer<typeof apiStockMarketSchema>;

export const stockScopeSchema = z.enum(['watchlist', 'holding', 'discover', 'all']);

export type StockScope = z.infer<typeof stockScopeSchema>;

export const stockAnalysisStatusSchema = z.enum([
  'none',
  'cached',
  'queued',
  'running',
  'failed',
  'stale',
]);

export type StockAnalysisStatus = z.infer<typeof stockAnalysisStatusSchema>;

export const analysisJobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type AnalysisJobStatus = z.infer<typeof analysisJobStatusSchema>;

export const stockListItemSchema = z.object({
  entityKey: z.string().min(1),
  ticker: z.string().min(1),
  market: apiStockMarketSchema,
  name: z.string().min(1),
  displayName: z.string().min(1),
  isWatched: z.boolean(),
  isHolding: z.boolean(),
  latestPrice: z.number().optional(),
  currency: z.enum(['KRW', 'USD']).optional(),
  changePct: z.number().optional(),
  primaryThesis: z.string().min(1).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  analysisStatus: stockAnalysisStatusSchema,
  lastAnalyzedAt: z.string().datetime().optional(),
});

export type StockListItem = z.infer<typeof stockListItemSchema>;

export const stockListQuerySchema = z.object({
  market: apiStockMarketSchema.optional(),
  scope: stockScopeSchema.optional(),
  q: z.string().trim().min(1).optional(),
});

export type StockListQuery = z.infer<typeof stockListQuerySchema>;

export const stockListResponseSchema = createApiEnvelopeSchema(z.array(stockListItemSchema));

export type StockListResponse = z.infer<typeof stockListResponseSchema>;

export const meBootstrapWatchlistItemSchema = z.object({
  entityKey: z.string().min(1),
  ticker: z.string().min(1),
  market: apiStockMarketSchema,
  displayName: z.string().min(1),
  source: z.string().min(1).optional(),
  addedAt: z.string().datetime().optional(),
});

export type MeBootstrapWatchlistItem = z.infer<typeof meBootstrapWatchlistItemSchema>;

export const meBootstrapPositionSchema = z.object({
  entityKey: z.string().min(1),
  ticker: z.string().min(1),
  market: apiStockMarketSchema,
  displayName: z.string().min(1),
  avgPrice: z.number().optional(),
  quantity: z.number().optional(),
  status: z.string().min(1),
  source: z.string().min(1).optional(),
  openedAt: z.string().datetime().optional(),
  closedAt: z.string().datetime().optional(),
});

export type MeBootstrapPosition = z.infer<typeof meBootstrapPositionSchema>;

export const meBootstrapSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
  }),
  watchlist: z.array(meBootstrapWatchlistItemSchema),
  positions: z.array(meBootstrapPositionSchema),
  preferences: z.object({
    defaultMarket: apiStockMarketSchema,
    defaultScope: stockScopeSchema,
  }),
});

export type MeBootstrap = z.infer<typeof meBootstrapSchema>;

export const meBootstrapResponseSchema = createApiEnvelopeSchema(meBootstrapSchema);

export type MeBootstrapResponse = z.infer<typeof meBootstrapResponseSchema>;

export const manualWatchlistInputSchema = z.object({
  market: apiStockMarketSchema,
  ticker: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
});

export type ManualWatchlistInput = z.infer<typeof manualWatchlistInputSchema>;

export const manualPositionInputSchema = manualWatchlistInputSchema.extend({
  avgPrice: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
});

export type ManualPositionInput = z.infer<typeof manualPositionInputSchema>;

export const marketNewsMarketSchema = z.enum(['KR', 'US', 'GLOBAL']);

export type MarketNewsMarket = z.infer<typeof marketNewsMarketSchema>;

export const marketNewsTypeSchema = z.enum(['macro', 'policy', 'news', 'briefing', 'all']);

export type MarketNewsType = z.infer<typeof marketNewsTypeSchema>;

export const marketNewsQuerySchema = z.object({
  market: marketNewsMarketSchema.optional(),
  type: marketNewsTypeSchema.optional(),
});

export type MarketNewsQuery = z.infer<typeof marketNewsQuerySchema>;

export const marketNewsItemSchema = z.object({
  id: z.string().min(1),
  market: marketNewsMarketSchema,
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  sourceName: z.string().min(1).optional(),
  url: z.string().url().optional(),
  publishedAt: z.string().datetime().optional(),
  affectedEntities: z.array(stockIdentitySchema),
  signalType: z.string().min(1).optional(),
  polarity: z.enum(['positive', 'negative', 'neutral']).optional(),
  magnitude: z.number().optional(),
});

export type MarketNewsItem = z.infer<typeof marketNewsItemSchema>;

export const marketNewsResponseSchema = createApiEnvelopeSchema(z.array(marketNewsItemSchema));

export type MarketNewsResponse = z.infer<typeof marketNewsResponseSchema>;

export const portfolioAlertSeveritySchema = z.enum(['low', 'medium', 'high']);

export type PortfolioAlertSeverity = z.infer<typeof portfolioAlertSeveritySchema>;

export const portfolioAlertReasonSchema = z.enum([
  'change_event',
  'feed_change',
  'freshness',
  'exposure',
]);

export type PortfolioAlertReason = z.infer<typeof portfolioAlertReasonSchema>;

export const portfolioDigestAlertSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: portfolioAlertSeveritySchema,
  reason: portfolioAlertReasonSchema,
  entityKey: z.string().min(1).optional(),
  market: apiStockMarketSchema.optional(),
  createdAt: z.string().datetime().optional(),
});

export type PortfolioDigestAlert = z.infer<typeof portfolioDigestAlertSchema>;

export const portfolioExposureKindSchema = z.enum(['market', 'theme', 'macro', 'industry']);

export type PortfolioExposureKind = z.infer<typeof portfolioExposureKindSchema>;

export const portfolioRiskLevelSchema = z.enum(['low', 'medium', 'high']);

export type PortfolioRiskLevel = z.infer<typeof portfolioRiskLevelSchema>;

export const portfolioExposureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: portfolioExposureKindSchema,
  value: z.number().min(0).max(100),
  itemCount: z.number().int().nonnegative(),
  riskLevel: portfolioRiskLevelSchema,
  summary: z.string().min(1),
});

export type PortfolioExposure = z.infer<typeof portfolioExposureSchema>;

export const portfolioFreshnessItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: dataAvailabilitySchema,
  latestAt: z.string().datetime().optional(),
  ageHours: z.number().nonnegative().optional(),
  summary: z.string().min(1),
});

export type PortfolioFreshnessItem = z.infer<typeof portfolioFreshnessItemSchema>;

export const portfolioDigestStatsSchema = z.object({
  watchlistCount: z.number().int().nonnegative(),
  positionCount: z.number().int().nonnegative(),
  alertCount: z.number().int().nonnegative(),
  changeEventCount: z.number().int().nonnegative(),
  freshnessRiskCount: z.number().int().nonnegative(),
  nonStockFilteredCount: z.number().int().nonnegative(),
});

export type PortfolioDigestStats = z.infer<typeof portfolioDigestStatsSchema>;

export const portfolioDigestSchema = z.object({
  alerts: z.array(portfolioDigestAlertSchema),
  exposures: z.array(portfolioExposureSchema),
  freshness: z.array(portfolioFreshnessItemSchema),
  stats: portfolioDigestStatsSchema,
});

export type PortfolioDigest = z.infer<typeof portfolioDigestSchema>;

export const portfolioDigestResponseSchema = createApiEnvelopeSchema(portfolioDigestSchema);

export type PortfolioDigestResponse = z.infer<typeof portfolioDigestResponseSchema>;

export const discoverStocksReasonSchema = z.enum([
  'all',
  'watchlist_related',
  'market_momentum',
  'new_candidate',
]);

export type DiscoverStocksReason = z.infer<typeof discoverStocksReasonSchema>;

export const discoverStocksQuerySchema = z.object({
  market: apiStockMarketSchema.optional(),
  reason: discoverStocksReasonSchema.optional(),
});

export type DiscoverStocksQuery = z.infer<typeof discoverStocksQuerySchema>;

export const sourceLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

export type SourceLink = z.infer<typeof sourceLinkSchema>;

export const stockCompanyProfileSchema = z.object({
  status: dataAvailabilitySchema,
  symbol: z.string().min(1).optional(),
  market: apiStockMarketSchema.optional(),
  name: z.string().min(1).optional(),
  sector: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  summaryText: z.string().min(1).optional(),
  sources: z.array(sourceLinkSchema),
  capturedAt: z.string().datetime().optional(),
});

export type StockCompanyProfile = z.infer<typeof stockCompanyProfileSchema>;

export const stockCompanyMetricSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1).optional(),
});

export type StockCompanyMetric = z.infer<typeof stockCompanyMetricSchema>;

export const stockCompanyMetricGroupSchema = z.object({
  metricGroup: z.string().min(1),
  fiscalYear: z.number().int().optional(),
  fiscalPeriod: z.string().min(1).optional(),
  currency: z.enum(['KRW', 'USD']).optional(),
  availability: dataAvailabilitySchema,
  reportedAt: z.string().datetime().optional(),
  sources: z.array(sourceLinkSchema),
  metrics: z.array(stockCompanyMetricSchema),
});

export type StockCompanyMetricGroup = z.infer<typeof stockCompanyMetricGroupSchema>;

export const stockLearningCardSchema = z.object({
  cardKey: z.string().min(1),
  section: z.string().min(1),
  title: z.string().min(1),
  bodyMarkdown: z.string().min(1).optional(),
  bullets: z.array(z.string().min(1)),
  availability: dataAvailabilitySchema,
  sources: z.array(sourceLinkSchema),
  updatedAt: z.string().datetime().optional(),
});

export type StockLearningCard = z.infer<typeof stockLearningCardSchema>;

export const entityGlossaryTermSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
  sources: z.array(sourceLinkSchema),
});

export type EntityGlossaryTerm = z.infer<typeof entityGlossaryTermSchema>;

export const stockAnalysisJobSchema = z.object({
  id: z.string().min(1),
  status: analysisJobStatusSchema,
  progressPct: z.number().min(0).max(100).optional(),
  queuedAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().min(1).optional(),
});

export type StockAnalysisJob = z.infer<typeof stockAnalysisJobSchema>;

export const discoverReasonTypeSchema = z.enum([
  'direct',
  'related',
  'indirect',
  'market_candidate',
]);

export type DiscoverReasonType = z.infer<typeof discoverReasonTypeSchema>;

export const discoverStockItemSchema = z.object({
  entityKey: z.string().min(1),
  ticker: z.string().min(1),
  market: apiStockMarketSchema,
  name: z.string().min(1),
  reasonType: discoverReasonTypeSchema,
  reasonTitle: z.string().min(1),
  reasonSummary: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  relatedToMyStocks: z.array(stockIdentitySchema).optional(),
  topRisks: z.array(z.string().min(1)),
  checkpoints: z.array(z.string().min(1)),
  sourceCount: z.number().int().nonnegative(),
  sources: z.array(sourceLinkSchema),
  canStartAnalysis: z.boolean(),
  analysisStatus: stockAnalysisStatusSchema,
});

export type DiscoverStockItem = z.infer<typeof discoverStockItemSchema>;

export const discoverStocksResponseSchema = createApiEnvelopeSchema(
  z.array(discoverStockItemSchema),
);

export type DiscoverStocksResponse = z.infer<typeof discoverStocksResponseSchema>;

export const stockDetailSchema = z.object({
  stock: stockListItemSchema,
  latestSnapshot: z
    .object({
      price: z.number(),
      currency: z.enum(['KRW', 'USD']),
      changePct: z.number().optional(),
      capturedAt: z.string().datetime(),
    })
    .optional(),
  deepReport: z.object({
    status: dataAvailabilitySchema,
    reportMarkdown: z.string().min(1).optional(),
    researchedAt: z.string().datetime().optional(),
    sources: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).default([]),
  }),
  relatedNews: z.array(dashboardInsightSchema),
  risks: z.array(z.string().min(1)),
  checkpoints: z.array(z.string().min(1)),
  companyProfile: stockCompanyProfileSchema.optional(),
  companyMetrics: z.array(stockCompanyMetricGroupSchema).optional(),
  learningCards: z.array(stockLearningCardSchema).optional(),
  glossaryTerms: z.array(entityGlossaryTermSchema).optional(),
  analysisJob: stockAnalysisJobSchema.optional(),
});

export type StockDetail = z.infer<typeof stockDetailSchema>;

export const stockDetailResponseSchema = createApiEnvelopeSchema(stockDetailSchema.nullable());

export type StockDetailResponse = z.infer<typeof stockDetailResponseSchema>;

export const priceSeriesRangeSchema = z.enum(['1M', '3M', '6M', '1Y']);

export type PriceSeriesRange = z.infer<typeof priceSeriesRangeSchema>;

export const priceBarSchema = z.object({
  ts: z.string().datetime(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable(),
});

export type PriceBar = z.infer<typeof priceBarSchema>;

export const priceSeriesSchema = z.object({
  entityKey: z.string().min(1),
  market: apiStockMarketSchema,
  ticker: z.string().min(1),
  currency: z.enum(['KRW', 'USD']),
  timeframe: z.literal('1D'),
  range: priceSeriesRangeSchema,
  asOf: z.string().datetime().nullable(),
  bars: z.array(priceBarSchema).max(400),
});

export type PriceSeries = z.infer<typeof priceSeriesSchema>;

export const priceSeriesResponseSchema = createApiEnvelopeSchema(priceSeriesSchema.nullable());

export type PriceSeriesResponse = z.infer<typeof priceSeriesResponseSchema>;
