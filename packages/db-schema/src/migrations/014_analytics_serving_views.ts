export const analyticsServingViewsMigrationSql = `
-- SET E / E-5: market-confirmation (3-axis) serving views.
-- Axes stay SEPARATE (Baseline §10.3): industrial linkage / market confirmation /
-- expectation-priced-in are never collapsed into one predictive score.

-- Latest feature snapshot per asset (fs_v1).
CREATE OR REPLACE VIEW serving.latest_feature_snapshot_v1 AS
SELECT DISTINCT ON (snapshot.asset_entity_id)
       snapshot.asset_entity_id,
       universe.market,
       universe.ticker,
       snapshot.as_of,
       snapshot.feature_set_version,
       snapshot.features,
       snapshot.completeness_score
FROM analytics.asset_feature_snapshot snapshot
JOIN core.v_security_universe universe
  ON universe.security_entity_id = snapshot.asset_entity_id
WHERE snapshot.feature_set_version = 'fs_v1'
ORDER BY snapshot.asset_entity_id, snapshot.as_of DESC;

-- Aggregated industrial linkage per stock from the current inference run.
CREATE OR REPLACE VIEW serving.impact_summary_v1 AS
SELECT path.target_entity_id AS asset_entity_id,
       universe.market,
       universe.ticker,
       count(*)::int AS path_count,
       max(path.path_score) AS max_path_score,
       round(avg(path.path_score)::numeric, 4) AS avg_path_score,
       array_agg(DISTINCT path.explanation ->> 'event_type') AS event_types,
       max(path.created_at) AS computed_at
FROM analytics.impact_path path
JOIN core.v_security_universe universe
  ON universe.security_entity_id = path.target_entity_id
WHERE path.expires_at > now()
GROUP BY 1, 2, 3;

-- 3-axis market confirmation (labels are rule-based, no LLM, no blended score).
CREATE OR REPLACE VIEW serving.market_confirmation_v1 AS
SELECT
  feature.asset_entity_id,
  feature.market,
  feature.ticker,
  feature.as_of,
  -- Axis 1: industrial linkage (graph)
  coalesce(impact.max_path_score, 0) AS industry_link_strength,
  impact.path_count,
  -- Axis 2: market confirmation (price/volume reaction)
  (feature.features ->> 'ret_20d')::float8 AS ret_20d,
  (feature.features ->> 'volume_z_20d')::float8 AS volume_z_20d,
  CASE
    WHEN (feature.features ->> 'ret_20d')::float8 > 0.05
     AND coalesce((feature.features ->> 'volume_z_20d')::float8, 0) > 0.5 THEN 'confirmed'
    WHEN (feature.features ->> 'ret_20d')::float8 > 0 THEN 'partial'
    WHEN (feature.features ->> 'ret_20d')::float8 IS NULL THEN 'unknown'
    ELSE 'not_confirmed'
  END AS market_confirmation,
  -- Axis 3: expectation priced-in (momentum stretch)
  (feature.features ->> 'rsi_14')::float8 AS rsi_14,
  (feature.features ->> 'ma20_gap')::float8 AS ma20_gap,
  CASE
    WHEN (feature.features ->> 'rsi_14')::float8 >= 70
      OR coalesce((feature.features ->> 'ma20_gap')::float8, 0) > 0.10 THEN 'high'
    WHEN (feature.features ->> 'rsi_14')::float8 >= 55 THEN 'medium'
    WHEN (feature.features ->> 'rsi_14')::float8 IS NULL THEN 'unknown'
    ELSE 'low'
  END AS expectation_priced_in
FROM serving.latest_feature_snapshot_v1 feature
LEFT JOIN serving.impact_summary_v1 impact
  ON impact.asset_entity_id = feature.asset_entity_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON serving.latest_feature_snapshot_v1,
                     serving.impact_summary_v1,
                     serving.market_confirmation_v1 TO stock_insight_app_reader;
  END IF;
END $$;
`;
