export const marketConfirmationReadsV2MigrationSql = `
-- Points serving.market_confirmation_v1 at the impact plane that has data.
--
-- The view exposes industry_link_strength and path_count, and both have been 0
-- and NULL for every one of its 253 rows since 2026-07-19. They came from
-- serving.impact_summary_v1, which returns 0 rows by construction: its gate
-- requires every path edge to resolve through serving.relation_current_v1, and
-- that view only ever exposes ISSUED_BY, a predicate the v1 path producer does
-- not emit. Migration 055 declared that plane internal-only. The consumer was
-- never moved with it, so the product kept LEFT JOINing an empty table and
-- reading zeros as though they were measurements.
--
-- The v2 plane does not have the disjoint-axis problem that killed v1. Measured
-- 2026-08-03: sealed v2 paths target Stock entities, latest_feature_snapshot_v1
-- rows are Stock entities, and 212 of its 253 assets are covered by paths on
-- currently servable impact_brief packs.
--
-- Column shape is unchanged, so this is not a contract change: the same columns
-- stop being placeholders. ORDER BY industry_link_strength DESC in the product
-- read model becomes meaningful for the first time — it previously degenerated
-- to market/ticker because every value tied at 0.

-- Same shape as impact_summary_v1 so both of its consumers can move without a
-- contract edit. Scoped to servable packs rather than "latest sealed snapshot":
-- that is what the product actually serves, so confirmation and the impact brief
-- cannot disagree about which snapshot is live.
CREATE OR REPLACE VIEW serving.impact_summary_v2 AS
WITH servable_path AS (
  SELECT DISTINCT
         path.impact_path_v2_id,
         path.target_entity_id,
         path.path_score,
         path.explanation,
         path.sealed_at
  FROM serving.v_relation_graph_freshness freshness
  JOIN serving.content_pack_item item
    ON item.content_pack_id = freshness.content_pack_id
  JOIN analytics.impact_path_v2 path
    ON path.impact_path_v2_id = item.impact_path_v2_id
  WHERE freshness.servable = true
    AND item.item_kind = 'impact_path'
)
SELECT servable_path.target_entity_id AS asset_entity_id,
       universe.market,
       universe.ticker,
       count(*)::integer AS path_count,
       max(servable_path.path_score) AS max_path_score,
       round(avg(servable_path.path_score)::numeric, 4) AS avg_path_score,
       -- 'eventType', not 'event_type'. The v2 producer writes camelCase keys;
       -- copying v1's expression verbatim would yield an array of NULLs that
       -- still type-checks and still renders.
       array_agg(DISTINCT servable_path.explanation ->> 'eventType') AS event_types,
       max(servable_path.sealed_at) AS computed_at
FROM servable_path
JOIN core.v_security_universe universe
  ON universe.security_entity_id = servable_path.target_entity_id
GROUP BY servable_path.target_entity_id, universe.market, universe.ticker;

COMMENT ON VIEW serving.impact_summary_v2 IS
  'Per-asset impact summary over paths on currently servable impact_brief packs. '
  'Replaces impact_summary_v1 for product reads; v1 is internal-only per migration 055.';

CREATE OR REPLACE VIEW serving.market_confirmation_v1 AS
SELECT feature.asset_entity_id,
       feature.market,
       feature.ticker,
       feature.as_of,
       COALESCE(impact.max_path_score, 0::real) AS industry_link_strength,
       impact.path_count,
       (feature.features ->> 'ret_20d')::double precision AS ret_20d,
       (feature.features ->> 'volume_z_20d')::double precision AS volume_z_20d,
       CASE
         WHEN ((feature.features ->> 'ret_20d')::double precision) > 0.05::double precision
              AND COALESCE((feature.features ->> 'volume_z_20d')::double precision,
                           0::double precision) > 0.5::double precision THEN 'confirmed'
         WHEN ((feature.features ->> 'ret_20d')::double precision) > 0::double precision THEN 'partial'
         WHEN ((feature.features ->> 'ret_20d')::double precision) IS NULL THEN 'unknown'
         ELSE 'not_confirmed'
       END AS market_confirmation,
       (feature.features ->> 'rsi_14')::double precision AS rsi_14,
       (feature.features ->> 'ma20_gap')::double precision AS ma20_gap,
       CASE
         WHEN ((feature.features ->> 'rsi_14')::double precision) >= 70::double precision
              OR COALESCE((feature.features ->> 'ma20_gap')::double precision,
                          0::double precision) > 0.10::double precision THEN 'high'
         WHEN ((feature.features ->> 'rsi_14')::double precision) >= 55::double precision THEN 'medium'
         WHEN ((feature.features ->> 'rsi_14')::double precision) IS NULL THEN 'unknown'
         ELSE 'low'
       END AS expectation_priced_in
FROM serving.latest_feature_snapshot_v1 feature
LEFT JOIN serving.impact_summary_v2 impact
  ON impact.asset_entity_id = feature.asset_entity_id;

COMMENT ON VIEW serving.market_confirmation_v1 IS
  'Market confirmation per asset. industry_link_strength and path_count read '
  'serving.impact_summary_v2 as of migration 059; they were structurally 0/NULL '
  'while sourced from the v1 plane. The COALESCE to 0 now means "no servable '
  'impact path for this asset", not "the impact plane is empty".';
`;
