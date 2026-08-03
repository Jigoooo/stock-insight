export const marketFactSourceLineageMigrationSql = `
-- Gives market.* somewhere to record where a row came from.
--
-- Four collectors (DART, SEC, FRED, FINRA) write straight into market.* and leave
-- no ingestion.source_revision behind. That was described as "they skip the
-- contract layer", but the gap is more basic than a missing call: none of the
-- seven market.* tables has a column that could hold the lineage. Measured
-- 2026-08-03 — 0 of 7.
--
-- Without it a fact cannot be traced to the exact fetched payload it came from,
-- and nothing downstream can require that provenance. It is also what blocks the
-- ownership relation builder, which needs a sourceRevisionId per observation
-- before it can emit an evidence-backed candidate.
--
-- Nullable on purpose: the existing rows predate the contract layer and inventing
-- a revision for them would be manufacturing provenance. New rows carry it;
-- backfill of old rows is a separate decision with its own evidence question.

ALTER TABLE market.financial_fact
  ADD COLUMN IF NOT EXISTS source_revision_id BIGINT
    REFERENCES ingestion.source_revision(source_revision_id);

CREATE INDEX IF NOT EXISTS ix_market_financial_fact_source_revision
  ON market.financial_fact (source_revision_id)
  WHERE source_revision_id IS NOT NULL;

COMMENT ON COLUMN market.financial_fact.source_revision_id IS
  'ingestion.source_revision that produced this fact. NULL for rows loaded before '
  'the collector was routed through the contract layer; never invented for them.';
`;
