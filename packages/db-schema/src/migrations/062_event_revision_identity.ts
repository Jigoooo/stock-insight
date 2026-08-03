export const eventRevisionIdentityMigrationSql = `
-- Gives knowledge.event the revision identity every other observation table here
-- already has.
--
-- knowledge.assertion, world.event_revision, governance.coverage_ledger and
-- ingestion.source_revision all carry (key, revision_no) and answer "which
-- observation is current" from their own columns. knowledge.event encodes the
-- same structure inside a string:
--
--   extract-v2:{document_id}:r{revision_no}:{event_type}:{subject}
--
-- so nothing can express that one extraction supersedes another. When a document
-- is re-fetched and its revision_no increments, extraction runs again and
-- ON CONFLICT (dedupe_key) DO NOTHING cannot suppress it — the key differs by the
-- revision. Measured 2026-08-03: 680 extract-v2 events collapse to 640 distinct
-- observations, so 40 (5.9%) are the same fact recorded twice. Of the 24 affected
-- groups, 15 have byte-identical summary text and 9 genuinely differ; both kinds
-- currently reach the product with nothing marking which is newer.
--
-- Reading the structure back out of the string at query time was the alternative.
-- It was rejected: the format is safe today (680/680 parse, no stray colons) but
-- that is a property of current data, not a guarantee, and a view that parses the
-- key breaks silently when the extractor changes it. Columns fail loudly.

ALTER TABLE knowledge.event
  ADD COLUMN IF NOT EXISTS event_key TEXT,
  ADD COLUMN IF NOT EXISTS revision_no INTEGER NOT NULL DEFAULT 1;

-- Three key families exist. Only extract-v2 carries a revision; legacy-signal
-- (2,971) and extract-v1 (389) have exactly one observation each by construction,
-- so their key is their dedupe_key and their revision is 1.
--
-- The parse runs once, here, with the format known and verified. It is not left
-- in a view to be re-run against future data.
UPDATE knowledge.event
SET event_key = CASE
      WHEN dedupe_key ~ '^extract-v2:[0-9]+:r[0-9]+:'
        THEN regexp_replace(dedupe_key, '^(extract-v2:[0-9]+):r[0-9]+:(.*)$', '\\1:\\2')
      ELSE dedupe_key
    END,
    revision_no = CASE
      WHEN dedupe_key ~ '^extract-v2:[0-9]+:r[0-9]+:'
        THEN (regexp_match(dedupe_key, '^extract-v2:[0-9]+:r([0-9]+):'))[1]::integer
      ELSE 1
    END
WHERE event_key IS NULL;

ALTER TABLE knowledge.event
  ALTER COLUMN event_key SET NOT NULL;

-- Verified before adding: 4,040 rows produce 4,040 distinct pairs.
ALTER TABLE knowledge.event
  ADD CONSTRAINT event_key_revision_key UNIQUE (event_key, revision_no);

CREATE INDEX IF NOT EXISTS ix_event_key_revision
  ON knowledge.event (event_key, revision_no DESC);

COMMENT ON COLUMN knowledge.event.event_key IS
  'Identity of the observed fact across re-extractions. Stable when a document is '
  're-fetched; dedupe_key stays unique per extraction and is not a substitute.';
COMMENT ON COLUMN knowledge.event.revision_no IS
  'Which extraction of event_key this row is. Numbers are not contiguous — a '
  'document can skip revisions — so current means the highest, not the last plus one.';

-- The one place consumers should read from. Attribution, impact paths and any
-- surface listing events all need the same answer to "which observation counts",
-- and each deriving it separately is how the two-copies problem returns.
CREATE OR REPLACE VIEW serving.v_knowledge_event_current_v1 AS
SELECT DISTINCT ON (event.event_key)
       event.event_id,
       event.event_key,
       event.revision_no,
       event.event_type,
       event.actor_entity_id,
       event.target_entity_id,
       event.occurred_at,
       event.announced_at,
       event.magnitude,
       event.magnitude_unit,
       event.verification_status,
       event.source_document_id,
       event.summary_text,
       event.metadata,
       event.created_at
FROM knowledge.event event
ORDER BY event.event_key, event.revision_no DESC, event.event_id DESC;

COMMENT ON VIEW serving.v_knowledge_event_current_v1 IS
  'Highest revision per event_key. Superseded extractions stay in knowledge.event '
  'as the record of what was known earlier; this view is what the product reads.';
`;
