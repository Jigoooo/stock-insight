export const taxonomyMembershipTemporalityMigrationSql = `
-- Lets a stock's industry classification change without erasing what it used to be.
--
-- Migration 021 said this was the intended path — "Later source changes require a new
-- taxonomy release + temporal membership" — but the table it built cannot express it.
-- core.entity_taxonomy_membership has valid_from and no valid_to, and
-- uq_entity_taxonomy_system is UNIQUE (entity_id, metadata->>'taxonomy_system') over
-- every row. So a Korean stock already holding an UNCLASSIFIED KSIC membership cannot
-- receive a second KSIC one, and the only representation available was an in-place
-- UPDATE.
--
-- WHY NOT JUST UPDATE. Because "we did not know this company's industry until
-- 2026-08-10" is a fact about our coverage, and overwriting the row deletes it. Every
-- other plane in this repository keeps that kind of history — relation_revision,
-- expectation_revision, source_shape_revision, slo_observation — and the coverage
-- ledger exists precisely so absences stay visible. A classification that silently
-- becomes retroactively-always-known is the same defect those were built to avoid.
--
-- WHAT THE INDEX MEANT, AND STILL MEANS. One current classification per system per
-- entity. A stock with two live KSIC codes is a contradiction, not history. That is
-- preserved exactly — the index simply now ignores closed rows, which are not claims
-- about the present.
--
-- Existing rows get valid_to NULL: every membership written before today is still the
-- current one. Nothing about the baseline import changes.

ALTER TABLE core.entity_taxonomy_membership
  ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;

ALTER TABLE core.entity_taxonomy_membership
  DROP CONSTRAINT IF EXISTS entity_taxonomy_membership_valid_range_check;
ALTER TABLE core.entity_taxonomy_membership
  ADD CONSTRAINT entity_taxonomy_membership_valid_range_check
  CHECK (valid_to IS NULL OR valid_to > valid_from);

-- The uniqueness moves from "ever" to "now". A partial index is a different index —
-- PostgreSQL cannot add a predicate in place — so it is dropped and rebuilt.
--
-- THE NAME IS DELIBERATELY UNCHANGED. Migration 021 creates this index with
-- CREATE UNIQUE INDEX IF NOT EXISTS, and taxonomy-coverage.test.ts replays 021 to
-- prove the frozen import stays safe to reapply after the legacy source changes.
-- Under a new name, 021's replay would try to build the old unconditional index over a
-- table that now holds superseded rows, and fail on the first entity that has been
-- reclassified. Keeping the name makes that statement a no-op, which is what it should
-- be: the index already exists, in its current form.
DROP INDEX IF EXISTS core.uq_entity_taxonomy_system;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_taxonomy_system
  ON core.entity_taxonomy_membership (entity_id, ((metadata ->> 'taxonomy_system')))
  WHERE valid_to IS NULL;

-- Reading "what is this entity's industry today" should not require every caller to
-- remember the valid_to predicate. The ones that forget are how a closed row starts
-- being served as current.
CREATE OR REPLACE VIEW core.entity_taxonomy_current_v1 AS
SELECT membership.entity_id,
       membership.taxonomy_node_id,
       membership.classification_status,
       membership.source_reference,
       membership.valid_from,
       membership.known_from,
       membership.metadata,
       node.code,
       node.label,
       node.hierarchy_level,
       release.taxonomy_system,
       release.release_version,
       release.policy_status
  FROM core.entity_taxonomy_membership membership
  JOIN core.taxonomy_node node
    ON node.taxonomy_node_id = membership.taxonomy_node_id
  JOIN core.taxonomy_release release
    ON release.taxonomy_release_id = node.taxonomy_release_id
 WHERE membership.valid_to IS NULL;

-- NO GRANT TO stock_insight_app_reader. Nothing in the product reads this view yet,
-- and granting it would add a relation to the reader's reachable set, move
-- EXPECTED_CATALOG_DIGESTS in apps/api-server/src/db/live-database-guard.ts, and
-- crashloop the brain on boot — which is what migration 059 did on 2026-08-03.
-- The grant belongs to whichever change first reads it, in the same commit as the
-- digest re-pin.
`;
