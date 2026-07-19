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
`;
