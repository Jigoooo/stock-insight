export const temporalRelationLedgerMigrationSql = `
-- B5 — Temporal relation ledger + evidence (master plan §3.6, B5).
-- Legacy relations with no evidence are preserved but quarantined. Only a
-- relation identity with immutable evidence may receive an accepted revision.

CREATE TABLE IF NOT EXISTS knowledge.predicate_ontology_revision (
    predicate_ontology_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    predicate        TEXT NOT NULL,
    revision_no      INTEGER NOT NULL CHECK (revision_no > 0),
    relation_class   TEXT NOT NULL CHECK (relation_class IN ('identity','causal','hierarchy','association','ownership','exposure','stage')),
    directional      BOOLEAN NOT NULL,
    policy_status    TEXT NOT NULL DEFAULT 'provisional_review_required'
      CHECK (policy_status IN ('provisional_review_required','approved','retired')),
    effective_from   TIMESTAMPTZ NOT NULL,
    known_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
    description      TEXT,
    metadata         JSONB NOT NULL DEFAULT '{}',
    UNIQUE (predicate, revision_no)
);

CREATE TABLE IF NOT EXISTS knowledge.relation_identity (
    relation_identity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    predicate         TEXT NOT NULL,
    object_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    identity_hash     TEXT NOT NULL UNIQUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subject_entity_id,predicate,object_entity_id),
    CHECK (subject_entity_id<>object_entity_id OR predicate IN ('CORROBORATES','DIVERGENCE'))
);

CREATE TABLE IF NOT EXISTS knowledge.relation_evidence_ledger (
    relation_evidence_ledger_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    relation_identity_id BIGINT NOT NULL REFERENCES knowledge.relation_identity(relation_identity_id),
    evidence_kind TEXT NOT NULL
      CHECK (evidence_kind IN ('document','chunk','claim','source_contract','model_config','identity_mapping')),
    document_id BIGINT REFERENCES knowledge.document(document_id),
    chunk_id BIGINT REFERENCES knowledge.document_chunk(chunk_id),
    claim_id BIGINT REFERENCES knowledge.claim(claim_id),
    source_contract_revision_id BIGINT REFERENCES ingestion.source_contract_revision(source_contract_revision_id),
    security_issuer_identity_id BIGINT REFERENCES core.security_issuer_identity(security_issuer_identity_id),
    model_config JSONB,
    evidence_text TEXT,
    evidence_hash TEXT NOT NULL,
    relation_payload_hash TEXT,
    source_weight REAL CHECK (source_weight IS NULL OR (source_weight>=0 AND source_weight<=1)),
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (relation_identity_id,evidence_hash),
    CHECK (num_nonnulls(document_id,chunk_id,claim_id,source_contract_revision_id,security_issuer_identity_id,model_config)=1),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to>valid_from)
);

ALTER TABLE knowledge.relation_evidence_ledger
  ADD COLUMN IF NOT EXISTS relation_payload_hash TEXT;

DO $$ BEGIN
  ALTER TABLE knowledge.relation_evidence_ledger
    ADD CONSTRAINT relation_evidence_exactly_one_source
    CHECK (num_nonnulls(document_id,chunk_id,claim_id,source_contract_revision_id,security_issuer_identity_id,model_config)=1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE knowledge.relation_evidence_ledger
    ADD CONSTRAINT relation_evidence_kind_source_match
    CHECK (
      (evidence_kind='document' AND document_id IS NOT NULL) OR
      (evidence_kind='chunk' AND chunk_id IS NOT NULL) OR
      (evidence_kind='claim' AND claim_id IS NOT NULL) OR
      (evidence_kind='source_contract' AND source_contract_revision_id IS NOT NULL) OR
      (evidence_kind='identity_mapping' AND security_issuer_identity_id IS NOT NULL) OR
      (evidence_kind='model' AND model_config IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS knowledge.relation_revision (
    relation_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    relation_identity_id BIGINT NOT NULL REFERENCES knowledge.relation_identity(relation_identity_id),
    revision_no INTEGER NOT NULL CHECK (revision_no>0),
    predicate_ontology_revision_id BIGINT NOT NULL REFERENCES knowledge.predicate_ontology_revision(predicate_ontology_revision_id),
    relation_kind TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence>=0 AND confidence<=1),
    revision_status TEXT NOT NULL
      CHECK (revision_status IN ('accepted','quarantined_unverified','rejected','superseded')),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    known_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_relation_id BIGINT REFERENCES knowledge.relation(relation_id),
    supersedes_relation_revision_id BIGINT REFERENCES knowledge.relation_revision(relation_revision_id),
    payload_hash TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (relation_identity_id,revision_no),
    UNIQUE (source_relation_id),
    CHECK (valid_to IS NULL OR valid_to>valid_from),
    CHECK (supersedes_relation_revision_id IS NULL OR revision_no>1)
);

CREATE INDEX IF NOT EXISTS ix_relation_revision_pit
ON knowledge.relation_revision(relation_identity_id,known_from,revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_relation_evidence_identity
ON knowledge.relation_evidence_ledger(relation_identity_id,recorded_at);

CREATE OR REPLACE FUNCTION knowledge.reject_relation_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only',TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME USING ERRCODE='55000';
END $$;

CREATE OR REPLACE FUNCTION knowledge.guard_accepted_relation_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision_status='accepted' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM knowledge.relation_identity identity
      JOIN knowledge.predicate_ontology_revision ontology
        ON ontology.predicate=identity.predicate
      WHERE identity.relation_identity_id=NEW.relation_identity_id
        AND ontology.predicate_ontology_revision_id=NEW.predicate_ontology_revision_id
        AND ontology.policy_status='approved'
    ) THEN
      RAISE EXCEPTION 'accepted relation revision requires matching approved predicate ontology';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM knowledge.relation_evidence_ledger evidence
      JOIN knowledge.relation_identity identity
        ON identity.relation_identity_id=evidence.relation_identity_id
      WHERE evidence.relation_identity_id=NEW.relation_identity_id
        AND evidence.relation_payload_hash=NEW.payload_hash
        AND (evidence.valid_from IS NULL OR evidence.valid_from<=NEW.valid_from)
        AND (evidence.valid_to IS NULL OR evidence.valid_to>NEW.valid_from)
        AND evidence.recorded_at<=NEW.known_from
        AND (
          (
            evidence.evidence_kind='identity_mapping'
            AND identity.predicate='ISSUED_BY'
            AND EXISTS (
              SELECT 1 FROM core.security_issuer_identity mapping
              WHERE mapping.security_issuer_identity_id=evidence.security_issuer_identity_id
                AND mapping.security_entity_id=identity.subject_entity_id
                AND mapping.issuer_entity_id=identity.object_entity_id
            )
          )
          OR (
            evidence.evidence_kind='claim'
            AND EXISTS (
              SELECT 1 FROM knowledge.claim claim
              WHERE claim.claim_id=evidence.claim_id
                AND claim.verification_status='verified'
                AND claim.subject_entity_id=identity.subject_entity_id
                AND claim.predicate=identity.predicate
                AND claim.object_entity_id=identity.object_entity_id
            )
          )
          OR (
            evidence.evidence_kind IN ('document','chunk')
            AND EXISTS (
              SELECT 1
              FROM knowledge.claim claim
              JOIN knowledge.claim_evidence claim_evidence ON claim_evidence.claim_id=claim.claim_id
              WHERE claim.verification_status='verified'
                AND claim.subject_entity_id=identity.subject_entity_id
                AND claim.predicate=identity.predicate
                AND claim.object_entity_id=identity.object_entity_id
                AND (evidence.document_id IS NULL OR claim_evidence.document_id=evidence.document_id)
                AND (evidence.chunk_id IS NULL OR claim_evidence.chunk_id=evidence.chunk_id)
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'accepted relation revision requires qualifying evidence bound to payload hash';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS predicate_ontology_immutable ON knowledge.predicate_ontology_revision;
CREATE TRIGGER predicate_ontology_immutable BEFORE UPDATE OR DELETE ON knowledge.predicate_ontology_revision
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_relation_ledger_mutation();
DROP TRIGGER IF EXISTS relation_identity_immutable ON knowledge.relation_identity;
CREATE TRIGGER relation_identity_immutable BEFORE UPDATE OR DELETE ON knowledge.relation_identity
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_relation_ledger_mutation();
DROP TRIGGER IF EXISTS relation_evidence_immutable ON knowledge.relation_evidence_ledger;
CREATE TRIGGER relation_evidence_immutable BEFORE UPDATE OR DELETE ON knowledge.relation_evidence_ledger
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_relation_ledger_mutation();
DROP TRIGGER IF EXISTS relation_revision_immutable ON knowledge.relation_revision;
CREATE TRIGGER relation_revision_immutable BEFORE UPDATE OR DELETE ON knowledge.relation_revision
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_relation_ledger_mutation();
DROP TRIGGER IF EXISTS relation_revision_evidence_guard ON knowledge.relation_revision;
CREATE TRIGGER relation_revision_evidence_guard BEFORE INSERT ON knowledge.relation_revision
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_accepted_relation_revision();

-- Provisional v1 ontology from existing predicate vocabulary. Names determine
-- routing class only; approval remains false until reviewed.
INSERT INTO knowledge.predicate_ontology_revision (
  predicate,revision_no,relation_class,directional,policy_status,
  effective_from,known_from,description,metadata
)
SELECT DISTINCT relation.predicate,
       1,
       CASE
         WHEN relation.predicate='ISSUED_BY' THEN 'identity'
         WHEN relation.predicate IN ('AFFECTS','ACCELERATES','DECELERATES') THEN 'causal'
         WHEN relation.predicate IN ('ROLLS_UP','PARENT_OF') THEN 'hierarchy'
         WHEN relation.predicate IN ('OWNS','COMMON_OWNER') THEN 'ownership'
         WHEN relation.predicate='EXPOSES' THEN 'exposure'
         WHEN relation.predicate='STAGE' THEN 'stage'
         ELSE 'association'
       END,
       relation.predicate NOT IN ('PEER_OF','SAME_INDUSTRY','SAME_THEME','SAME_ETF_BASKET','CORROBORATES','DIVERGENCE'),
       'provisional_review_required',
       '2026-07-19T00:00:00Z'::timestamptz,
       now(),
       'Imported from active relation vocabulary; semantic approval pending.',
       jsonb_build_object('source','knowledge.relation','policy','b5-v1')
FROM knowledge.relation relation
ON CONFLICT (predicate,revision_no) DO NOTHING;

-- ISSUED_BY is the only B5 predicate whose semantics and deterministic
-- Stock→Company mapping are fully governed by the B3 identity contract.
INSERT INTO knowledge.predicate_ontology_revision (
  predicate,revision_no,relation_class,directional,policy_status,
  effective_from,known_from,description,metadata
) VALUES (
  'ISSUED_BY',2,'identity',true,'approved',
  '2026-07-19T00:00:00Z'::timestamptz,now(),
  'Security is issued by the exact issuer identity mapped under B3.',
  '{"source":"core.security_issuer_identity","policy":"b5-v2"}'::jsonb
)
ON CONFLICT (predicate,revision_no) DO NOTHING;

INSERT INTO knowledge.relation_identity (
  subject_entity_id,predicate,object_entity_id,identity_hash
)
SELECT DISTINCT relation.subject_entity_id,relation.predicate,relation.object_entity_id,
       encode(sha256(convert_to(
         relation.subject_entity_id::text||'|'||relation.predicate||'|'||relation.object_entity_id::text,
         'UTF8'
       )),'hex')
FROM knowledge.relation relation
ON CONFLICT (subject_entity_id,predicate,object_entity_id) DO NOTHING;

-- Existing document/chunk/claim evidence, when present.
INSERT INTO knowledge.relation_evidence_ledger (
  relation_identity_id,evidence_kind,document_id,chunk_id,claim_id,
  evidence_text,evidence_hash,relation_payload_hash,source_weight,recorded_at,metadata
)
SELECT identity.relation_identity_id,
       CASE WHEN evidence.claim_id IS NOT NULL THEN 'claim'
            WHEN evidence.chunk_id IS NOT NULL THEN 'chunk' ELSE 'document' END,
       evidence.document_id,evidence.chunk_id,evidence.claim_id,
       evidence.evidence_text,
       encode(sha256(convert_to(evidence.evidence_key||'|'||coalesce(evidence.evidence_text,''),'UTF8')),'hex'),
       encode(sha256(convert_to(
         relation.relation_id::text||'|'||relation.relation_kind||'|'||relation.confidence::text||'|'||coalesce(relation.metadata::text,'{}'),
         'UTF8'
       )),'hex'),
       evidence.source_weight,
       now(),
       jsonb_build_object('legacy_relation_evidence_id',evidence.relation_evidence_id,'role',evidence.evidence_role)
FROM knowledge.relation_evidence evidence
JOIN knowledge.relation relation ON relation.relation_id=evidence.relation_id
JOIN knowledge.relation_identity identity
  ON identity.subject_entity_id=relation.subject_entity_id
 AND identity.predicate=relation.predicate
 AND identity.object_entity_id=relation.object_entity_id
ON CONFLICT (relation_identity_id,evidence_hash) DO NOTHING;

-- Exact Stock→Company identity bridge is itself immutable evidence for ISSUED_BY.
INSERT INTO knowledge.relation_evidence_ledger (
  relation_identity_id,evidence_kind,security_issuer_identity_id,
  evidence_text,evidence_hash,relation_payload_hash,source_weight,valid_from,recorded_at,metadata
)
SELECT relation_identity.relation_identity_id,
       'identity_mapping',
       issuer_identity.security_issuer_identity_id,
       issuer_identity.mapping_basis||':'||issuer_identity.identity_match_key,
       encode(sha256(convert_to(
         'identity_mapping|'||issuer_identity.security_issuer_identity_id::text||'|'||issuer_identity.identity_match_key,
         'UTF8'
       )),'hex'),
       encode(sha256(convert_to(
         relation.relation_id::text||'|'||relation.relation_kind||'|'||relation.confidence::text||'|'||coalesce(relation.metadata::text,'{}'),
         'UTF8'
       )),'hex'),
       1.0,
       issuer_identity.valid_from,
       now(),
       jsonb_build_object('policy','b3-v1','basis',issuer_identity.mapping_basis)
FROM core.security_issuer_identity issuer_identity
JOIN knowledge.relation_identity relation_identity
  ON relation_identity.subject_entity_id=issuer_identity.security_entity_id
 AND relation_identity.predicate='ISSUED_BY'
 AND relation_identity.object_entity_id=issuer_identity.issuer_entity_id
JOIN knowledge.relation relation
  ON relation.subject_entity_id=relation_identity.subject_entity_id
 AND relation.predicate=relation_identity.predicate
 AND relation.object_entity_id=relation_identity.object_entity_id
ON CONFLICT (relation_identity_id,evidence_hash) DO NOTHING;

-- Upgrade evidence rows created by the original B5 rollout before any
-- accepted INSERT can fire the stricter payload-bound guard.
DROP TRIGGER IF EXISTS relation_evidence_immutable ON knowledge.relation_evidence_ledger;
UPDATE knowledge.relation_evidence_ledger evidence
SET relation_payload_hash = revision.payload_hash
FROM knowledge.relation_revision revision
WHERE evidence.relation_payload_hash IS NULL
  AND revision.relation_identity_id=evidence.relation_identity_id
  AND revision.revision_no=(
    SELECT min(first_revision.revision_no)
    FROM knowledge.relation_revision first_revision
    WHERE first_revision.relation_identity_id=evidence.relation_identity_id
  );

ALTER TABLE knowledge.relation_evidence_ledger
  ALTER COLUMN relation_payload_hash SET NOT NULL;
CREATE TRIGGER relation_evidence_immutable
BEFORE UPDATE OR DELETE ON knowledge.relation_evidence_ledger
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_relation_ledger_mutation();

INSERT INTO knowledge.relation_revision (
  relation_identity_id,revision_no,predicate_ontology_revision_id,
  relation_kind,confidence,revision_status,valid_from,valid_to,known_from,
  source_relation_id,payload_hash,metadata
)
SELECT identity.relation_identity_id,
       1,
       ontology.predicate_ontology_revision_id,
       relation.relation_kind,
       relation.confidence,
       CASE WHEN ontology.policy_status='approved' AND EXISTS (
         SELECT 1 FROM knowledge.relation_evidence_ledger evidence
         WHERE evidence.relation_identity_id=identity.relation_identity_id
       ) THEN 'accepted' ELSE 'quarantined_unverified' END,
       relation.valid_from,
       relation.valid_to,
       greatest(
         relation.recorded_from,
         coalesce((
           SELECT min(evidence.recorded_at)
           FROM knowledge.relation_evidence_ledger evidence
           WHERE evidence.relation_identity_id=identity.relation_identity_id
             AND evidence.relation_payload_hash=encode(sha256(convert_to(
               relation.relation_id::text||'|'||relation.relation_kind||'|'||relation.confidence::text||'|'||coalesce(relation.metadata::text,'{}'),
               'UTF8'
             )),'hex')
         ),relation.recorded_from)
       ),
       relation.relation_id,
       encode(sha256(convert_to(
         relation.relation_id::text||'|'||relation.relation_kind||'|'||relation.confidence::text||'|'||coalesce(relation.metadata::text,'{}'),
         'UTF8'
       )),'hex'),
       relation.metadata||jsonb_build_object('legacy_status',relation.status,'policy','b5-v1')
FROM knowledge.relation relation
JOIN knowledge.relation_identity identity
  ON identity.subject_entity_id=relation.subject_entity_id
 AND identity.predicate=relation.predicate
 AND identity.object_entity_id=relation.object_entity_id
JOIN knowledge.predicate_ontology_revision ontology
  ON ontology.predicate=relation.predicate
 AND ontology.revision_no=CASE WHEN relation.predicate='ISSUED_BY' THEN 2 ELSE 1 END
ON CONFLICT (source_relation_id) DO NOTHING;

-- Existing deployments imported ISSUED_BY against provisional ontology v1.
-- Append an approved v2 revision without mutating history.
WITH latest AS (
  SELECT DISTINCT ON (revision.relation_identity_id) revision.*
  FROM knowledge.relation_revision revision
  ORDER BY revision.relation_identity_id,revision.revision_no DESC
)
INSERT INTO knowledge.relation_revision (
  relation_identity_id,revision_no,predicate_ontology_revision_id,
  relation_kind,confidence,revision_status,valid_from,valid_to,known_from,
  supersedes_relation_revision_id,payload_hash,metadata
)
SELECT latest.relation_identity_id,
       latest.revision_no+1,
       ontology.predicate_ontology_revision_id,
       latest.relation_kind,
       latest.confidence,
       'accepted',
       latest.valid_from,
       latest.valid_to,
       now(),
       latest.relation_revision_id,
       latest.payload_hash,
       latest.metadata||'{"policy":"b5-v2","ontology_upgrade":true}'::jsonb
FROM latest
JOIN knowledge.relation_identity identity
  ON identity.relation_identity_id=latest.relation_identity_id
 AND identity.predicate='ISSUED_BY'
JOIN knowledge.predicate_ontology_revision ontology
  ON ontology.predicate='ISSUED_BY' AND ontology.revision_no=2
WHERE latest.predicate_ontology_revision_id<>ontology.predicate_ontology_revision_id
  AND NOT EXISTS (
    SELECT 1 FROM knowledge.relation_revision prior
    WHERE prior.relation_identity_id=latest.relation_identity_id
      AND prior.predicate_ontology_revision_id=ontology.predicate_ontology_revision_id
  );

CREATE OR REPLACE VIEW serving.relation_current_v1 AS
WITH latest AS (
  SELECT DISTINCT ON (revision.relation_identity_id)
         revision.*
  FROM knowledge.relation_revision revision
  WHERE revision.known_from<=now()
  ORDER BY revision.relation_identity_id,revision.revision_no DESC
)
SELECT identity.relation_identity_id,
       identity.subject_entity_id,
       identity.predicate,
       identity.object_entity_id,
       latest.relation_revision_id,
       latest.revision_no,
       latest.relation_kind,
       latest.confidence,
       latest.valid_from,
       latest.valid_to,
       latest.known_from,
       latest.metadata,
       (SELECT count(*) FROM knowledge.relation_evidence_ledger evidence
         WHERE evidence.relation_identity_id=identity.relation_identity_id)::integer AS evidence_count
FROM latest
JOIN knowledge.relation_identity identity USING(relation_identity_id)
JOIN knowledge.predicate_ontology_revision ontology
  ON ontology.predicate_ontology_revision_id=latest.predicate_ontology_revision_id
WHERE latest.revision_status='accepted'
  AND ontology.predicate=identity.predicate
  AND ontology.policy_status='approved'
  AND latest.valid_from<=now()
  AND (latest.valid_to IS NULL OR latest.valid_to>now())
  AND EXISTS (
    SELECT 1 FROM knowledge.relation_evidence_ledger evidence
    WHERE evidence.relation_identity_id=identity.relation_identity_id
      AND evidence.relation_payload_hash=latest.payload_hash
      AND (evidence.valid_from IS NULL OR evidence.valid_from<=latest.valid_from)
      AND (evidence.valid_to IS NULL OR evidence.valid_to>now())
      AND evidence.recorded_at<=latest.known_from
      AND (
        (
          evidence.evidence_kind='identity_mapping'
          AND identity.predicate='ISSUED_BY'
          AND EXISTS (
            SELECT 1 FROM core.security_issuer_identity mapping
            WHERE mapping.security_issuer_identity_id=evidence.security_issuer_identity_id
              AND mapping.security_entity_id=identity.subject_entity_id
              AND mapping.issuer_entity_id=identity.object_entity_id
          )
        )
        OR (
          evidence.evidence_kind='claim'
          AND EXISTS (
            SELECT 1 FROM knowledge.claim claim
            WHERE claim.claim_id=evidence.claim_id
              AND claim.verification_status='verified'
              AND claim.subject_entity_id=identity.subject_entity_id
              AND claim.predicate=identity.predicate
              AND claim.object_entity_id=identity.object_entity_id
          )
        )
        OR (
          evidence.evidence_kind IN ('document','chunk')
          AND EXISTS (
            SELECT 1
            FROM knowledge.claim claim
            JOIN knowledge.claim_evidence claim_evidence ON claim_evidence.claim_id=claim.claim_id
            WHERE claim.verification_status='verified'
              AND claim.subject_entity_id=identity.subject_entity_id
              AND claim.predicate=identity.predicate
              AND claim.object_entity_id=identity.object_entity_id
              AND (evidence.document_id IS NULL OR claim_evidence.document_id=evidence.document_id)
              AND (evidence.chunk_id IS NULL OR claim_evidence.chunk_id=evidence.chunk_id)
          )
        )
      )
  );

-- Final B0 impact gate: every legacy path edge must resolve through its
-- imported source relation to a currently accepted, evidence-qualified B5
-- relation identity. Legacy contradict/context rows cannot satisfy this gate.
CREATE OR REPLACE VIEW serving.impact_summary_v1 AS
SELECT path.target_entity_id AS asset_entity_id,
       universe.market,
       universe.ticker,
       count(*)::integer AS path_count,
       max(path.path_score) AS max_path_score,
       round(avg(path.path_score)::numeric,4) AS avg_path_score,
       array_agg(DISTINCT path.explanation->>'event_type') AS event_types,
       max(path.created_at) AS computed_at
FROM analytics.impact_path path
JOIN core.v_security_universe universe ON universe.security_entity_id=path.target_entity_id
WHERE path.expires_at>now()
  AND cardinality(path.path_edges)>0
  AND NOT EXISTS (
    SELECT 1 FROM unnest(path.path_edges) edge(relation_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM knowledge.relation_revision imported
      JOIN serving.relation_current_v1 current_relation
        ON current_relation.relation_identity_id=imported.relation_identity_id
      WHERE imported.source_relation_id=edge.relation_id
    )
  )
GROUP BY path.target_entity_id,universe.market,universe.ticker;

GRANT SELECT ON serving.impact_summary_v1 TO stock_insight_app_reader;

GRANT SELECT ON knowledge.predicate_ontology_revision,
                knowledge.relation_identity,
                knowledge.relation_evidence_ledger,
                knowledge.relation_revision,
                serving.relation_current_v1
TO stock_insight_app_reader;
`;
