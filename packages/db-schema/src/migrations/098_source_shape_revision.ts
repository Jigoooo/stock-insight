export const sourceShapeRevisionMigrationSql = `
-- The input ingestion.parser.drift needs and nothing produced.
--
-- Migration 083 defined that SLO — "Sources whose parsed shape changed since the
-- last run. Schema drift under a working fetch is the failure a success code cannot
-- show" — over subject ingestion.source, which has no shape column. Nothing anywhere
-- records what a source's payload looked like, so the gauge could never be measured:
-- it was a definition with no possible observation, the same shape as the SLO ledger
-- having no writer.
--
-- WHY A SEPARATE LEDGER AND NOT A COLUMN ON source_revision. A shape is derived, not
-- collected. Putting it on the revision row would make a derived reading look like
-- part of the fetched artifact, and REQ-EVD-004 keeps those apart. It also lets the
-- extractor run over history without touching the ingestion path.
--
-- WHY governance. Same call migrations 083 and 095 made: ops is shared table by table
-- with the older research app, governance is ours.
--
-- APPEND-ONLY. A raw object is immutable and its content hash is verified on read, so
-- the same revision always yields the same shape. A row that could be updated would
-- let a later run rewrite what a source used to look like, which is exactly the
-- history the drift comparison depends on.

CREATE TABLE IF NOT EXISTS governance.source_shape_revision (
    source_shape_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_revision_id BIGINT NOT NULL UNIQUE
      REFERENCES ingestion.source_revision(source_revision_id),
    source_id BIGINT NOT NULL REFERENCES ingestion.source(source_id),

    -- How the shape was read. A JSON payload and a delimited export are not
    -- comparable descriptions, and naming the kind keeps a change of format from
    -- reading as a change of fields.
    shape_kind TEXT NOT NULL CHECK (shape_kind IN ('json_key_paths', 'delimited_header')),
    shape_digest TEXT NOT NULL CHECK (shape_digest ~ '^[a-f0-9]{64}$'),
    shape JSONB NOT NULL CHECK (jsonb_typeof(shape) = 'array'),

    -- The revision's own arrival time, carried here so drift can be windowed without
    -- joining back, and so a backfill of old revisions does not read as recent drift.
    revision_ingested_at TIMESTAMPTZ NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    observed_by TEXT NOT NULL CHECK (length(btrim(observed_by)) > 0)
);

CREATE INDEX IF NOT EXISTS source_shape_revision_source_idx
  ON governance.source_shape_revision (source_id, revision_ingested_at DESC);

CREATE OR REPLACE FUNCTION governance.reject_source_shape_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $shape$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.source_shape_revision is append-only (delete rejected for %)',
      OLD.source_shape_revision_id;
  END IF;
  RAISE EXCEPTION 'governance.source_shape_revision is append-only (update rejected for %)',
    OLD.source_shape_revision_id;
END
$shape$;

DROP TRIGGER IF EXISTS source_shape_revision_append_only ON governance.source_shape_revision;
CREATE TRIGGER source_shape_revision_append_only
  BEFORE DELETE OR UPDATE ON governance.source_shape_revision
  FOR EACH ROW EXECUTE FUNCTION governance.reject_source_shape_mutation();

COMMENT ON TABLE governance.source_shape_revision IS
  'Derived payload shape per source revision, so ingestion.parser.drift has an input. A revision whose raw object cannot be read or parsed gets no row and is reported as uncomparable rather than given an invented shape.';

REVOKE ALL ON governance.source_shape_revision FROM PUBLIC;
GRANT SELECT, INSERT ON governance.source_shape_revision
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON governance.source_shape_revision TO si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
`;
