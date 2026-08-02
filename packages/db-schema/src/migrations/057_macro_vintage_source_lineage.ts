export const macroVintageSourceLineageMigrationSql = `
-- Second market.* table to get a lineage column, same reasoning as 056.
--
-- market.macro_vintage stores every (observation_date, vintage_date) pair so a
-- past report can be reconstructed from what was known at the time. That promise
-- is only as good as knowing WHICH fetch produced a vintage — and until now the
-- table had nowhere to record it, so "what did we know on this date" could be
-- answered from the data but not audited against the payload it came from.
--
-- Nullable, not backfilled: rows loaded before the collector was routed have no
-- revision, and minting one for them would manufacture provenance.

ALTER TABLE market.macro_vintage
  ADD COLUMN IF NOT EXISTS source_revision_id BIGINT
    REFERENCES ingestion.source_revision(source_revision_id);

CREATE INDEX IF NOT EXISTS ix_market_macro_vintage_source_revision
  ON market.macro_vintage (source_revision_id)
  WHERE source_revision_id IS NOT NULL;

COMMENT ON COLUMN market.macro_vintage.source_revision_id IS
  'ingestion.source_revision that produced this vintage. NULL for rows loaded '
  'before the collector was routed through the contract layer; never invented.';
`;
