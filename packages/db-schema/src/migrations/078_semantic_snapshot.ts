export const semanticSnapshotMigrationSql = `
-- Semantic snapshot: the version pin every derivation is computed under.
--
-- v2-final canonical/02 §9 requires a snapshot to fix ontology, metric definition,
-- entity resolution, model/prompt/feature and source-contract revisions together,
-- so that "what did this number mean" has one answer per artifact. REQ-REL-001
-- then requires surfaces shown side by side to use compatible snapshots.
--
-- WHY THIS IS 078 AND NOT 079. The plan numbered the information set first, but
-- an information set carries semantic_snapshot_id as a foreign key, so the
-- snapshot has to exist before it. Numbering follows the dependency, not the
-- writing order.
--
-- WHY A TEXT PRIMARY KEY. Every other identity table here uses a BIGINT identity
-- plus a text key, because rows are minted by pipelines and the natural key is
-- long. A snapshot is different: it is quoted by name inside run manifests and
-- artifacts that outlive the row, and a surrogate id would mean every consumer
-- joins to translate. canonical/02 §9 treats the snapshot id as the value that
-- travels.
--
-- WHY APPEND-ONLY. A snapshot describes what a past computation could see.
-- Editing one rewrites the meaning of artifacts already derived under it, which
-- is REQ-SEM-002 ("a lower truth class must not be modified by a higher-level
-- inference result") applied to versioning. Superseding is a new row.
--
-- GRANTS: pipeline roles only (si_*). stock_insight_app_reader and _app_writer
-- deliberately get nothing. The boot guard in apps/api-server/src/db/
-- live-database-guard.ts hashes what each app role can reach — every one of its
-- relation/RLS/sequence arrays is filtered by has_table_privilege(current_user,…)
-- — so a table the app roles cannot see does not move their pinned digests and
-- needs no re-pin. Migration 059 crashlooped the brain by granting a serving view
-- without re-pinning; the cheaper discipline is to not grant until a product read
-- path actually needs the table. K6/K7 will grant and re-pin together when the
-- release manifest and safety state reach a surface.

CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.semantic_snapshot (
    semantic_snapshot_id TEXT PRIMARY KEY
      CHECK (semantic_snapshot_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),

    -- The pinned revisions. Nullable because a dimension that does not yet exist
    -- must read as "not pinned" rather than as revision 0, which would be a lie
    -- about coverage. canonical/03 §7 draws the same 없음/모름 distinction.
    ontology_revision_id            BIGINT REFERENCES knowledge.ontology_revision(ontology_revision_id),
    metric_definition_revision      TEXT,
    entity_resolution_revision      TEXT,
    model_version                   TEXT,
    prompt_version                  TEXT,
    feature_version                 TEXT,
    source_contract_revision_digest TEXT,
    market_calendar                 TEXT,
    corporate_action_basis          TEXT,

    -- Supersession is a link, not an edit. A chain lets an audit ask "which
    -- snapshot replaced the one this artifact used" without scanning by time.
    supersedes_semantic_snapshot_id TEXT
      REFERENCES governance.semantic_snapshot(semantic_snapshot_id),

    snapshot_state TEXT NOT NULL DEFAULT 'open'
      CHECK (snapshot_state IN ('open','sealed','superseded')),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sealed_at   TIMESTAMPTZ,
    created_by  TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),
    notes       TEXT,

    -- A sealed snapshot must record when it was sealed; an unsealed one must not
    -- claim a seal time. Without this the state column and the timestamp can
    -- disagree and neither is trustworthy.
    CHECK ((snapshot_state = 'open') = (sealed_at IS NULL)),
    CHECK (snapshot_state <> 'superseded' OR supersedes_semantic_snapshot_id IS NOT NULL
           OR sealed_at IS NOT NULL),
    CHECK (supersedes_semantic_snapshot_id IS NULL
           OR supersedes_semantic_snapshot_id <> semantic_snapshot_id)
);

CREATE INDEX IF NOT EXISTS semantic_snapshot_state_idx
  ON governance.semantic_snapshot (snapshot_state, created_at DESC);

-- Append-only, with the one exception a state machine needs: an open snapshot
-- may be sealed, and a sealed one may be marked superseded. Everything else
-- about the row is frozen once written. Same shape as the relation ledger's
-- immutability trigger (migration 023) and the content pack guard (026/031).
CREATE OR REPLACE FUNCTION governance.reject_semantic_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.semantic_snapshot is append-only (delete rejected for %)',
      OLD.semantic_snapshot_id;
  END IF;

  IF NEW.semantic_snapshot_id IS DISTINCT FROM OLD.semantic_snapshot_id
     OR NEW.ontology_revision_id IS DISTINCT FROM OLD.ontology_revision_id
     OR NEW.metric_definition_revision IS DISTINCT FROM OLD.metric_definition_revision
     OR NEW.entity_resolution_revision IS DISTINCT FROM OLD.entity_resolution_revision
     OR NEW.model_version IS DISTINCT FROM OLD.model_version
     OR NEW.prompt_version IS DISTINCT FROM OLD.prompt_version
     OR NEW.feature_version IS DISTINCT FROM OLD.feature_version
     OR NEW.source_contract_revision_digest IS DISTINCT FROM OLD.source_contract_revision_digest
     OR NEW.market_calendar IS DISTINCT FROM OLD.market_calendar
     OR NEW.corporate_action_basis IS DISTINCT FROM OLD.corporate_action_basis
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'governance.semantic_snapshot pinned versions are immutable (%)',
      OLD.semantic_snapshot_id;
  END IF;

  IF NOT (
    (OLD.snapshot_state = 'open'   AND NEW.snapshot_state IN ('open','sealed'))
    OR (OLD.snapshot_state = 'sealed' AND NEW.snapshot_state IN ('sealed','superseded'))
    OR (OLD.snapshot_state = 'superseded' AND NEW.snapshot_state = 'superseded')
  ) THEN
    RAISE EXCEPTION 'governance.semantic_snapshot illegal transition % -> % (%)',
      OLD.snapshot_state, NEW.snapshot_state, OLD.semantic_snapshot_id;
  END IF;

  -- A seal time, once set, is a historical fact.
  IF OLD.sealed_at IS NOT NULL AND NEW.sealed_at IS DISTINCT FROM OLD.sealed_at THEN
    RAISE EXCEPTION 'governance.semantic_snapshot sealed_at is immutable (%)',
      OLD.semantic_snapshot_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS semantic_snapshot_append_only ON governance.semantic_snapshot;
CREATE TRIGGER semantic_snapshot_append_only
  BEFORE DELETE OR UPDATE ON governance.semantic_snapshot
  FOR EACH ROW EXECUTE FUNCTION governance.reject_semantic_snapshot_mutation();

GRANT USAGE ON SCHEMA governance TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON governance.semantic_snapshot
  TO si_knowledge, si_analytics, si_publisher;
GRANT UPDATE (snapshot_state, sealed_at) ON governance.semantic_snapshot
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON governance.semantic_snapshot TO si_readapi;
`;
