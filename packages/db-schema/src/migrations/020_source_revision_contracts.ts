export const sourceRevisionContractsMigrationSql = `
-- B2 — Source contracts and immutable revisions (master plan §3.3, B2).
-- Additive-first. Existing ingestion.source/raw_object remain operational while
-- immutable revision ledgers become the authoritative provenance contract.

CREATE TABLE IF NOT EXISTS ingestion.source_contract_revision (
    source_contract_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id                    BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    revision_no                  INTEGER NOT NULL CHECK (revision_no > 0),
    policy_status                TEXT NOT NULL DEFAULT 'provisional_review_required'
      CHECK (policy_status IN ('provisional_review_required','approved','retired')),
    cadence_policy               JSONB NOT NULL DEFAULT '{"state":"unknown"}',
    cutoff_policy                JSONB NOT NULL DEFAULT '{"state":"unknown"}',
    delay_policy                 JSONB NOT NULL DEFAULT '{"state":"unknown"}',
    correction_policy            JSONB NOT NULL DEFAULT '{"mode":"append_revision"}',
    required_fields              JSONB NOT NULL DEFAULT '[]',
    license_policy               JSONB NOT NULL DEFAULT '{}',
    redistribution_policy        JSONB NOT NULL DEFAULT '{}',
    raw_retention_policy         JSONB NOT NULL DEFAULT '{"mode":"retain"}',
    quality_gate_policy          JSONB NOT NULL DEFAULT '{}',
    effective_from               TIMESTAMPTZ NOT NULL,
    effective_to                 TIMESTAMPTZ,
    known_from                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    known_to                     TIMESTAMPTZ,
    supersedes_contract_revision_id BIGINT REFERENCES ingestion.source_contract_revision(source_contract_revision_id),
    content_hash                 TEXT NOT NULL,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, revision_no),
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    CHECK (known_to IS NULL OR known_to > known_from)
);

DROP INDEX IF EXISTS ingestion.uq_source_contract_revision_active;
CREATE INDEX IF NOT EXISTS ix_source_contract_revision_latest
ON ingestion.source_contract_revision(source_id, revision_no DESC)
WHERE known_to IS NULL;

CREATE OR REPLACE VIEW ingestion.source_contract_current_v1 AS
SELECT DISTINCT ON (source_id) *
FROM ingestion.source_contract_revision
ORDER BY source_id,revision_no DESC,known_from DESC;

CREATE TABLE IF NOT EXISTS ingestion.source_record_identity (
    source_record_identity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id                 BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    provider_record_key       TEXT NOT NULL,
    first_observed_at         TIMESTAMPTZ NOT NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, provider_record_key)
);

CREATE TABLE IF NOT EXISTS ingestion.source_revision (
    source_revision_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_record_identity_id    BIGINT NOT NULL REFERENCES ingestion.source_record_identity(source_record_identity_id),
    revision_no                  INTEGER NOT NULL CHECK (revision_no > 0),
    available_at                 TIMESTAMPTZ NOT NULL,
    ingested_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_hash                 TEXT NOT NULL,
    raw_object_id                BIGINT NOT NULL REFERENCES ingestion.raw_object(raw_object_id),
    source_contract_revision_id  BIGINT NOT NULL REFERENCES ingestion.source_contract_revision(source_contract_revision_id),
    supersedes_source_revision_id BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    payload_metadata             JSONB NOT NULL DEFAULT '{}',
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_record_identity_id, revision_no),
    CHECK (supersedes_source_revision_id IS NULL OR revision_no > 1)
);

-- Reappearing bytes are a legitimate new temporal revision (A→B→A), and a
-- content-addressed raw object may therefore back more than one revision.
ALTER TABLE ingestion.source_revision
  DROP CONSTRAINT IF EXISTS source_revision_source_record_identity_id_content_hash_key,
  DROP CONSTRAINT IF EXISTS source_revision_raw_object_id_key;

CREATE INDEX IF NOT EXISTS ix_source_revision_pit
ON ingestion.source_revision(source_record_identity_id, available_at, revision_no DESC);

-- Immutable ledgers: source corrections append a new revision. No UPDATE/DELETE.
CREATE OR REPLACE FUNCTION ingestion.reject_immutable_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; append a revision instead', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

DROP TRIGGER IF EXISTS source_contract_revision_immutable ON ingestion.source_contract_revision;
CREATE TRIGGER source_contract_revision_immutable
BEFORE UPDATE OR DELETE ON ingestion.source_contract_revision
FOR EACH ROW EXECUTE FUNCTION ingestion.reject_immutable_revision_mutation();

DROP TRIGGER IF EXISTS source_record_identity_immutable ON ingestion.source_record_identity;
CREATE TRIGGER source_record_identity_immutable
BEFORE UPDATE OR DELETE ON ingestion.source_record_identity
FOR EACH ROW EXECUTE FUNCTION ingestion.reject_immutable_revision_mutation();

DROP TRIGGER IF EXISTS source_revision_immutable ON ingestion.source_revision;
CREATE TRIGGER source_revision_immutable
BEFORE UPDATE OR DELETE ON ingestion.source_revision
FOR EACH ROW EXECUTE FUNCTION ingestion.reject_immutable_revision_mutation();

CREATE OR REPLACE FUNCTION ingestion.enqueue_source_revision_outbox(revision_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,ingestion,ops,public AS $$
DECLARE event_payload JSONB;
DECLARE event_key TEXT;
DECLARE identity_id BIGINT;
DECLARE source_id_value BIGINT;
DECLARE revision_no_value INTEGER;
DECLARE ingested_at_value TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ops.event_schema_registry
    WHERE event_type='source.revision.appended' AND schema_version=1 AND active
  ) THEN
    RAISE EXCEPTION 'source.revision.appended v1 schema is not active';
  END IF;
  SELECT revision.source_record_identity_id,identity.source_id,revision.revision_no,revision.ingested_at,
         jsonb_build_object(
           'source_revision_id',revision.source_revision_id,
           'source_record_identity_id',revision.source_record_identity_id,
           'source_id',identity.source_id,
           'provider_record_key',identity.provider_record_key,
           'raw_object_id',revision.raw_object_id,
           'source_contract_revision_id',revision.source_contract_revision_id,
           'content_hash',revision.content_hash,
           'available_at',revision.available_at
         )
    INTO identity_id,source_id_value,revision_no_value,ingested_at_value,event_payload
  FROM ingestion.source_revision revision
  JOIN ingestion.source_record_identity identity USING(source_record_identity_id)
  WHERE revision.source_revision_id=revision_id;
  IF identity_id IS NULL THEN RAISE EXCEPTION 'source revision % is missing',revision_id; END IF;
  event_key := 'evt-'||substr(encode(digest(convert_to(
    'source_record|'||identity_id::text||'|'||revision_no_value::text||'|source.revision.appended|1','UTF8'
  ),'sha256'),'hex'),1,32);
  INSERT INTO ops.outbox_event (
    event_id,event_type,schema_version,aggregate_type,aggregate_id,aggregate_version,
    partition_key,occurred_at,producer,payload,payload_hash
  ) VALUES (
    event_key,'source.revision.appended',1,'source_record',identity_id::text,revision_no_value,
    source_id_value::text,ingested_at_value,'source-revision-db',event_payload,
    encode(digest(convert_to(event_payload::text,'UTF8'),'sha256'),'hex')
  ) ON CONFLICT (aggregate_type,aggregate_id,aggregate_version) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM ops.outbox_event
    WHERE aggregate_type='source_record' AND aggregate_id=identity_id::text
      AND aggregate_version=revision_no_value
      AND event_type='source.revision.appended' AND schema_version=1
  ) THEN
    RAISE EXCEPTION 'conflicting outbox event occupies source revision aggregate version';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ingestion.emit_source_revision_outbox()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,ingestion,ops,public AS $$
BEGIN
  PERFORM ingestion.enqueue_source_revision_outbox(NEW.source_revision_id);
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION ingestion.enqueue_source_revision_outbox(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingestion.emit_source_revision_outbox() FROM PUBLIC;

DROP TRIGGER IF EXISTS source_revision_outbox ON ingestion.source_revision;
CREATE TRIGGER source_revision_outbox
AFTER INSERT ON ingestion.source_revision
FOR EACH ROW EXECUTE FUNCTION ingestion.emit_source_revision_outbox();

-- Conservative baseline contract for every active source. Unknown cadence/cutoff
-- stays explicit; no timing/license fact is invented. Source metadata supplies
-- only values already present in ingestion.source. These rows require review
-- before policy_status may become approved (approval itself appends revision 2).
INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status, cadence_policy, cutoff_policy,
  delay_policy, correction_policy, required_fields, license_policy,
  redistribution_policy, raw_retention_policy, quality_gate_policy,
  effective_from, known_from, content_hash
)
SELECT source.source_id,
       1,
       'provisional_review_required',
       '{"state":"unknown"}'::jsonb,
       '{"state":"unknown"}'::jsonb,
       '{"state":"unknown"}'::jsonb,
       '{"mode":"append_revision"}'::jsonb,
       '[]'::jsonb,
       jsonb_build_object('license_status', source.license_status),
       jsonb_build_object('redistribution', source.redistribution, 'enforcement', source.enforcement),
       '{"mode":"retain"}'::jsonb,
       jsonb_build_object('tier', source.tier, 'state', 'review_required'),
       source.created_at,
       now(),
       encode(sha256(convert_to(
         source.provider_key || '|baseline-b2-v1|' || source.license_status || '|' || source.redistribution,
         'UTF8'
       )), 'hex')
FROM ingestion.source source
ON CONFLICT (source_id, revision_no) DO NOTHING;

-- Backfill stable record identities from raw objects. When a provider record key
-- is absent, the immutable content hash is the honest identity fallback.
INSERT INTO ingestion.source_record_identity (
  source_id, provider_record_key, first_observed_at
)
SELECT raw.source_id,
       coalesce(nullif(raw.source_document_id, ''), 'hash:' || raw.content_hash),
       min(raw.fetched_at)
FROM ingestion.raw_object raw
GROUP BY raw.source_id, coalesce(nullif(raw.source_document_id, ''), 'hash:' || raw.content_hash)
ON CONFLICT (source_id, provider_record_key) DO NOTHING;

-- Append only raw rows that do not yet have lineage. Revision order is append
-- order; available_at independently preserves provider time, including late data.
DO $$
DECLARE identity_row RECORD;
DECLARE raw_row RECORD;
DECLARE next_revision INTEGER;
DECLARE previous_revision_id BIGINT;
DECLARE contract_id BIGINT;
BEGIN
  FOR identity_row IN
    SELECT identity.source_record_identity_id,identity.source_id
    FROM ingestion.source_record_identity identity
    WHERE EXISTS (
      SELECT 1 FROM ingestion.raw_object raw
      WHERE raw.source_id=identity.source_id
        AND coalesce(nullif(raw.source_document_id,''),'hash:'||raw.content_hash)=identity.provider_record_key
        AND NOT EXISTS (
          SELECT 1 FROM ingestion.source_revision revision
          WHERE revision.raw_object_id=raw.raw_object_id
        )
    )
    ORDER BY identity.source_record_identity_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('source-revision:'||identity_row.source_record_identity_id::text,0)
    );
    SELECT coalesce(max(revision_no),0),
           (array_agg(source_revision_id ORDER BY revision_no DESC))[1]
      INTO next_revision,previous_revision_id
    FROM ingestion.source_revision
    WHERE source_record_identity_id=identity_row.source_record_identity_id;
    SELECT source_contract_revision_id INTO contract_id
    FROM ingestion.source_contract_revision
    WHERE source_id=identity_row.source_id
    ORDER BY revision_no DESC LIMIT 1;

    FOR raw_row IN
      SELECT raw.* FROM ingestion.raw_object raw
      WHERE raw.source_id=identity_row.source_id
        AND coalesce(nullif(raw.source_document_id,''),'hash:'||raw.content_hash)=
            (SELECT provider_record_key FROM ingestion.source_record_identity
             WHERE source_record_identity_id=identity_row.source_record_identity_id)
        AND NOT EXISTS (
          SELECT 1 FROM ingestion.source_revision revision
          WHERE revision.raw_object_id=raw.raw_object_id
        )
      ORDER BY raw.fetched_at,raw.raw_object_id
    LOOP
      next_revision := next_revision+1;
      INSERT INTO ingestion.source_revision (
        source_record_identity_id,revision_no,available_at,ingested_at,
        content_hash,raw_object_id,source_contract_revision_id,
        supersedes_source_revision_id,payload_metadata
      ) VALUES (
        identity_row.source_record_identity_id,next_revision,raw_row.fetched_at,now(),
        raw_row.content_hash,raw_row.raw_object_id,contract_id,
        previous_revision_id,coalesce(raw_row.http_meta,'{}'::jsonb)
      ) RETURNING source_revision_id INTO previous_revision_id;
    END LOOP;
  END LOOP;
END $$;

-- Existing B2 revisions predate the trigger; emit each missing domain event
-- once. New revisions already emitted by source_revision_outbox are skipped.
SELECT ingestion.enqueue_source_revision_outbox(revision.source_revision_id)
FROM ingestion.source_revision revision
WHERE NOT EXISTS (
  SELECT 1 FROM ops.outbox_event event
  WHERE event.aggregate_type='source_record'
    AND event.aggregate_id=revision.source_record_identity_id::text
    AND event.aggregate_version=revision.revision_no
    AND event.event_type='source.revision.appended'
    AND event.schema_version=1
);

GRANT SELECT ON ingestion.source_contract_revision,
                ingestion.source_contract_current_v1,
                ingestion.source_record_identity,
                ingestion.source_revision
TO stock_insight_app_reader;
`;
