export const verifiedKnowledgeMigrationSql = `
-- B4 — Versioned chunks and verified knowledge (master plan §3.5, B4).
-- Existing legacy claims/events stay unverified. Migration never upgrades
-- truth status automatically.

ALTER TABLE knowledge.document_chunk
  ADD COLUMN IF NOT EXISTS revision_no INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parser_version TEXT NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_revision_id BIGINT REFERENCES ingestion.source_revision(source_revision_id),
  ADD COLUMN IF NOT EXISTS content_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE knowledge.document_chunk
  DROP CONSTRAINT IF EXISTS document_chunk_document_id_chunk_index_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_chunk_revision_position
ON knowledge.document_chunk(document_id, revision_no, chunk_index);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_chunk_document_chunk
ON knowledge.document_chunk(document_id,chunk_id);

CREATE INDEX IF NOT EXISTS ix_document_chunk_pit
ON knowledge.document_chunk(document_id, available_at, revision_no DESC, chunk_index);

-- One honest baseline chunk per legacy document, using only fields that are
-- actually present (title + summary). Metadata explicitly marks partial text;
-- this is not represented as a full-body parse.
INSERT INTO knowledge.document_chunk (
  document_id, chunk_index, content, token_count, content_hash,
  revision_no, parser_version, available_at, ingested_at,
  source_revision_id, content_metadata
)
SELECT document.document_id,
       0,
       trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,'')),
       greatest(1, ceil(length(trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,''))) / 4.0)::integer),
       encode(sha256(convert_to(trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,'')), 'UTF8')), 'hex'),
       1,
       'legacy-title-summary-b4-v1',
       document.available_at,
       now(),
       source_revision.source_revision_id,
       jsonb_build_object(
         'content_scope','title_and_summary_only',
         'full_body',false,
         'source_table','public.source_documents',
         'policy','b4-v1'
       )
FROM knowledge.document document
JOIN public.source_documents legacy ON legacy.id=document.legacy_source_document_pk
LEFT JOIN ingestion.source_revision source_revision
  ON source_revision.source_revision_id=(
    SELECT revision.source_revision_id
    FROM ingestion.source_revision revision
    JOIN ingestion.source_record_identity identity
      ON identity.source_record_identity_id=revision.source_record_identity_id
    WHERE identity.source_id=document.source_id
      AND revision.content_hash=document.content_hash
    ORDER BY revision.revision_no DESC LIMIT 1
  )
WHERE length(trim(coalesce(legacy.title,'') || E'\n' || coalesce(legacy.summary,''))) > 0
ON CONFLICT (document_id, revision_no, chunk_index) DO NOTHING;

-- Anchor existing claim quotes only when the exact quote occurs in the chunk.
DROP TRIGGER IF EXISTS claim_evidence_immutable ON knowledge.claim_evidence;
UPDATE knowledge.claim_evidence evidence
SET chunk_id=chunk.chunk_id
FROM knowledge.document_chunk chunk
WHERE evidence.document_id=chunk.document_id
  AND evidence.chunk_id IS NULL
  AND chunk.revision_no=1
  AND position(lower(evidence.quote) in lower(chunk.content)) > 0;

DO $$ BEGIN
  ALTER TABLE knowledge.claim_evidence
    ADD CONSTRAINT claim_evidence_chunk_id_fkey
    FOREIGN KEY (chunk_id) REFERENCES knowledge.document_chunk(chunk_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE knowledge.claim_evidence ALTER COLUMN chunk_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE knowledge.claim_evidence
    ADD CONSTRAINT claim_evidence_document_chunk_fkey
    FOREIGN KEY (document_id,chunk_id)
    REFERENCES knowledge.document_chunk(document_id,chunk_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS knowledge.event_evidence (
    event_id       BIGINT NOT NULL REFERENCES knowledge.event(event_id),
    document_id    BIGINT NOT NULL REFERENCES knowledge.document(document_id),
    chunk_id       BIGINT NOT NULL REFERENCES knowledge.document_chunk(chunk_id),
    quote          TEXT NOT NULL CHECK (length(trim(quote)) > 0),
    evidence_role  TEXT NOT NULL DEFAULT 'support'
      CHECK (evidence_role IN ('support','contradict','retract')),
    source_weight  REAL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, document_id)
);

DROP TRIGGER IF EXISTS event_evidence_immutable ON knowledge.event_evidence;
DO $$ BEGIN
  ALTER TABLE knowledge.event_evidence
    ADD CONSTRAINT event_evidence_document_chunk_fkey
    FOREIGN KEY (document_id,chunk_id)
    REFERENCES knowledge.document_chunk(document_id,chunk_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only events already carrying a source_document_id get evidence. Source quote
-- is the stored chunk excerpt, never generated event text.
INSERT INTO knowledge.event_evidence (
  event_id, document_id, chunk_id, quote, evidence_role, source_weight
)
SELECT event.event_id,
       document.document_id,
       chunk.chunk_id,
       left(chunk.content, 2000),
       'support',
       document.source_quality
FROM knowledge.event event
JOIN knowledge.document document ON document.document_id=event.source_document_id
JOIN knowledge.document_chunk chunk
  ON chunk.document_id=document.document_id AND chunk.revision_no=1 AND chunk.chunk_index=0
WHERE length(trim(chunk.content)) > 0
ON CONFLICT (event_id, document_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ops.verification_policy (
    subject_type           TEXT NOT NULL CHECK (subject_type IN ('claim','event')),
    target_status          TEXT NOT NULL CHECK (target_status IN ('corroborated','verified')),
    min_distinct_documents INTEGER NOT NULL CHECK (min_distinct_documents > 0),
    require_chunk_quote    BOOLEAN NOT NULL DEFAULT true,
    policy_version         TEXT NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_type, target_status)
);

INSERT INTO ops.verification_policy (
  subject_type,target_status,min_distinct_documents,require_chunk_quote,policy_version
)
VALUES
  ('claim','corroborated',1,true,'b4-v1'),
  ('claim','verified',2,true,'b4-v1'),
  ('event','corroborated',1,true,'b4-v1'),
  ('event','verified',2,true,'b4-v1')
ON CONFLICT (subject_type,target_status) DO NOTHING;

CREATE TABLE IF NOT EXISTS knowledge.verification_transition (
    verification_transition_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_type      TEXT NOT NULL CHECK (subject_type IN ('claim','event')),
    subject_id        BIGINT NOT NULL,
    from_status       TEXT NOT NULL,
    to_status         TEXT NOT NULL,
    distinct_documents INTEGER NOT NULL,
    actor             TEXT NOT NULL,
    reason            TEXT NOT NULL,
    policy_version    TEXT,
    transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_verification_transition_subject
ON knowledge.verification_transition(subject_type,subject_id,transitioned_at);

CREATE OR REPLACE FUNCTION knowledge.guard_verification_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_kind TEXT;
DECLARE evidence_documents INTEGER;
DECLARE missing_chunk_quotes INTEGER;
DECLARE required_documents INTEGER;
DECLARE require_chunks BOOLEAN;
DECLARE opposing_evidence INTEGER := 0;
BEGIN
  IF NEW.verification_status=OLD.verification_status THEN RETURN NEW; END IF;
  subject_kind := CASE WHEN TG_TABLE_NAME='claim' THEN 'claim' ELSE 'event' END;

  IF nullif(trim(NEW.metadata->>'verification_reason'),'') IS NULL
     OR nullif(trim(NEW.metadata->>'verification_actor'),'') IS NULL THEN
    RAISE EXCEPTION 'verification transition requires metadata.verification_reason and verification_actor';
  END IF;

  IF NOT (
    (OLD.verification_status IN ('unverified','untrusted_legacy') AND NEW.verification_status='corroborated') OR
    (OLD.verification_status='corroborated' AND NEW.verification_status='verified') OR
    (OLD.verification_status IN ('unverified','untrusted_legacy','corroborated','verified')
      AND NEW.verification_status IN ('contradicted','retracted'))
  ) THEN
    RAISE EXCEPTION 'invalid verification transition % -> % for %', OLD.verification_status, NEW.verification_status, subject_kind;
  END IF;

  IF subject_kind='claim' THEN
    SELECT count(DISTINCT document_id),
           count(*) FILTER (WHERE chunk_id IS NULL OR nullif(trim(quote),'') IS NULL)
      INTO evidence_documents, missing_chunk_quotes
    FROM knowledge.claim_evidence WHERE claim_id=NEW.claim_id;
  ELSE
    SELECT count(DISTINCT document_id),
           count(*) FILTER (WHERE chunk_id IS NULL OR nullif(trim(quote),'') IS NULL)
      INTO evidence_documents, missing_chunk_quotes
    FROM knowledge.event_evidence WHERE event_id=NEW.event_id AND evidence_role='support';
    SELECT count(*) INTO opposing_evidence
    FROM knowledge.event_evidence
    WHERE event_id=NEW.event_id AND evidence_role IN ('contradict','retract');
  END IF;

  IF NEW.verification_status IN ('corroborated','verified') THEN
    SELECT min_distinct_documents,require_chunk_quote
      INTO required_documents,require_chunks
    FROM ops.verification_policy
    WHERE subject_type=subject_kind AND target_status=NEW.verification_status;
    IF required_documents IS NULL THEN
      RAISE EXCEPTION 'verification policy missing for % -> %',subject_kind,NEW.verification_status;
    END IF;
    IF evidence_documents < required_documents THEN
      RAISE EXCEPTION '% % requires % distinct evidence documents; got %',subject_kind,NEW.verification_status,required_documents,evidence_documents;
    END IF;
    IF require_chunks AND missing_chunk_quotes > 0 THEN
      RAISE EXCEPTION '% % requires every evidence row to have chunk + quote',subject_kind,NEW.verification_status;
    END IF;
    IF opposing_evidence > 0 THEN
      RAISE EXCEPTION '% % cannot be promoted while contradict/retract evidence exists',subject_kind,NEW.verification_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION knowledge.record_verification_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_kind TEXT;
DECLARE subject_key BIGINT;
DECLARE evidence_documents INTEGER;
DECLARE policy TEXT;
BEGIN
  IF NEW.verification_status=OLD.verification_status THEN RETURN NEW; END IF;
  subject_kind := CASE WHEN TG_TABLE_NAME='claim' THEN 'claim' ELSE 'event' END;
  IF subject_kind='claim' THEN
    subject_key := NEW.claim_id;
  ELSE
    subject_key := NEW.event_id;
  END IF;
  IF subject_kind='claim' THEN
    SELECT count(DISTINCT document_id) INTO evidence_documents FROM knowledge.claim_evidence WHERE claim_id=subject_key;
  ELSE
    SELECT count(DISTINCT document_id) INTO evidence_documents
    FROM knowledge.event_evidence WHERE event_id=subject_key AND evidence_role='support';
  END IF;
  SELECT policy_version INTO policy FROM ops.verification_policy
   WHERE subject_type=subject_kind AND target_status=NEW.verification_status;
  INSERT INTO knowledge.verification_transition (
    subject_type,subject_id,from_status,to_status,distinct_documents,actor,reason,policy_version
  ) VALUES (
    subject_kind,subject_key,OLD.verification_status,NEW.verification_status,evidence_documents,
    NEW.metadata->>'verification_actor',NEW.metadata->>'verification_reason',policy
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS claim_verification_guard ON knowledge.claim;
CREATE TRIGGER claim_verification_guard BEFORE UPDATE OF verification_status ON knowledge.claim
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_verification_transition();
DROP TRIGGER IF EXISTS claim_verification_audit ON knowledge.claim;
CREATE TRIGGER claim_verification_audit AFTER UPDATE OF verification_status ON knowledge.claim
FOR EACH ROW EXECUTE FUNCTION knowledge.record_verification_transition();

DROP TRIGGER IF EXISTS event_verification_guard ON knowledge.event;
CREATE TRIGGER event_verification_guard BEFORE UPDATE OF verification_status ON knowledge.event
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_verification_transition();
DROP TRIGGER IF EXISTS event_verification_audit ON knowledge.event;
CREATE TRIGGER event_verification_audit AFTER UPDATE OF verification_status ON knowledge.event
FOR EACH ROW EXECUTE FUNCTION knowledge.record_verification_transition();

CREATE OR REPLACE FUNCTION knowledge.guard_evidence_anchor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF nullif(trim(NEW.quote),'') IS NULL OR NOT EXISTS (
    SELECT 1 FROM knowledge.document_chunk chunk
    WHERE chunk.document_id=NEW.document_id
      AND chunk.chunk_id=NEW.chunk_id
      AND position(lower(trim(NEW.quote)) in lower(chunk.content))>0
  ) THEN
    RAISE EXCEPTION 'evidence quote must be anchored in its document chunk';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION knowledge.reject_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only',TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME USING ERRCODE='55000';
END $$;

CREATE OR REPLACE FUNCTION knowledge.downgrade_event_on_opposing_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evidence_role IN ('contradict','retract') THEN
    UPDATE knowledge.event
    SET verification_status=CASE WHEN NEW.evidence_role='retract' THEN 'retracted' ELSE 'contradicted' END,
        metadata=metadata||jsonb_build_object(
          'verification_actor','event-evidence-trigger',
          'verification_reason','opposing evidence appended',
          'verification_requested_at',now()::text
        )
    WHERE event_id=NEW.event_id AND verification_status IN ('corroborated','verified');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS claim_evidence_anchor_guard ON knowledge.claim_evidence;
CREATE TRIGGER claim_evidence_anchor_guard BEFORE INSERT ON knowledge.claim_evidence
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_evidence_anchor();
DROP TRIGGER IF EXISTS event_evidence_anchor_guard ON knowledge.event_evidence;
CREATE TRIGGER event_evidence_anchor_guard BEFORE INSERT ON knowledge.event_evidence
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_evidence_anchor();
DROP TRIGGER IF EXISTS event_evidence_truth_downgrade ON knowledge.event_evidence;
CREATE TRIGGER event_evidence_truth_downgrade AFTER INSERT ON knowledge.event_evidence
FOR EACH ROW EXECUTE FUNCTION knowledge.downgrade_event_on_opposing_evidence();
CREATE TRIGGER claim_evidence_immutable BEFORE UPDATE OR DELETE ON knowledge.claim_evidence
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_evidence_mutation();
CREATE TRIGGER event_evidence_immutable BEFORE UPDATE OR DELETE ON knowledge.event_evidence
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_evidence_mutation();

GRANT SELECT ON knowledge.document_chunk,
                knowledge.event_evidence,
                knowledge.verification_transition,
                ops.verification_policy
TO stock_insight_app_reader;
`;
