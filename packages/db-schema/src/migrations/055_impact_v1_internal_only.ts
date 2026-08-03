export const impactV1InternalOnlyMigrationSql = `
-- Declares the v1 impact plane internal-only. This changes no data and no
-- structure — it records, where anyone inspecting the schema will see it, a fact
-- that was true but undocumented for two weeks.
--
-- serving.impact_summary_v1 has returned 0 rows since migration 023 (2026-07-19)
-- and structurally cannot return more. 023 replaced its gate with "every path
-- edge must resolve through serving.relation_current_v1", and that view exposes
-- only ISSUED_BY relations (identity_mapping is the only evidence kind any
-- relation has, and it applies to ISSUED_BY alone). run-graph-inference.ts, which
-- writes analytics.impact_path, excludes ISSUED_BY from its predicate allowlist.
-- The two sets are disjoint by construction, so the yield is pinned at 0 no
-- matter how many paths are produced.
--
-- The gate is not being relaxed: those paths genuinely have no evidence backing,
-- and widening it would publish sourceless impact claims against the read-only
-- truth contract. The product is served by the v2 plane instead
-- (analytics.impact_path_v2 -> serving.content_pack of kind 'impact_brief'),
-- whose steps carry real foreign keys to snapshot edges.

COMMENT ON VIEW serving.impact_summary_v1 IS
  'DEPRECATED — always empty. Its edge gate requires ISSUED_BY relations while '
  'analytics.impact_path only ever contains non-ISSUED_BY predicates, so the '
  'intersection is empty by construction (since migration 023, 2026-07-19). '
  'Not a serving surface. Use content packs of kind impact_brief instead.';

COMMENT ON TABLE analytics.impact_path IS
  'INTERNAL ANALYSIS ONLY — not servable. Written nightly by '
  'run-graph-inference.ts; reaches no product surface because '
  'serving.impact_summary_v1 cannot expose it. The servable impact plane is '
  'analytics.impact_path_v2 with analytics.impact_path_step.';
`;
