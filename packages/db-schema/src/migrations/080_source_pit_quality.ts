export const sourcePitQualityMigrationSql = `
-- PIT reconstructability class per source — REQ-KERN-020.
--
-- canonical/02 §3 grades how far back a source can honestly be replayed:
--
--   PIT_A_NATIVE_VINTAGE      the source publishes its own revision history
--   PIT_B_VERSIONED_ARTIFACT  immutable, individually addressable artifacts
--   PIT_C_OUR_ARCHIVE         no source history; PIT holds only from our snapshot
--   PIT_D_LATEST_ONLY         only the current state is ever observable
--   PIT_E_UNKNOWN             not established
--
-- REQ-KERN-020 then forbids PIT_D/E data as a core input to past ex-ante
-- evaluation. Without the grade recorded, that rule is unenforceable — which is
-- the state this database has been in.
--
-- WHY A SEPARATE TABLE INSTEAD OF A COLUMN ON source_contract_revision.
-- canonical/08 §1 lists the class as part of the source contract, and that was
-- the plan. It is not possible: ingestion.source_contract_revision carries the
-- trigger source_contract_revision_immutable, so existing rows cannot be updated,
-- and each row has a content_hash over the contract it states. Adding a column
-- and backfilling it would either fail outright or, if forced, leave 69 revisions
-- whose hash no longer describes their content. Grading is also a judgement we
-- expect to revise as we learn a source, which is a different lifecycle from the
-- contract itself. So the grade gets its own append-only ledger keyed by source,
-- and revising a grade is a new revision rather than an edit.
--
-- WHY MOST SOURCES START AT PIT_E. The grade gates ex-ante use, so guessing high
-- is the dangerous direction: an over-claimed PIT_A silently admits data the
-- system could not really have had. Only sources with a stated, checkable reason
-- are graded here; the remaining 29 are recorded as PIT_E_UNKNOWN, which reads as
-- "not established" and fails closed. That mirrors market.macro_vintage's
-- vintage_quality column, which records "this vintage is approximate" rather than
-- pretending an axis exists.
--
-- GRANTS: pipeline roles only. See migration 078 on why the app roles get nothing
-- and why that means no boot-digest re-pin.

CREATE TABLE IF NOT EXISTS governance.source_pit_quality (
    source_pit_quality_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id   BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),

    pit_quality_class TEXT NOT NULL CHECK (pit_quality_class IN (
      'PIT_A_NATIVE_VINTAGE',
      'PIT_B_VERSIONED_ARTIFACT',
      'PIT_C_OUR_ARCHIVE',
      'PIT_D_LATEST_ONLY',
      'PIT_E_UNKNOWN'
    )),

    -- The reason has to be checkable by a reader, not just asserted. A grade with
    -- an empty rationale is the over-claim this table exists to prevent.
    rationale TEXT NOT NULL CHECK (length(btrim(rationale)) > 0),

    -- From when our archive supports point-in-time replay. Meaningful for
    -- PIT_C; null elsewhere.
    archive_pit_from TIMESTAMPTZ,

    known_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),

    UNIQUE (source_id, revision_no),

    CONSTRAINT source_pit_quality_archive_from_scope CHECK (
      archive_pit_from IS NULL OR pit_quality_class = 'PIT_C_OUR_ARCHIVE'
    )
);

CREATE INDEX IF NOT EXISTS source_pit_quality_source_idx
  ON governance.source_pit_quality (source_id, revision_no DESC);

CREATE OR REPLACE FUNCTION governance.reject_source_pit_quality_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.source_pit_quality is append-only (delete rejected for %)',
      OLD.source_pit_quality_id;
  END IF;
  RAISE EXCEPTION 'governance.source_pit_quality is append-only; add a revision instead (%)',
    OLD.source_pit_quality_id;
END;
$$;

DROP TRIGGER IF EXISTS source_pit_quality_append_only ON governance.source_pit_quality;
CREATE TRIGGER source_pit_quality_append_only
  BEFORE DELETE OR UPDATE ON governance.source_pit_quality
  FOR EACH ROW EXECUTE FUNCTION governance.reject_source_pit_quality_mutation();

-- Latest grade per source. Mirrors ingestion.source_contract_current_v1, which is
-- how the source-contract audit already resolves "current" over a revision ledger.
CREATE OR REPLACE VIEW governance.source_pit_quality_current_v1 AS
SELECT DISTINCT ON (quality.source_id)
       quality.source_id,
       source.provider_key,
       quality.revision_no,
       quality.pit_quality_class,
       quality.rationale,
       quality.archive_pit_from,
       quality.known_at
  FROM governance.source_pit_quality quality
  JOIN ingestion.source source ON source.source_id = quality.source_id
 ORDER BY quality.source_id, quality.revision_no DESC;

-- ── initial grading (2026-08-08) ───────────────────────────────────────────────
-- Derived from ingestion.source rather than hardcoded ids, so a source added
-- later is picked up by a re-run instead of needing a new migration. Every source
-- gets exactly one revision-1 row; re-running is a no-op via NOT EXISTS.

INSERT INTO governance.source_pit_quality
  (source_id, revision_no, pit_quality_class, rationale, archive_pit_from, created_by)
SELECT source.source_id,
       1,
       graded.pit_quality_class,
       graded.rationale,
       CASE WHEN graded.pit_quality_class = 'PIT_C_OUR_ARCHIVE'
            THEN (SELECT min(revision.ingested_at)
                    FROM ingestion.source_revision revision
                    JOIN ingestion.source_record_identity identity
                      ON identity.source_record_identity_id = revision.source_record_identity_id
                   WHERE identity.source_id = source.source_id)
            ELSE NULL END,
       'migration-080'
  FROM ingestion.source source
 CROSS JOIN LATERAL (
   SELECT
     CASE
       -- ALFRED exposes the vintage axis natively; run-fred-vintage reads it.
       WHEN source.provider_key = 'fred'
         THEN 'PIT_A_NATIVE_VINTAGE'
       -- Filings are immutable and individually addressable (accession number /
       -- rcept_no). Re-fetching one returns the same bytes forever.
       WHEN source.provider_key IN ('sec-edgar','opendart','opendart-business-report-supply')
         THEN 'PIT_B_VERSIONED_ARTIFACT'
       -- Our own snapshots by construction: the artifact is something we wrote.
       WHEN source.source_type = 'internal'
         THEN 'PIT_C_OUR_ARCHIVE'
       -- ECOS publishes no revision axis. run-ecos-vintage.ts sets
       -- vintage_date = observation_date and marks vintage_quality approximate;
       -- PIT therefore holds only from our first snapshot.
       WHEN source.provider_key = 'bok-ecos'
         THEN 'PIT_C_OUR_ARCHIVE'
       -- Quote and market-data APIs answer with current state only. Asking for a
       -- past as-of returns today's view of the past, not the past's view.
       WHEN source.provider_key IN ('yfinance','pykrx','coingecko','coingecko-global','alternative-me')
         THEN 'PIT_D_LATEST_ONLY'
       ELSE 'PIT_E_UNKNOWN'
     END AS pit_quality_class,
     CASE
       WHEN source.provider_key = 'fred'
         THEN 'ALFRED publishes real vintages; market.macro_vintage stores them with vintage_quality=realtime.'
       WHEN source.provider_key IN ('sec-edgar','opendart','opendart-business-report-supply')
         THEN 'Filings are immutable and individually addressable; a re-fetch returns identical bytes.'
       WHEN source.source_type = 'internal'
         THEN 'Internal snapshot written by this system; PIT holds from our own archive by construction.'
       WHEN source.provider_key = 'bok-ecos'
         THEN 'ECOS exposes no revision axis (run-ecos-vintage sets vintage_quality=approx_collected); PIT holds only from our first snapshot.'
       WHEN source.provider_key IN ('yfinance','pykrx','coingecko','coingecko-global','alternative-me')
         THEN 'Current-state API: a historical request returns today view of the past, not the past view.'
       ELSE 'Not established. Graded E so REQ-KERN-020 fails closed rather than over-claiming replayability.'
     END AS rationale
 ) graded
 WHERE NOT EXISTS (
   SELECT 1 FROM governance.source_pit_quality existing
    WHERE existing.source_id = source.source_id
 );

GRANT SELECT, INSERT ON governance.source_pit_quality
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON governance.source_pit_quality TO si_readapi;
GRANT SELECT ON governance.source_pit_quality_current_v1
  TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
`;
