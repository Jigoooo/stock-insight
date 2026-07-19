export const relationBuilderFoundationMigrationSql = `
-- B6 foundation — bind canonical relation evidence to exact immutable source revisions.
-- Migration 023 is already applied; extend it additively instead of rewriting history.

ALTER TABLE knowledge.relation_evidence_ledger
  ADD COLUMN IF NOT EXISTS source_revision_id BIGINT
    REFERENCES ingestion.source_revision(source_revision_id);

ALTER TABLE knowledge.relation_evidence_ledger
  DROP CONSTRAINT IF EXISTS relation_evidence_ledger_evidence_kind_check;
ALTER TABLE knowledge.relation_evidence_ledger
  DROP CONSTRAINT IF EXISTS relation_evidence_exactly_one_source;
ALTER TABLE knowledge.relation_evidence_ledger
  DROP CONSTRAINT IF EXISTS relation_evidence_ledger_check;
ALTER TABLE knowledge.relation_evidence_ledger
  DROP CONSTRAINT IF EXISTS relation_evidence_kind_source_match;
ALTER TABLE knowledge.relation_evidence_ledger
  DROP CONSTRAINT IF EXISTS relation_evidence_kind_check_v2;
ALTER TABLE knowledge.relation_evidence_ledger
  DROP CONSTRAINT IF EXISTS relation_evidence_exactly_one_source_v2;
ALTER TABLE knowledge.relation_evidence_ledger
  DROP CONSTRAINT IF EXISTS relation_evidence_kind_source_match_v2;

ALTER TABLE knowledge.relation_evidence_ledger
  ADD CONSTRAINT relation_evidence_kind_check_v2
  CHECK (evidence_kind IN (
    'document','chunk','claim','source_contract','source_revision','model_config','identity_mapping'
  ));
ALTER TABLE knowledge.relation_evidence_ledger
  ADD CONSTRAINT relation_evidence_exactly_one_source_v2
  CHECK (num_nonnulls(
    document_id,chunk_id,claim_id,source_contract_revision_id,source_revision_id,
    security_issuer_identity_id,model_config
  )=1);
ALTER TABLE knowledge.relation_evidence_ledger
  ADD CONSTRAINT relation_evidence_kind_source_match_v2
  CHECK (
    (evidence_kind='document' AND document_id IS NOT NULL) OR
    (evidence_kind='chunk' AND chunk_id IS NOT NULL) OR
    (evidence_kind='claim' AND claim_id IS NOT NULL) OR
    (evidence_kind='source_contract' AND source_contract_revision_id IS NOT NULL) OR
    (evidence_kind='source_revision' AND source_revision_id IS NOT NULL) OR
    (evidence_kind='identity_mapping' AND security_issuer_identity_id IS NOT NULL) OR
    (evidence_kind='model_config' AND model_config IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS ix_relation_evidence_source_revision
ON knowledge.relation_evidence_ledger(source_revision_id)
WHERE source_revision_id IS NOT NULL;

-- B6 builder predicates — approved ontology revisions (idempotent seed).
-- NEWS_COMENTION is deliberately ABSENT: it is never promotable, so it keeps
-- only its provisional revision and the accepted-revision guard rejects it.
INSERT INTO knowledge.predicate_ontology_revision (
  predicate, revision_no, relation_class, directional, policy_status,
  effective_from, description, metadata
)
SELECT seed.predicate,
       coalesce((
         SELECT max(existing.revision_no)
         FROM knowledge.predicate_ontology_revision existing
         WHERE existing.predicate = seed.predicate
       ), 0) + 1,
       seed.relation_class,
       seed.directional,
       seed.policy_status,
       '2000-01-01T00:00:00Z',
       seed.description,
       jsonb_build_object('seeded_by', 'migration-024', 'builder_wave', 'b6-v1')
FROM (VALUES
  ('CLASSIFIED_AS',      'hierarchy',   true,  'approved', 'Official SIC/KSIC classification of an entity into a taxonomy node'),
  ('PRODUCT_SIMILARITY', 'association', false, 'approved', 'TNIC-style statistical product-description similarity (model config bound)'),
  ('SUPPLIES',           'exposure',    true,  'approved', 'Disclosed supplier->customer link'),
  ('CUSTOMER_OF',        'exposure',    true,  'approved', 'Disclosed customer->supplier link (inverse of SUPPLIES)'),
  ('OWNS',               'ownership',   true,  'approved', 'Direct ownership stake owner->owned'),
  ('HELD_BY',            'ownership',   true,  'approved', 'Institutional holding security->holder from filings'),
  ('COMMON_OWNER',       'ownership',   false, 'approved', 'Two securities held by one institutional owner (superhub-capped)'),
  ('SAME_ETF_BASKET',    'association', false, 'approved', 'Co-membership in one ETF basket at a PIT snapshot (superhub-capped)')
) AS seed(predicate, relation_class, directional, policy_status, description)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.predicate_ontology_revision approved_existing
  WHERE approved_existing.predicate = seed.predicate
    AND approved_existing.policy_status = 'approved'
)
ON CONFLICT (predicate, revision_no) DO NOTHING;

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
        AND ontology.known_from<=NEW.known_from
        AND ontology.effective_from<=NEW.valid_from
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
        AND (
          evidence.valid_to IS NULL
          OR (NEW.valid_to IS NOT NULL AND NEW.valid_to<=evidence.valid_to)
        )
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
                AND mapping.known_from<=NEW.known_from
                AND mapping.valid_from<=NEW.valid_from
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
          OR (
            evidence.evidence_kind='source_revision'
            AND EXISTS (
              SELECT 1
              FROM ingestion.source_revision source_revision
              JOIN ingestion.source_contract_revision source_contract
                ON source_contract.source_contract_revision_id=source_revision.source_contract_revision_id
              WHERE source_revision.source_revision_id=evidence.source_revision_id
                AND source_revision.available_at<=NEW.known_from
                AND source_contract.policy_status='approved'
                AND source_contract.known_from<=NEW.known_from
                AND source_contract.effective_from<=source_revision.available_at
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'accepted relation revision requires qualifying evidence bound to payload hash';
    END IF;
  END IF;
  RETURN NEW;
END $$;
`;
