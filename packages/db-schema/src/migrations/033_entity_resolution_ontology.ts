export const entityResolutionOntologyMigrationSql = `
-- P1-W3 — Entity resolution and ontology RFC control
-- (enhancement plan Task 4, P1-12·19·21).
-- Additive migration 033. Entity links and ontology changes become auditable,
-- append-only ledgers. Existing core.entity / entity_identifier / entity_alias /
-- knowledge.predicate_ontology_revision rows are only read for the additive
-- ontology seed; nothing is rewritten, renamed, or deleted.

-- The machine gate: a candidate below this classifier score may never be
-- auto-linked. Stored as a settings row so a review policy change is auditable.
CREATE TABLE IF NOT EXISTS knowledge.resolution_policy (
    resolution_policy_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    policy_key           TEXT NOT NULL UNIQUE,
    resolution_auto_link_threshold NUMERIC NOT NULL
      CHECK (resolution_auto_link_threshold > 0 AND resolution_auto_link_threshold <= 1),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO knowledge.resolution_policy (policy_key, resolution_auto_link_threshold)
VALUES ('default', 0.90)
ON CONFLICT (policy_key) DO NOTHING;

-- ── candidate pair proposed for the same real-world entity ────────────────────
CREATE TABLE IF NOT EXISTS knowledge.resolution_candidate (
    resolution_candidate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    candidate_key        TEXT NOT NULL UNIQUE,
    left_entity_id       BIGINT NOT NULL REFERENCES core.entity(entity_id),
    right_entity_id      BIGINT NOT NULL REFERENCES core.entity(entity_id),
    blocking_key         TEXT NOT NULL CHECK (length(btrim(blocking_key)) > 0),
    generated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata             JSONB NOT NULL DEFAULT '{}',
    CHECK (length(btrim(candidate_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (left_entity_id <> right_entity_id)
);
CREATE INDEX IF NOT EXISTS ix_resolution_candidate_block
  ON knowledge.resolution_candidate (blocking_key);
CREATE INDEX IF NOT EXISTS ix_resolution_candidate_entities
  ON knowledge.resolution_candidate (left_entity_id, right_entity_id);

-- ── typed feature evidence for a candidate (name sim, id overlap, graph check) ─
CREATE TABLE IF NOT EXISTS knowledge.resolution_feature (
    resolution_feature_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resolution_candidate_id BIGINT NOT NULL REFERENCES knowledge.resolution_candidate(resolution_candidate_id),
    feature_name         TEXT NOT NULL CHECK (length(btrim(feature_name)) > 0),
    feature_value        NUMERIC,
    evidence_locator     JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (evidence_locator IS NULL OR jsonb_typeof(evidence_locator) = 'object'),
    UNIQUE (resolution_candidate_id, feature_name)
);
CREATE INDEX IF NOT EXISTS ix_resolution_feature_candidate
  ON knowledge.resolution_feature (resolution_candidate_id);

-- ── append-only decision: auto_link / needs_review / non_link ─────────────────
CREATE TABLE IF NOT EXISTS knowledge.resolution_decision (
    resolution_decision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resolution_candidate_id BIGINT NOT NULL REFERENCES knowledge.resolution_candidate(resolution_candidate_id),
    revision_no          INTEGER NOT NULL CHECK (revision_no > 0),
    decision             TEXT NOT NULL CHECK (decision IN ('auto_link','needs_review','non_link')),
    classifier_score     NUMERIC CHECK (classifier_score IS NULL OR (classifier_score >= 0 AND classifier_score <= 1)),
    reviewer_id          TEXT,
    reviewed_at          TIMESTAMPTZ,
    audit_note           TEXT,
    decided_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    supersedes_resolution_decision_id BIGINT REFERENCES knowledge.resolution_decision(resolution_decision_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    UNIQUE (resolution_candidate_id, revision_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    -- A concrete link/non-link needs a defensible basis: a score or a reviewer.
    CHECK (decision = 'needs_review' OR classifier_score IS NOT NULL OR reviewer_id IS NOT NULL),
    CHECK (
      (revision_no = 1 AND supersedes_resolution_decision_id IS NULL) OR
      (revision_no > 1 AND supersedes_resolution_decision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_resolution_decision_candidate
  ON knowledge.resolution_decision (resolution_candidate_id, revision_no DESC);

-- ── ontology RFC: a controlled proposal for a taxonomy/predicate change ────────
CREATE TABLE IF NOT EXISTS knowledge.ontology_rfc (
    ontology_rfc_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rfc_key              TEXT NOT NULL UNIQUE,
    scope                TEXT NOT NULL CHECK (scope IN ('entity_type','predicate','taxonomy')),
    proposer             TEXT NOT NULL CHECK (length(btrim(proposer)) > 0),
    title                TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    status               TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft','review','accepted','rejected','superseded')),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(rfc_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object')
);

-- ── append-only ontology revision produced by an accepted RFC ─────────────────
CREATE TABLE IF NOT EXISTS knowledge.ontology_revision (
    ontology_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ontology_rfc_id      BIGINT NOT NULL REFERENCES knowledge.ontology_rfc(ontology_rfc_id),
    revision_no          INTEGER NOT NULL CHECK (revision_no > 0),
    compatibility        TEXT NOT NULL CHECK (compatibility IN ('additive','backward','breaking')),
    effective_from       TIMESTAMPTZ NOT NULL,
    known_from           TIMESTAMPTZ NOT NULL,
    migration_ledger_ref TEXT,
    supersedes_ontology_revision_id BIGINT REFERENCES knowledge.ontology_revision(ontology_revision_id),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ontology_rfc_id, revision_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_from >= effective_from),
    -- Breaking predicate drift must name the migration that carries it.
    CHECK (compatibility <> 'breaking' OR (migration_ledger_ref IS NOT NULL AND length(btrim(migration_ledger_ref)) > 0)),
    CHECK (
      (revision_no = 1 AND supersedes_ontology_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_ontology_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_ontology_revision_rfc
  ON knowledge.ontology_revision (ontology_rfc_id, revision_no DESC);

-- ── external standard crosswalk (LEI Level 1/2, FIBO, ...) ─────────────────────
CREATE TABLE IF NOT EXISTS knowledge.ontology_crosswalk (
    ontology_crosswalk_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crosswalk_key        TEXT NOT NULL UNIQUE,
    entity_id            BIGINT REFERENCES core.entity(entity_id),
    standard             TEXT NOT NULL CHECK (standard IN ('lei_level_1','lei_level_2','fibo','iso3166','unm49')),
    external_id          TEXT NOT NULL CHECK (length(btrim(external_id)) > 0),
    mapping_status       TEXT NOT NULL DEFAULT 'proposed'
      CHECK (mapping_status IN ('proposed','verified','deprecated')),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(crosswalk_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_ontology_crosswalk_entity
  ON knowledge.ontology_crosswalk (entity_id, standard);

-- ── guards ────────────────────────────────────────────────────────────────────
-- Resolution decisions are append-only and may not force an ambiguous candidate
-- (score below the auto-link threshold) into an auto link.
CREATE OR REPLACE FUNCTION knowledge.guard_resolution_decision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_threshold NUMERIC;
  v_prev_candidate BIGINT;
  v_prev_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'knowledge.resolution_decision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.decision = 'auto_link' THEN
    SELECT resolution_auto_link_threshold INTO v_threshold
    FROM knowledge.resolution_policy WHERE policy_key = 'default';
    IF NEW.classifier_score IS NULL OR NEW.classifier_score < v_threshold THEN
      RAISE EXCEPTION 'ambiguous candidate may not be auto-linked (score % < threshold %)',
        NEW.classifier_score, v_threshold;
    END IF;
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.resolution_candidate_id, previous.revision_no
    INTO v_prev_candidate, v_prev_revision
    FROM knowledge.resolution_decision previous
    WHERE previous.resolution_decision_id = NEW.supersedes_resolution_decision_id;
    IF v_prev_candidate IS DISTINCT FROM NEW.resolution_candidate_id
       OR v_prev_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'resolution decision supersession must reference the previous revision of the same candidate';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Ontology revisions are append-only; a breaking revision must name a migration
-- ledger reference; supersession stays within the same RFC.
CREATE OR REPLACE FUNCTION knowledge.guard_ontology_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prev_rfc BIGINT;
  v_prev_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'knowledge.ontology_revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.compatibility = 'breaking'
     AND (NEW.migration_ledger_ref IS NULL OR length(btrim(NEW.migration_ledger_ref)) = 0) THEN
    RAISE EXCEPTION 'breaking ontology revision requires a migration ledger reference';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.ontology_rfc_id, previous.revision_no
    INTO v_prev_rfc, v_prev_revision
    FROM knowledge.ontology_revision previous
    WHERE previous.ontology_revision_id = NEW.supersedes_ontology_revision_id;
    IF v_prev_rfc IS DISTINCT FROM NEW.ontology_rfc_id
       OR v_prev_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'rfc supersession must reference the previous revision of the same rfc';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION knowledge.reject_resolution_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- ── additive ontology seed from legacy predicate revisions ────────────────────
-- Each distinct legacy predicate becomes one RFC + one additive revision so the
-- existing controlled vocabulary has an auditable provenance anchor. No existing
-- predicate row is modified; the resolution ledger starts empty by design.
INSERT INTO knowledge.ontology_rfc (rfc_key, scope, proposer, title, status, metadata)
SELECT 'legacy-predicate-seed:'||predicate.predicate,
       'predicate',
       'migration-033',
       'Legacy predicate '||predicate.predicate,
       'accepted',
       jsonb_build_object('seed_policy','p1-w3-legacy-v1','predicate',predicate.predicate)
FROM (SELECT DISTINCT predicate FROM knowledge.predicate_ontology_revision) predicate
ON CONFLICT (rfc_key) DO NOTHING;

INSERT INTO knowledge.ontology_revision (
  ontology_rfc_id, revision_no, compatibility, effective_from, known_from, metadata
)
SELECT rfc.ontology_rfc_id,
       1,
       'additive',
       coalesce(min(predicate.effective_from), now()),
       coalesce(min(predicate.known_from), now()),
       jsonb_build_object('seed_policy','p1-w3-legacy-v1','predicate',predicate.predicate)
FROM knowledge.predicate_ontology_revision predicate
JOIN knowledge.ontology_rfc rfc
  ON rfc.rfc_key = 'legacy-predicate-seed:'||predicate.predicate
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.ontology_revision existing
  WHERE existing.ontology_rfc_id = rfc.ontology_rfc_id AND existing.revision_no = 1
)
GROUP BY rfc.ontology_rfc_id, predicate.predicate;

DO $$
DECLARE
  v_predicates BIGINT;
  v_rfcs BIGINT;
  v_revisions BIGINT;
BEGIN
  SELECT count(DISTINCT predicate) INTO v_predicates FROM knowledge.predicate_ontology_revision;
  SELECT count(*) INTO v_rfcs FROM knowledge.ontology_rfc WHERE rfc_key LIKE 'legacy-predicate-seed:%';
  SELECT count(*) INTO v_revisions
  FROM knowledge.ontology_revision revision
  JOIN knowledge.ontology_rfc rfc USING (ontology_rfc_id)
  WHERE rfc.rfc_key LIKE 'legacy-predicate-seed:%' AND revision.revision_no = 1;
  IF v_rfcs <> v_predicates OR v_revisions <> v_predicates THEN
    RAISE EXCEPTION 'P1-W3 ontology seed parity mismatch: predicates=% rfcs=% revisions=%',
      v_predicates, v_rfcs, v_revisions;
  END IF;
END $$;

-- ── install guards after the validated seed ──────────────────────────────────
DROP TRIGGER IF EXISTS resolution_decision_write_guard ON knowledge.resolution_decision;
CREATE TRIGGER resolution_decision_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON knowledge.resolution_decision
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_resolution_decision_write();

DROP TRIGGER IF EXISTS resolution_candidate_write_guard ON knowledge.resolution_candidate;
CREATE TRIGGER resolution_candidate_write_guard
BEFORE UPDATE OR DELETE ON knowledge.resolution_candidate
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_resolution_child_mutation();

DROP TRIGGER IF EXISTS resolution_feature_write_guard ON knowledge.resolution_feature;
CREATE TRIGGER resolution_feature_write_guard
BEFORE UPDATE OR DELETE ON knowledge.resolution_feature
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_resolution_child_mutation();

DROP TRIGGER IF EXISTS ontology_revision_write_guard ON knowledge.ontology_revision;
CREATE TRIGGER ontology_revision_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON knowledge.ontology_revision
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_ontology_revision_write();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
-- The append-only decision guard runs SECURITY INVOKER and reads the policy row
-- to enforce the auto-link threshold, so the writer role must be able to SELECT
-- the policy table or a legitimate auto_link INSERT fails permission-denied.
GRANT SELECT ON knowledge.resolution_policy
  TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  knowledge.resolution_candidate,
  knowledge.resolution_feature,
  knowledge.resolution_decision,
  knowledge.ontology_rfc,
  knowledge.ontology_revision,
  knowledge.ontology_crosswalk
TO si_knowledge;
GRANT UPDATE (status) ON knowledge.ontology_rfc TO si_knowledge;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA knowledge TO si_knowledge, si_analytics, si_publisher;

GRANT SELECT ON
  knowledge.resolution_candidate,
  knowledge.resolution_feature,
  knowledge.resolution_decision,
  knowledge.ontology_rfc,
  knowledge.ontology_revision,
  knowledge.ontology_crosswalk
TO si_analytics, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON
      knowledge.resolution_candidate,
      knowledge.resolution_feature,
      knowledge.resolution_decision,
      knowledge.ontology_rfc,
      knowledge.ontology_revision,
      knowledge.ontology_crosswalk
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
