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

-- Backfill immutable source revisions in observed order.
WITH ranked AS (
  SELECT raw.raw_object_id,
         identity.source_record_identity_id,
         row_number() OVER (
           PARTITION BY identity.source_record_identity_id
           ORDER BY raw.fetched_at, raw.raw_object_id
         )::integer AS revision_no,
         raw.fetched_at AS available_at,
         raw.content_hash,
         contract.source_contract_revision_id,
         raw.http_meta,
         lag(raw.raw_object_id) OVER (
           PARTITION BY identity.source_record_identity_id
           ORDER BY raw.fetched_at, raw.raw_object_id
         ) AS previous_raw_object_id
  FROM ingestion.raw_object raw
  JOIN ingestion.source_record_identity identity
    ON identity.source_id = raw.source_id
   AND identity.provider_record_key = coalesce(nullif(raw.source_document_id, ''), 'hash:' || raw.content_hash)
  JOIN ingestion.source_contract_revision contract
    ON contract.source_id = raw.source_id AND contract.revision_no = 1
), resolved AS (
  SELECT ranked.*,
         previous.source_revision_id AS supersedes_source_revision_id
  FROM ranked
  LEFT JOIN ingestion.source_revision previous
    ON previous.raw_object_id = ranked.previous_raw_object_id
)
INSERT INTO ingestion.source_revision (
  source_record_identity_id, revision_no, available_at, ingested_at,
  content_hash, raw_object_id, source_contract_revision_id,
  supersedes_source_revision_id, payload_metadata
)
SELECT source_record_identity_id, revision_no, available_at, available_at,
       content_hash, raw_object_id, source_contract_revision_id,
       supersedes_source_revision_id, coalesce(http_meta, '{}')
FROM resolved
ON CONFLICT (source_record_identity_id, revision_no) DO NOTHING;

GRANT SELECT ON ingestion.source_contract_revision,
                ingestion.source_record_identity,
                ingestion.source_revision
TO stock_insight_app_reader;
`;
