export const k4MarketIntelligenceRunReceiptMigrationSql = `
-- K4 Task 3: durable replay/canary receipts. The execution lock in migration
-- 027 fences workers, but it does not preserve which cutoff inputs produced
-- which immutable market-intelligence plan. This ledger records both digests.

INSERT INTO analytics.impact_channel (
  channel_class, channel_group, description, metadata
) VALUES (
  'operational_capacity', 'operational',
  'Directly measured inventory, fixed-asset, or capital-spending capacity change',
  jsonb_build_object('introduced_by', '091_k4_market_intelligence_run_receipt')
)
ON CONFLICT (channel_class) DO NOTHING;

CREATE TABLE IF NOT EXISTS analytics.market_intelligence_run_receipt (
    market_intelligence_run_receipt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_key TEXT NOT NULL UNIQUE CHECK (length(btrim(run_key)) > 0),
    run_kind TEXT NOT NULL CHECK (run_kind IN ('replay','canary')),
    cutoff_at TIMESTAMPTZ NOT NULL,
    request_digest TEXT NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
    plan_digest TEXT NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
    information_set_id TEXT NOT NULL
      REFERENCES governance.analysis_information_set(information_set_id),
    requested_security_count INTEGER NOT NULL CHECK (requested_security_count > 0),
    evaluation_count INTEGER NOT NULL CHECK (evaluation_count >= requested_security_count),
    accepted_evaluation_count INTEGER NOT NULL
      CHECK (accepted_evaluation_count >= 0
             AND accepted_evaluation_count <= evaluation_count),
    reason_counts JSONB NOT NULL CHECK (jsonb_typeof(reason_counts) = 'object'),
    artifact_counts JSONB NOT NULL CHECK (jsonb_typeof(artifact_counts) = 'object'),
    outcome_counts JSONB NOT NULL CHECK (jsonb_typeof(outcome_counts) = 'object'),
    planner_version TEXT NOT NULL CHECK (length(btrim(planner_version)) > 0),
    score_formula_version TEXT NOT NULL CHECK (length(btrim(score_formula_version)) > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_kind, cutoff_at, request_digest)
);

CREATE INDEX IF NOT EXISTS ix_market_intelligence_run_receipt_cutoff
  ON analytics.market_intelligence_run_receipt (cutoff_at DESC, run_kind);

DROP TRIGGER IF EXISTS market_intelligence_run_receipt_append_only
  ON analytics.market_intelligence_run_receipt;
CREATE TRIGGER market_intelligence_run_receipt_append_only
  BEFORE UPDATE OR DELETE ON analytics.market_intelligence_run_receipt
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();

-- The K4 analytics transaction owns the event -> shock -> exposure chain. It
-- receives append rights only on the three world ledgers required to anchor a
-- source-grounded filing event; numeric facts remain read-only to this role.
GRANT SELECT, INSERT ON
  world.event, world.event_revision, world.event_participant
  TO si_analytics;

GRANT SELECT, INSERT ON analytics.market_intelligence_run_receipt TO si_analytics;
GRANT SELECT ON analytics.market_intelligence_run_receipt
  TO si_knowledge, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics
  TO si_analytics, si_knowledge, si_publisher;
`;
