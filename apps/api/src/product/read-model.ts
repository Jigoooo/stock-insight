import {
  calibrationScorecardResponseSchema,
  featureSnapshotResponseSchema,
  impactSummaryResponseSchema,
  latestReportsResponseSchema,
  marketConfirmationResponseSchema,
  personalizedFeedResponseSchema,
  type CalibrationScorecardResponse,
  type FeatureSnapshotResponse,
  type ImpactSummaryResponse,
  type LatestReportsResponse,
  type MarketConfirmationResponse,
  type PersonalizedFeedResponse,
  type ResponseMeta,
} from '@stock-insight/contracts';

import type { UserScope } from '../server';

export type ProductQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type ProductListOptions = {
  entityKey?: string;
  limit?: number;
  now?: Date;
};

const FEATURE_SQL = `
SELECT ident.identifier_value AS entity_key,
       feature.market, feature.ticker, feature.as_of, feature.feature_set_version,
       feature.features, feature.completeness_score
FROM serving.latest_feature_snapshot_v1 feature
JOIN core.entity_identifier ident
  ON ident.entity_id = feature.asset_entity_id
 AND ident.identifier_type = 'INTERNAL_KEY'
WHERE ($1::text IS NULL OR ident.identifier_value = $1::text)
ORDER BY feature.market, feature.ticker
LIMIT $2::int
`;

const IMPACT_SQL = `
SELECT ident.identifier_value AS entity_key,
       impact.market, impact.ticker, impact.path_count, impact.max_path_score,
       impact.avg_path_score, impact.event_types, impact.computed_at
FROM serving.impact_summary_v1 impact
JOIN core.entity_identifier ident
  ON ident.entity_id = impact.asset_entity_id
 AND ident.identifier_type = 'INTERNAL_KEY'
WHERE ($1::text IS NULL OR ident.identifier_value = $1::text)
ORDER BY impact.max_path_score DESC, impact.market, impact.ticker
LIMIT $2::int
`;

const CONFIRMATION_SQL = `
SELECT ident.identifier_value AS entity_key,
       confirmation.market, confirmation.ticker, confirmation.as_of,
       confirmation.industry_link_strength, confirmation.path_count,
       confirmation.ret_20d, confirmation.volume_z_20d,
       confirmation.market_confirmation, confirmation.rsi_14,
       confirmation.ma20_gap, confirmation.expectation_priced_in
FROM serving.market_confirmation_v1 confirmation
JOIN core.entity_identifier ident
  ON ident.entity_id = confirmation.asset_entity_id
 AND ident.identifier_type = 'INTERNAL_KEY'
WHERE ($1::text IS NULL OR ident.identifier_value = $1::text)
ORDER BY confirmation.industry_link_strength DESC, confirmation.market, confirmation.ticker
LIMIT $2::int
`;

const FEED_SQL = `
SELECT feed.rank, feed.item_type, feed.item_id, feed.relevance_score,
       feed.explanation_codes,
       coalesce(report.title, event.summary_text, path_event.summary_text,
                '연결 영향 경로') AS title,
       coalesce(report.summary, event.summary_text, path_event.summary_text, '') AS summary
FROM personalization.user_feed_item feed
JOIN personalization.user_profile profile ON profile.user_id = feed.user_id
LEFT JOIN content.report report
  ON feed.item_type = 'report' AND report.report_id = feed.item_id
LEFT JOIN knowledge.event event
  ON feed.item_type = 'event' AND event.event_id = feed.item_id
LEFT JOIN analytics.impact_path path
  ON feed.item_type = 'impact_path' AND path.impact_path_id = feed.item_id
LEFT JOIN knowledge.event path_event ON path_event.event_id = path.trigger_event_id
WHERE feed.user_id = $1::uuid
  AND feed.feed_date = coalesce(
    $2::date,
    (now() AT TIME ZONE profile.timezone)::date
  )
ORDER BY feed.rank
LIMIT 100
`;

const LABEL_SCORECARD_SQL = `
SELECT market, horizon_days, confidence_label, sample_n,
       target_hit_rate, invalidation_rate, direction_hit_rate,
       insufficient_sample, method, computed_at
FROM serving.forecast_scorecard_v1
ORDER BY market, horizon_days, confidence_label
`;

const PROBABILITY_SCORECARD_SQL = `
SELECT evaluation_mode, market, horizon_days, probability_method, sample_n,
       brier_score, log_loss, expected_calibration_error,
       calibration_bins, insufficient_sample, computed_at
FROM serving.probability_scorecard_v1
ORDER BY evaluation_mode, market, horizon_days, probability_method
`;

const REPORTS_SQL = `
SELECT report.report_id, pointer.report_type, pointer.scope_key,
       report.title, report.summary, report.status, report.quality_score,
       report.published_at, pointer.switched_at
FROM serving.latest_report_pointer pointer
JOIN content.report report ON report.report_id = pointer.report_id
WHERE report.status = 'published'
  AND ($1::text IS NULL OR pointer.report_type = $1::text)
  AND ($2::text IS NULL OR pointer.scope_key = $2::text)
ORDER BY pointer.switched_at DESC
LIMIT $3::int
`;

type DbRow = Record<string, unknown>;

export function normalizeProductTextParam(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}

export function normalizeProductLimitParam(raw: unknown): number | undefined {
  const value = normalizeProductTextParam(raw);
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function limitValue(value: number | undefined, fallback = 100): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value)) return fallback;
  return Math.max(1, Math.min(500, value));
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : numberValue(value);
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid timestamp');
  return date.toISOString();
}

function meta(dataLength: number, now: Date): ResponseMeta {
  return { source: dataLength > 0 ? 'database' : 'fallback', generatedAt: now.toISOString() };
}

function errorEnvelope<T>(schema: { parse: (value: unknown) => T }, data: unknown, now: Date, code: string): T {
  return schema.parse({
    data,
    availability: 'error',
    error: { code, message: '데이터를 읽는 중 오류가 발생했습니다.' },
    meta: { source: 'fallback', generatedAt: now.toISOString() },
  });
}

export async function getFeatureSnapshots(
  executor: ProductQueryExecutor,
  options: ProductListOptions = {},
): Promise<FeatureSnapshotResponse> {
  const now = options.now ?? new Date();
  try {
    const rows = await executor.queryRows<DbRow>(FEATURE_SQL, [
      options.entityKey ?? null,
      limitValue(options.limit, 300),
    ]);
    const data = rows.map((row) => ({
      entityKey: String(row.entity_key), market: row.market, ticker: String(row.ticker),
      asOf: iso(row.as_of), featureSetVersion: String(row.feature_set_version),
      features: row.features ?? {}, completenessScore: numberValue(row.completeness_score),
    }));
    return featureSnapshotResponseSchema.parse({
      data, availability: data.length ? 'available' : 'missing', error: null, meta: meta(data.length, now),
    });
  } catch {
    return errorEnvelope(featureSnapshotResponseSchema, [], now, 'FEATURE_SNAPSHOT_READ_FAILED');
  }
}

export async function getImpactSummaries(
  executor: ProductQueryExecutor,
  options: ProductListOptions = {},
): Promise<ImpactSummaryResponse> {
  const now = options.now ?? new Date();
  try {
    const rows = await executor.queryRows<DbRow>(IMPACT_SQL, [
      options.entityKey ?? null,
      limitValue(options.limit, 300),
    ]);
    const data = rows.map((row) => ({
      entityKey: String(row.entity_key), market: row.market, ticker: String(row.ticker),
      pathCount: numberValue(row.path_count), maxPathScore: numberValue(row.max_path_score),
      averagePathScore: numberValue(row.avg_path_score),
      eventTypes: Array.isArray(row.event_types) ? row.event_types.map(String) : [],
      computedAt: iso(row.computed_at),
    }));
    return impactSummaryResponseSchema.parse({
      data, availability: data.length ? 'available' : 'missing', error: null, meta: meta(data.length, now),
    });
  } catch {
    return errorEnvelope(impactSummaryResponseSchema, [], now, 'IMPACT_SUMMARY_READ_FAILED');
  }
}

export async function getMarketConfirmations(
  executor: ProductQueryExecutor,
  options: ProductListOptions = {},
): Promise<MarketConfirmationResponse> {
  const now = options.now ?? new Date();
  try {
    const rows = await executor.queryRows<DbRow>(CONFIRMATION_SQL, [
      options.entityKey ?? null,
      limitValue(options.limit, 300),
    ]);
    const data = rows.map((row) => ({
      entityKey: String(row.entity_key), market: row.market, ticker: String(row.ticker),
      asOf: iso(row.as_of), industryLinkStrength: numberValue(row.industry_link_strength),
      pathCount: nullableNumber(row.path_count), return20d: nullableNumber(row.ret_20d),
      volumeZ20d: nullableNumber(row.volume_z_20d), marketConfirmation: row.market_confirmation,
      rsi14: nullableNumber(row.rsi_14), ma20Gap: nullableNumber(row.ma20_gap),
      expectationPricedIn: row.expectation_priced_in,
    }));
    return marketConfirmationResponseSchema.parse({
      data, availability: data.length ? 'available' : 'missing', error: null, meta: meta(data.length, now),
    });
  } catch {
    return errorEnvelope(marketConfirmationResponseSchema, [], now, 'MARKET_CONFIRMATION_READ_FAILED');
  }
}

export async function getPersonalizedFeed(
  executor: ProductQueryExecutor,
  options: { userScope: UserScope; feedDate?: string; now?: Date },
): Promise<PersonalizedFeedResponse> {
  const now = options.now ?? new Date();
  try {
    const rows = await executor.queryRows<DbRow>(FEED_SQL, [
      options.userScope.userId,
      options.feedDate ?? null,
    ]);
    const data = rows.map((row) => ({
      rank: numberValue(row.rank), itemType: row.item_type, itemId: numberValue(row.item_id),
      relevanceScore: numberValue(row.relevance_score),
      explanationCodes: Array.isArray(row.explanation_codes) ? row.explanation_codes.map(String) : [],
      title: String(row.title), summary: String(row.summary ?? ''),
    }));
    return personalizedFeedResponseSchema.parse({
      data, availability: data.length ? 'available' : 'missing', error: null, meta: meta(data.length, now),
    });
  } catch {
    return errorEnvelope(personalizedFeedResponseSchema, [], now, 'PERSONALIZED_FEED_READ_FAILED');
  }
}

export async function getCalibrationScorecard(
  executor: ProductQueryExecutor,
  options: { now?: Date } = {},
): Promise<CalibrationScorecardResponse> {
  const now = options.now ?? new Date();
  try {
    const [labelRows, probabilityRows] = await Promise.all([
      executor.queryRows<DbRow>(LABEL_SCORECARD_SQL),
      executor.queryRows<DbRow>(PROBABILITY_SCORECARD_SQL),
    ]);
    const data = {
      labels: labelRows.map((row) => ({
        market: String(row.market), horizonDays: numberValue(row.horizon_days),
        confidenceLabel: String(row.confidence_label), sampleN: numberValue(row.sample_n),
        targetHitRate: nullableNumber(row.target_hit_rate), invalidationRate: nullableNumber(row.invalidation_rate),
        directionHitRate: nullableNumber(row.direction_hit_rate),
        insufficientSample: Boolean(row.insufficient_sample), method: String(row.method),
        computedAt: iso(row.computed_at),
      })),
      probabilities: probabilityRows.map((row) => ({
        evaluationMode: row.evaluation_mode, market: String(row.market),
        horizonDays: numberValue(row.horizon_days), probabilityMethod: String(row.probability_method),
        sampleN: numberValue(row.sample_n), brierScore: nullableNumber(row.brier_score),
        logLoss: nullableNumber(row.log_loss),
        expectedCalibrationError: nullableNumber(row.expected_calibration_error),
        calibrationBins: Array.isArray(row.calibration_bins) ? row.calibration_bins : [],
        insufficientSample: Boolean(row.insufficient_sample), computedAt: iso(row.computed_at),
      })),
    };
    const count = data.labels.length + data.probabilities.length;
    return calibrationScorecardResponseSchema.parse({
      data, availability: count ? 'available' : 'missing', error: null, meta: meta(count, now),
    });
  } catch {
    return errorEnvelope(
      calibrationScorecardResponseSchema,
      { labels: [], probabilities: [] },
      now,
      'CALIBRATION_SCORECARD_READ_FAILED',
    );
  }
}

export async function getLatestReports(
  executor: ProductQueryExecutor,
  options: { reportType?: string; scopeKey?: string; limit?: number; now?: Date } = {},
): Promise<LatestReportsResponse> {
  const now = options.now ?? new Date();
  try {
    const rows = await executor.queryRows<DbRow>(REPORTS_SQL, [
      options.reportType ?? null,
      options.scopeKey ?? null,
      limitValue(options.limit, 50),
    ]);
    const data = rows.map((row) => ({
      reportId: numberValue(row.report_id), reportType: String(row.report_type),
      scopeKey: String(row.scope_key), title: String(row.title), summary: String(row.summary),
      status: row.status, qualityScore: nullableNumber(row.quality_score),
      publishedAt: iso(row.published_at), switchedAt: iso(row.switched_at),
    }));
    return latestReportsResponseSchema.parse({
      data, availability: data.length ? 'available' : 'missing', error: null, meta: meta(data.length, now),
    });
  } catch {
    return errorEnvelope(latestReportsResponseSchema, [], now, 'LATEST_REPORTS_READ_FAILED');
  }
}
