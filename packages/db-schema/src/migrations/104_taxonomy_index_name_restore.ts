export const taxonomyIndexNameRestoreMigrationSql = `
-- Puts the taxonomy uniqueness back under its original name.
--
-- Migration 102 replaced the unconditional uq_entity_taxonomy_system with a partial
-- index over live rows and gave it a new name, uq_entity_taxonomy_system_current. The
-- predicate was right; the rename was not.
--
-- Migration 021 creates that index with CREATE UNIQUE INDEX IF NOT EXISTS, and
-- taxonomy-coverage.test.ts replays 021 to prove the frozen baseline import stays safe
-- to reapply after the legacy source changes. With the old name vacant, that replay
-- rebuilds the ORIGINAL unconditional index over a table that now holds superseded
-- rows, and fails on the first entity that has been reclassified:
--
--   could not create unique index "uq_entity_taxonomy_system"
--   Key (entity_id, (metadata ->> 'taxonomy_system'))=(1378, KSIC) is duplicated.
--
-- Holding the name keeps 021's statement a no-op, which is what it should be — the
-- index already exists, in its current form.
--
-- WHY THIS IS A SEPARATE MIGRATION AND NOT AN EDIT TO 102. 102 had already been
-- applied when the defect surfaced. run-schema-migrations.ts checksums each
-- migration's SQL precisely so that editing an applied one is caught rather than
-- silently rewriting history, and it caught this. The ledger records what ran; a
-- correction is another migration.

DROP INDEX IF EXISTS core.uq_entity_taxonomy_system_current;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_taxonomy_system
  ON core.entity_taxonomy_membership (entity_id, ((metadata ->> 'taxonomy_system')))
  WHERE valid_to IS NULL;
`;
