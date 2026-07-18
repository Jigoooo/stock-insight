export const servingReadLayerMigrationSql = `
CREATE SCHEMA IF NOT EXISTS serving;

-- 1) Diagnostic-row isolation: read paths must not see api_key_status/env rows.
CREATE OR REPLACE VIEW serving.market_snapshots_clean_v1 AS
SELECT *
FROM stock.market_snapshots
WHERE snapshot_type NOT IN ('api_key_status', 'env')
  AND symbol IS NOT NULL;

-- 2) Canonical ticker universe (transitional source: public.entities until core schema lands).
CREATE OR REPLACE VIEW serving.security_universe_v1 AS
SELECT
  entity.entity_key,
  entity.market,
  upper(entity.symbol) AS ticker,
  coalesce(nullif(entity.name, ''), entity.symbol) AS name,
  profile.availability AS profile_availability,
  profile.profile_json ->> 'corporationClass' AS kr_corp_class
FROM public.entities entity
LEFT JOIN public.company_profiles profile ON profile.entity_key = entity.entity_key
WHERE entity.entity_type = 'ticker'
  AND entity.market IN ('KR', 'US')
  AND coalesce(entity.symbol, '') <> '';

-- 3) Latest close per symbol from canonical OHLCV (1D), with prev-close change_pct.
CREATE OR REPLACE VIEW serving.latest_price_v1 AS
WITH ranked AS (
  SELECT
    regexp_replace(upper(symbol), '\\.(KS|KQ)$', '') AS ticker,
    CASE WHEN exchange IN ('KOSPI', 'KOSDAQ') THEN 'KR' ELSE 'US' END AS market,
    exchange,
    ts,
    close,
    row_number() OVER (
      PARTITION BY regexp_replace(upper(symbol), '\\.(KS|KQ)$', '')
      ORDER BY ts DESC
    ) AS recency_rank
  FROM market_ts.ohlcv
  WHERE domain = 'stock' AND timeframe = '1D'
)
SELECT
  latest.market,
  latest.ticker,
  latest.exchange,
  latest.ts AS price_as_of,
  latest.close AS latest_price,
  CASE WHEN latest.market = 'KR' THEN 'KRW' ELSE 'USD' END AS currency,
  CASE
    WHEN previous.close IS NOT NULL AND previous.close <> 0
      THEN round(((latest.close - previous.close) / previous.close * 100)::numeric, 2)
  END AS change_pct
FROM ranked latest
LEFT JOIN ranked previous
  ON previous.ticker = latest.ticker AND previous.recency_rank = 2
WHERE latest.recency_rank = 1;

-- 4) Live dataset watermarks computed from source tables (no collector changes needed).
CREATE OR REPLACE VIEW serving.dataset_watermark_live_v1 AS
WITH live AS (
  SELECT 'stock'::text AS domain, 'ohlcv_1d'::text AS dataset_name,
         max(ts) AS watermark_at, count(*)::bigint AS row_count, 78 AS allowed_lag_hours
  FROM market_ts.ohlcv WHERE domain = 'stock' AND timeframe = '1D'
  UNION ALL
  SELECT 'stock', 'market_snapshots',
         max(nullif(collected_at, '')::timestamptz), count(*)::bigint, 30
  FROM serving.market_snapshots_clean_v1
  UNION ALL
  SELECT 'stock', 'macro_observations',
         max(nullif(collected_at, '')::timestamptz), count(*)::bigint, 78
  FROM stock.macro_observations
  UNION ALL
  SELECT 'stock', 'company_profiles',
         max(coalesce(updated_at, created_at)), count(*)::bigint, 192
  FROM public.company_profiles
  UNION ALL
  SELECT 'stock', 'company_financials',
         max(coalesce(updated_at, created_at)), count(*)::bigint, 192
  FROM public.company_financials
  UNION ALL
  SELECT 'stock', 'rss_news',
         max(collected_at), count(*)::bigint, 3
  FROM public.source_documents WHERE source_system = 'rss_news'
  UNION ALL
  SELECT 'stock', 'news_translation',
         max(translated_at), count(*) FILTER (WHERE title_ko IS NOT NULL)::bigint, 26
  FROM public.source_documents WHERE source_system = 'rss_news'
  UNION ALL
  SELECT 'stock', 'market_signals',
         max(occurred_at), count(*)::bigint, 78
  FROM public.market_signals WHERE domain = 'stock'
  UNION ALL
  SELECT 'stock', 'graph_edges',
         max(known_at), count(*)::bigint, 78
  FROM ops.current_temporal_graph_edge WHERE approved = true AND inferred = false
  UNION ALL
  SELECT 'stock', 'forecast_outcome',
         max(known_at), count(*)::bigint, 78
  FROM ops.forecast_outcome_ledger
)
SELECT
  domain,
  dataset_name,
  watermark_at,
  row_count,
  allowed_lag_hours,
  CASE
    WHEN watermark_at IS NULL THEN 'missing'
    WHEN watermark_at < now() - make_interval(hours => allowed_lag_hours) THEN 'stale'
    ELSE 'available'
  END AS status
FROM live;

-- 5) Register previously-unknown RSS providers under shadow policy (idempotent).
INSERT INTO ops.source_collection_policy (
  provider_key, display_name, source_class, license_status, redistribution_scope,
  attribution_required, credential_kind, credential_ref, collection_allowed,
  enforcement_mode, decision_reason, valid_from, created_at, updated_at, policy_revision
)
SELECT
  provider.provider_key,
  provider.display_name,
  provider.source_class,
  'review_required',
  'internal_only',
  true,
  'none',
  'none:',
  true,
  'shadow',
  'Auto-registered from live source_documents during serving read layer migration; per-outlet terms review pending.',
  now(), now(), now(), 1
FROM (VALUES
  ('rss:cnbc-markets', 'CNBC Markets RSS', 'public_web'),
  ('rss:economist-finance', 'The Economist Finance RSS', 'public_web'),
  ('rss:ft-opinion', 'Financial Times Opinion RSS', 'public_web'),
  ('rss:marketwatch', 'MarketWatch RSS', 'public_web'),
  ('rss:nyt-opinion', 'NYT Opinion RSS', 'public_web'),
  ('rss:yahoo-finance', 'Yahoo Finance RSS', 'public_web'),
  ('rss:매경-사설-칼럼', '매일경제 사설·칼럼 RSS', 'public_web'),
  ('rss:매일경제', '매일경제 RSS', 'public_web'),
  ('rss:연합뉴스-경제', '연합뉴스 경제 RSS', 'public_web'),
  ('rss:연합인포맥스', '연합인포맥스 RSS', 'public_web'),
  ('rss:조선-경제사설', '조선일보 경제사설 RSS', 'public_web'),
  ('rss:한경-사설-칼럼', '한국경제 사설·칼럼 RSS', 'public_web'),
  ('yfinance-error', 'yfinance collector error telemetry', 'internal_telemetry')
) AS provider(provider_key, display_name, source_class)
WHERE NOT EXISTS (
  SELECT 1 FROM ops.source_collection_policy existing
  WHERE existing.provider_key = provider.provider_key
);

-- 6) Grant read access to the app roles used by the production web/api containers.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA serving TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA serving TO stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA serving
      GRANT SELECT ON TABLES TO stock_insight_app_reader;
    -- Price-series read model queries canonical OHLCV directly (read-only market data).
    GRANT USAGE ON SCHEMA market_ts TO stock_insight_app_reader;
    GRANT SELECT ON market_ts.ohlcv TO stock_insight_app_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_writer') THEN
    GRANT USAGE ON SCHEMA serving TO stock_insight_app_writer;
    GRANT SELECT ON ALL TABLES IN SCHEMA serving TO stock_insight_app_writer;
    GRANT USAGE ON SCHEMA market_ts TO stock_insight_app_writer;
    GRANT SELECT ON market_ts.ohlcv TO stock_insight_app_writer;
  END IF;
END $$;
`;
