export const productionizationCompletionMigrationSql = `
-- SET G: close remaining productization gaps.
-- 1) Synchronize feed-provided RSS summaries into knowledge.document.
-- 2) Stamp FUTURE forecast issuances with an explicit or historical-label probability.
--    Never rewrites past append-only issuances and never uses future outcomes.
-- 3) Add probability-calibration snapshot storage and serving views.

-- G-1: add newly collected source documents to the knowledge layer.
WITH provider_map AS (
  SELECT provider_key, source_id FROM ingestion.source
), fallback AS (
  SELECT source_id FROM ingestion.source WHERE provider_key = 'rss-news-bundle'
)
INSERT INTO knowledge.document (
  source_id, source_document_id, source_type, canonical_url, title,
  published_at, observed_at, available_at, language_code, content_hash,
  raw_object_uri, processing_status, legacy_source_document_pk, metadata
)
SELECT
  coalesce(provider_map.source_id, (SELECT source_id FROM fallback)),
  legacy.source_key,
  legacy.source_type,
  nullif(legacy.url, ''),
  legacy.title,
  legacy.published_at,
  coalesce(legacy.collected_at, legacy.created_at, now()),
  coalesce(legacy.known_at, legacy.collected_at, legacy.created_at, now()),
  CASE WHEN legacy.title ~ '[가-힣]' THEN 'ko' ELSE 'en' END,
  coalesce(nullif(legacy.content_hash, ''), md5(coalesce(legacy.title, '') || legacy.id::text)),
  'legacy:pg-source_documents/' || legacy.id::text,
  'pending',
  legacy.id,
  jsonb_build_object(
    'source_system', legacy.source_system,
    'provider_key', legacy.provider_key,
    'title_ko', legacy.title_ko,
    'summary', legacy.summary,
    'summary_ko', legacy.summary_ko,
    'policy_decision', legacy.policy_decision,
    'revision_no', legacy.revision_no,
    'backfill', 'source-documents-v2-feed-summary'
  )
FROM public.source_documents legacy
LEFT JOIN provider_map ON provider_map.provider_key = legacy.provider_key
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.document existing
  WHERE existing.legacy_source_document_pk = legacy.id
)
ON CONFLICT (source_id, content_hash) DO NOTHING;

-- Existing promoted documents receive the new feed summary and return to pending.
-- Do not alter document identity/content_hash here: source-level revision remains in
-- public.source_documents and the knowledge row is a stable promoted identity.
UPDATE knowledge.document document
SET metadata = jsonb_set(
      jsonb_set(document.metadata, '{summary}', to_jsonb(legacy.summary), true),
      '{source_revision_fingerprint}', to_jsonb(legacy.revision_fingerprint), true
    ),
    processing_status = 'pending'
FROM public.source_documents legacy
WHERE document.legacy_source_document_pk = legacy.id
  AND legacy.source_system = 'rss_news'
  AND coalesce(legacy.summary, '') <> ''
  AND (
    document.metadata ->> 'summary' IS DISTINCT FROM legacy.summary
    OR document.metadata ->> 'source_revision_fingerprint'
       IS DISTINCT FROM legacy.revision_fingerprint
  );

-- G-2: source schemas can provide an explicit probability in future.
ALTER TABLE stock.candidates ADD COLUMN IF NOT EXISTS predicted_probability NUMERIC;
ALTER TABLE stock.candidates ADD COLUMN IF NOT EXISTS probability_method TEXT;
ALTER TABLE crypto.candidates ADD COLUMN IF NOT EXISTS predicted_probability NUMERIC;
ALTER TABLE crypto.candidates ADD COLUMN IF NOT EXISTS probability_method TEXT;
ALTER TABLE watchlist.predictions ADD COLUMN IF NOT EXISTS predicted_probability NUMERIC;
ALTER TABLE watchlist.predictions ADD COLUMN IF NOT EXISTS probability_method TEXT;

ALTER TABLE ops.forecast_issuance_ledger
  ADD COLUMN IF NOT EXISTS probability_method TEXT;
ALTER TABLE ops.forecast_issuance_ledger
  ADD COLUMN IF NOT EXISTS probability_reference_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION ops.stamp_forecast_probability()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  explicit_probability NUMERIC;
  calibrated_probability NUMERIC;
  calibrated_at TIMESTAMPTZ;
BEGIN
  -- First preference: an explicit, source-produced probability (strict 0..1).
  BEGIN
    explicit_probability := nullif(NEW.raw_json ->> 'predicted_probability', '')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    explicit_probability := NULL;
  END;

  IF explicit_probability BETWEEN 0 AND 1 THEN
    NEW.predicted_probability := explicit_probability;
    NEW.probability_method := coalesce(
      nullif(NEW.raw_json ->> 'probability_method', ''), 'source_explicit_v1'
    );
    NEW.probability_reference_at := NEW.issued_at;
    RETURN NEW;
  END IF;

  -- Fallback: latest label calibration that existed BEFORE issuance.
  -- It is a segment base rate, not a model-specific probability.
  SELECT profile.target_hit_rate, profile.computed_at
  INTO calibrated_probability, calibrated_at
  FROM analytics.calibration_profile profile
  WHERE profile.group_market = NEW.market
    AND profile.group_horizon_days = NEW.horizon_days
    AND profile.group_confidence = coalesce(NEW.confidence_label, 'unlabeled')
    AND NOT profile.insufficient_sample
    AND profile.sample_n >= 30
    AND profile.target_hit_rate IS NOT NULL
    AND profile.computed_at <= NEW.issued_at
  ORDER BY profile.computed_at DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.predicted_probability := calibrated_probability;
    NEW.probability_method := 'empirical_label_target_hit_v1';
    NEW.probability_reference_at := calibrated_at;
  ELSE
    NEW.predicted_probability := NULL;
    NEW.probability_method := 'unavailable_no_prior_calibration';
    NEW.probability_reference_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_forecast_probability ON ops.forecast_issuance_ledger;
CREATE TRIGGER trg_stamp_forecast_probability
BEFORE INSERT ON ops.forecast_issuance_ledger
FOR EACH ROW EXECUTE FUNCTION ops.stamp_forecast_probability();

ALTER TABLE ops.forecast_issuance_ledger
  DROP CONSTRAINT IF EXISTS ck_forecast_probability_range;
ALTER TABLE ops.forecast_issuance_ledger
  ADD CONSTRAINT ck_forecast_probability_range
  CHECK (predicted_probability IS NULL OR predicted_probability BETWEEN 0 AND 1) NOT VALID;
ALTER TABLE ops.forecast_issuance_ledger
  VALIDATE CONSTRAINT ck_forecast_probability_range;

-- G-3: probability quality snapshots. evaluation_mode distinguishes live issued
-- probabilities from the honest historical expanding-window baseline.
CREATE TABLE IF NOT EXISTS analytics.probability_calibration_snapshot (
    snapshot_id          BIGSERIAL PRIMARY KEY,
    evaluation_mode      TEXT NOT NULL CHECK (
      evaluation_mode IN ('live_issued_probability', 'historical_expanding_baseline')
    ),
    group_market         TEXT NOT NULL,
    group_horizon_days   INTEGER NOT NULL,
    probability_method   TEXT NOT NULL,
    sample_n             INTEGER NOT NULL,
    brier_score          REAL,
    log_loss             REAL,
    expected_calibration_error REAL,
    calibration_bins     JSONB NOT NULL DEFAULT '[]'::jsonb,
    insufficient_sample  BOOLEAN NOT NULL,
    sample_from          DATE,
    sample_to            DATE,
    data_cutoff          TIMESTAMPTZ NOT NULL,
    computed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evaluation_mode, group_market, group_horizon_days, probability_method, data_cutoff)
);

CREATE OR REPLACE VIEW serving.probability_scorecard_v1 AS
SELECT DISTINCT ON (
  snapshot.evaluation_mode, snapshot.group_market,
  snapshot.group_horizon_days, snapshot.probability_method
)
  snapshot.evaluation_mode,
  snapshot.group_market AS market,
  snapshot.group_horizon_days AS horizon_days,
  snapshot.probability_method,
  snapshot.sample_n,
  snapshot.brier_score,
  snapshot.log_loss,
  snapshot.expected_calibration_error,
  snapshot.calibration_bins,
  snapshot.insufficient_sample,
  snapshot.sample_from,
  snapshot.sample_to,
  snapshot.data_cutoff,
  snapshot.computed_at
FROM analytics.probability_calibration_snapshot snapshot
ORDER BY snapshot.evaluation_mode, snapshot.group_market,
         snapshot.group_horizon_days, snapshot.probability_method,
         snapshot.data_cutoff DESC, snapshot.computed_at DESC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON serving.probability_scorecard_v1 TO stock_insight_app_reader;
  END IF;
END $$;
`;
