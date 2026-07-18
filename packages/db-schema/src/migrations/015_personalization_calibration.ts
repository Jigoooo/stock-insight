export const personalizationCalibrationMigrationSql = `
-- SET F / F-1+F-3: personalization schema (+affinity backfill from manual
-- watchlist/positions) and calibration profiles over the forecast ledgers.
-- NOTE(calibration honesty): ops.forecast_issuance_ledger.predicted_probability
-- is NULL for all 3,565 rows — Brier/log scores are IMPOSSIBLE until issuers
-- start recording probabilities. v1 therefore calibrates confidence LABELS
-- (low/medium/high) against realized hit rates, and says so in method fields.

CREATE SCHEMA IF NOT EXISTS personalization;

CREATE TABLE IF NOT EXISTS personalization.user_profile (
    user_id              UUID PRIMARY KEY,
    locale               TEXT NOT NULL DEFAULT 'ko-KR',
    timezone             TEXT NOT NULL DEFAULT 'Asia/Seoul',
    risk_preference      TEXT,
    preferred_markets    TEXT[] NOT NULL DEFAULT '{}',
    preferred_horizons   TEXT[] NOT NULL DEFAULT '{}',
    personalization_opt_in BOOLEAN NOT NULL DEFAULT true,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personalization.user_asset_affinity (
    user_id              UUID NOT NULL,
    asset_entity_id      BIGINT NOT NULL REFERENCES core.entity(entity_id),
    affinity_type        TEXT NOT NULL CHECK (affinity_type IN ('watchlist','holding','behavior','inferred')),
    weight               REAL NOT NULL CHECK (weight BETWEEN 0 AND 1),
    source               TEXT NOT NULL,
    valid_from           TIMESTAMPTZ NOT NULL,
    valid_to             TIMESTAMPTZ,
    PRIMARY KEY (user_id, asset_entity_id, affinity_type, valid_from)
);

CREATE TABLE IF NOT EXISTS personalization.user_feed_item (
    user_id              UUID NOT NULL,
    feed_date            DATE NOT NULL,
    rank                 INTEGER NOT NULL,
    item_type            TEXT NOT NULL CHECK (item_type IN ('report','event','impact_path')),
    item_id              BIGINT NOT NULL,
    relevance_score      REAL NOT NULL,
    explanation_codes    TEXT[] NOT NULL,
    generated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, feed_date, rank)
);

-- F-1 backfill: profile for the single live user; affinity from manual ledgers.
INSERT INTO personalization.user_profile (user_id, preferred_markets)
SELECT DISTINCT user_id, ARRAY['KR','US']
FROM public.user_watchlist
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO personalization.user_asset_affinity (
  user_id, asset_entity_id, affinity_type, weight, source, valid_from, valid_to
)
SELECT watch.user_id, ident.entity_id, 'watchlist', 1.0, 'manual_watchlist',
       coalesce(watch.added_at, now()),
       CASE WHEN watch.active AND watch.removed_at IS NULL THEN NULL
            ELSE coalesce(watch.removed_at, now()) END
FROM public.user_watchlist watch
JOIN core.entity_identifier ident
  ON ident.identifier_type = 'INTERNAL_KEY' AND ident.identifier_value = watch.entity_key
ON CONFLICT DO NOTHING;

INSERT INTO personalization.user_asset_affinity (
  user_id, asset_entity_id, affinity_type, weight, source, valid_from, valid_to
)
SELECT position.user_id, ident.entity_id, 'holding', 1.0, 'manual_position',
       coalesce(position.opened_at, now()),
       CASE WHEN position.status = 'open' AND position.closed_at IS NULL THEN NULL
            ELSE coalesce(position.closed_at, now()) END
FROM public.user_positions position
JOIN core.entity_identifier ident
  ON ident.identifier_type = 'INTERNAL_KEY' AND ident.identifier_value = position.entity_key
ON CONFLICT DO NOTHING;

-- F-3: calibration profiles (label-level, honest about missing probabilities).
CREATE TABLE IF NOT EXISTS analytics.calibration_profile (
    profile_id        BIGSERIAL PRIMARY KEY,
    group_market      TEXT NOT NULL,
    group_horizon_days INTEGER NOT NULL,
    group_confidence  TEXT NOT NULL,
    sample_n          INTEGER NOT NULL,
    target_hit_rate   REAL,
    invalidation_rate REAL,
    direction_hit_rate REAL,
    avg_outcome_value REAL,
    insufficient_sample BOOLEAN NOT NULL,
    method            TEXT NOT NULL,
    sample_from       DATE,
    sample_to         DATE,
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_market, group_horizon_days, group_confidence, computed_at)
);

-- Deterministic recompute (idempotent per day via the view below; job re-runs
-- insert a new computed_at snapshot — history is intentional).
INSERT INTO analytics.calibration_profile (
  group_market, group_horizon_days, group_confidence, sample_n,
  target_hit_rate, invalidation_rate, direction_hit_rate, avg_outcome_value,
  insufficient_sample, method, sample_from, sample_to
)
SELECT
  issuance.market,
  issuance.horizon_days,
  coalesce(issuance.confidence_label, 'unlabeled'),
  count(*)::int,
  round(avg(CASE WHEN outcome.target_hit THEN 1.0 ELSE 0.0 END)::numeric, 4),
  round(avg(CASE WHEN outcome.invalidation_hit THEN 1.0 ELSE 0.0 END)::numeric, 4),
  CASE WHEN count(outcome.direction_hit) >= 10
       THEN round(avg(CASE WHEN outcome.direction_hit THEN 1.0 ELSE 0.0 END)::numeric, 4) END,
  round(avg(outcome.outcome_value)::numeric, 4),
  count(*) < 30,
  'label_hit_rate_v1 (Brier unavailable: predicted_probability is NULL across the issuance ledger)',
  min(outcome.observed_on),
  max(outcome.observed_on)
FROM ops.forecast_outcome_ledger outcome
JOIN ops.forecast_issuance_ledger issuance ON issuance.id = outcome.forecast_id
WHERE outcome.evaluation_phase = 'final'
  AND NOT EXISTS (SELECT 1 FROM analytics.calibration_profile existing
                  WHERE existing.computed_at::date = now()::date)
GROUP BY 1, 2, 3;

-- Latest scorecard view (one row per group, newest computation).
CREATE OR REPLACE VIEW serving.forecast_scorecard_v1 AS
SELECT DISTINCT ON (profile.group_market, profile.group_horizon_days, profile.group_confidence)
       profile.group_market AS market,
       profile.group_horizon_days AS horizon_days,
       profile.group_confidence AS confidence_label,
       profile.sample_n,
       profile.target_hit_rate,
       profile.invalidation_rate,
       profile.direction_hit_rate,
       profile.avg_outcome_value,
       profile.insufficient_sample,
       profile.method,
       profile.sample_from,
       profile.sample_to,
       profile.computed_at
FROM analytics.calibration_profile profile
ORDER BY profile.group_market, profile.group_horizon_days, profile.group_confidence,
         profile.computed_at DESC;

DO $$
BEGIN
  GRANT USAGE ON SCHEMA personalization TO si_personal, si_readapi;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA personalization TO si_personal;
  GRANT SELECT ON ALL TABLES IN SCHEMA personalization TO si_readapi;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA personalization TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA personalization TO stock_insight_app_reader;
    GRANT SELECT ON serving.forecast_scorecard_v1 TO stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA personalization
      GRANT SELECT ON TABLES TO stock_insight_app_reader;
  END IF;
END $$;
`;
