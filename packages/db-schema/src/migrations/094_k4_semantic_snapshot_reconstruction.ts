export const k4SemanticSnapshotReconstructionMigrationSql = `
-- K4 historical replay needs a semantic version bundle as it was knowable at
-- each cutoff. A row constructed after the cutoff must never counterfeit that
-- history by backdating created_at. These fields preserve both clocks.

ALTER TABLE governance.semantic_snapshot
  ADD COLUMN IF NOT EXISTS construction_mode TEXT NOT NULL DEFAULT 'live_observed'
    CHECK (construction_mode IN ('live_observed','historical_reconstruction')),
  ADD COLUMN IF NOT EXISTS knowledge_cutoff TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconstructed_at TIMESTAMPTZ;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='governance.semantic_snapshot'::regclass
       AND conname='semantic_snapshot_reconstruction_clock_contract'
  ) THEN
    ALTER TABLE governance.semantic_snapshot
      ADD CONSTRAINT semantic_snapshot_reconstruction_clock_contract CHECK (
        (construction_mode='live_observed'
          AND knowledge_cutoff IS NULL
          AND reconstructed_at IS NULL)
        OR
        (construction_mode='historical_reconstruction'
          AND knowledge_cutoff IS NOT NULL
          AND reconstructed_at IS NOT NULL
          AND knowledge_cutoff <= reconstructed_at
          AND created_at = reconstructed_at)
      );
  END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS semantic_snapshot_knowledge_cutoff_idx
  ON governance.semantic_snapshot (knowledge_cutoff DESC, semantic_snapshot_id)
  WHERE construction_mode='historical_reconstruction';

-- Replace the original immutable-pin boundary as one cohesive definition. The
-- new clock fields are pins too; layering a weaker side trigger would leave two
-- authorities for the same append-only object.
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
     OR NEW.construction_mode IS DISTINCT FROM OLD.construction_mode
     OR NEW.knowledge_cutoff IS DISTINCT FROM OLD.knowledge_cutoff
     OR NEW.reconstructed_at IS DISTINCT FROM OLD.reconstructed_at
  THEN
    RAISE EXCEPTION 'governance.semantic_snapshot pinned versions are immutable (%)',
      OLD.semantic_snapshot_id;
  END IF;

  IF NOT (
    (OLD.snapshot_state = 'open' AND NEW.snapshot_state IN ('open','sealed'))
    OR (OLD.snapshot_state = 'sealed' AND NEW.snapshot_state IN ('sealed','superseded'))
    OR (OLD.snapshot_state = 'superseded' AND NEW.snapshot_state = 'superseded')
  ) THEN
    RAISE EXCEPTION 'governance.semantic_snapshot illegal transition % -> % (%)',
      OLD.snapshot_state, NEW.snapshot_state, OLD.semantic_snapshot_id;
  END IF;

  IF OLD.sealed_at IS NOT NULL AND NEW.sealed_at IS DISTINCT FROM OLD.sealed_at THEN
    RAISE EXCEPTION 'governance.semantic_snapshot sealed_at is immutable (%)',
      OLD.semantic_snapshot_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN governance.semantic_snapshot.construction_mode IS
  'live_observed uses actual created_at; historical_reconstruction uses an explicit, reproducible knowledge_cutoff without backdating created_at';
COMMENT ON COLUMN governance.semantic_snapshot.knowledge_cutoff IS
  'Latest system-known time admitted when reconstructing the pinned semantic bundle';
COMMENT ON COLUMN governance.semantic_snapshot.reconstructed_at IS
  'Actual construction time for a historical reconstruction; equals created_at';
`;
