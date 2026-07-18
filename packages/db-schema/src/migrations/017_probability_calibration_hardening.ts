export const probabilityCalibrationHardeningMigrationSql = `
-- SET G post-review hardening.
-- 1) Reject out-of-range source probabilities before they can reach issuance.
-- 2) Make label-profile refresh idempotent per UTC day and segment.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'stock.candidates'::regclass
      AND conname = 'ck_stock_candidates_predicted_probability_range'
  ) THEN
    ALTER TABLE stock.candidates
      ADD CONSTRAINT ck_stock_candidates_predicted_probability_range
      CHECK (predicted_probability IS NULL OR predicted_probability BETWEEN 0 AND 1)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'crypto.candidates'::regclass
      AND conname = 'ck_crypto_candidates_predicted_probability_range'
  ) THEN
    ALTER TABLE crypto.candidates
      ADD CONSTRAINT ck_crypto_candidates_predicted_probability_range
      CHECK (predicted_probability IS NULL OR predicted_probability BETWEEN 0 AND 1)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'watchlist.predictions'::regclass
      AND conname = 'ck_watchlist_predictions_predicted_probability_range'
  ) THEN
    ALTER TABLE watchlist.predictions
      ADD CONSTRAINT ck_watchlist_predictions_predicted_probability_range
      CHECK (predicted_probability IS NULL OR predicted_probability BETWEEN 0 AND 1)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE stock.candidates
  VALIDATE CONSTRAINT ck_stock_candidates_predicted_probability_range;
ALTER TABLE crypto.candidates
  VALIDATE CONSTRAINT ck_crypto_candidates_predicted_probability_range;
ALTER TABLE watchlist.predictions
  VALIDATE CONSTRAINT ck_watchlist_predictions_predicted_probability_range;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calibration_profile_v2_segment_utc_day
ON analytics.calibration_profile (
  group_market,
  group_horizon_days,
  group_confidence,
  ((computed_at AT TIME ZONE 'UTC')::date)
)
WHERE method = 'label_hit_rate_v2 (probability metrics in serving.probability_scorecard_v1)';
`;
