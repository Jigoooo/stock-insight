export const backendTruthGateMigrationSql = `
-- B0 — Product truth stop-line (master plan insight-platform-backend-db-v2 §B0).
-- Additive-only: replaces the serving impact exposure view so that impact paths
-- whose edges lack immutable source evidence are no longer exposed as product
-- truth, and records the gate policy version for readback.

-- 1) Impact exposure gate: every path edge must be backed by at least one
--    knowledge.relation_evidence row, and empty-edge paths are not exposable.
--    Column list/order is unchanged (CREATE OR REPLACE VIEW compatible), so the
--    dependent serving.market_confirmation_v1 view keeps working; unbacked
--    assets now surface there with industry_link_strength 0 instead of a
--    fabricated source-backed score.
CREATE OR REPLACE VIEW serving.impact_summary_v1 AS
SELECT path.target_entity_id AS asset_entity_id,
       universe.market,
       universe.ticker,
       count(*)::integer AS path_count,
       max(path.path_score) AS max_path_score,
       round(avg(path.path_score)::numeric, 4) AS avg_path_score,
       array_agg(DISTINCT path.explanation ->> 'event_type') AS event_types,
       max(path.created_at) AS computed_at
FROM analytics.impact_path path
JOIN core.v_security_universe universe
  ON universe.security_entity_id = path.target_entity_id
WHERE path.expires_at > now()
  AND cardinality(path.path_edges) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(path.path_edges) AS edge(relation_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM knowledge.relation_evidence evidence
      WHERE evidence.relation_id = edge.relation_id
    )
  )
GROUP BY path.target_entity_id, universe.market, universe.ticker;

GRANT SELECT ON serving.impact_summary_v1 TO stock_insight_app_reader;

-- 2) Gate policy registry readback: durable marker that the B0 truth gate is
--    active in this database (idempotent).
CREATE TABLE IF NOT EXISTS ops.truth_gate_policy (
    policy_key   TEXT PRIMARY KEY,
    policy_value JSONB NOT NULL,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO ops.truth_gate_policy (policy_key, policy_value)
VALUES (
  'b0_product_truth_stop_line',
  '{"version": "b0-v1",
    "public_fact_requires": "verification_status = verified",
    "impact_exposure_requires": "per-edge relation_evidence, non-empty path_edges",
    "availability": "stale rows must not be reported as available"}'::jsonb
)
ON CONFLICT (policy_key) DO UPDATE
SET policy_value = EXCLUDED.policy_value,
    applied_at = now();

GRANT SELECT ON ops.truth_gate_policy TO stock_insight_app_reader;

-- 3) Publish-time TOCTOU guard. Fact-bearing reports may transition to
-- published only while every typed event evidence row is still verified. The
-- row locks are held through pointer swap because the status update occurs in
-- the publisher transaction.
CREATE OR REPLACE FUNCTION content.guard_report_fact_publish()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_fact BOOLEAN;
BEGIN
  IF NEW.status<>'published' OR (TG_OP='UPDATE' AND OLD.status='published') THEN
    RETURN NEW;
  END IF;
  has_fact := jsonb_path_exists(
    NEW.report_payload,
    '$.sections[*].blocks[*] ? (@.block_type == "fact")'
  );
  IF NOT has_fact THEN RETURN NEW; END IF;

  PERFORM event.event_id
  FROM content.report_evidence evidence
  JOIN knowledge.event event ON event.event_id=evidence.evidence_id
  WHERE evidence.report_id=NEW.report_id AND evidence.evidence_type='event'
  ORDER BY event.event_id
  FOR KEY SHARE OF event;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fact-bearing report requires typed event evidence';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM content.report_evidence evidence
    JOIN knowledge.event event ON event.event_id=evidence.evidence_id
    WHERE evidence.report_id=NEW.report_id
      AND evidence.evidence_type='event'
      AND event.verification_status<>'verified'
  ) THEN
    RAISE EXCEPTION 'fact-bearing report requires currently verified event evidence';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS report_fact_publish_guard ON content.report;
CREATE TRIGGER report_fact_publish_guard
BEFORE INSERT OR UPDATE OF status ON content.report
FOR EACH ROW EXECUTE FUNCTION content.guard_report_fact_publish();

-- 4) A later contradiction/retraction immediately removes dependent fact
-- reports from the public latest pointer. History is preserved in content.report.
CREATE OR REPLACE FUNCTION content.invalidate_retracted_event_reports()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.verification_status='verified' AND NEW.verification_status<>'verified' THEN
    DELETE FROM serving.latest_report_pointer pointer
    USING content.report_evidence evidence, content.report report
    WHERE evidence.evidence_type='event'
      AND evidence.evidence_id=NEW.event_id
      AND evidence.report_id=report.report_id
      AND pointer.report_id=report.report_id
      AND jsonb_path_exists(
        report.report_payload,
        '$.sections[*].blocks[*] ? (@.block_type == "fact")'
      );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS event_report_truth_invalidator ON knowledge.event;
CREATE TRIGGER event_report_truth_invalidator
AFTER UPDATE OF verification_status ON knowledge.event
FOR EACH ROW EXECUTE FUNCTION content.invalidate_retracted_event_reports();
`;
