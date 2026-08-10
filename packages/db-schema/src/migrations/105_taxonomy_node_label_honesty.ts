export const taxonomyNodeLabelHonestyMigrationSql = `
-- Clears the placeholder labels the first classification backfill invented.
--
-- That job wrote label = 'KSIC ' || code, producing rows like:
--
--   code 66121   label 'KSIC 66121'
--   code 4512    label 'SIC 4512'
--
-- which read like names and say nothing. A reviewer opening a node needs to know what
-- the code MEANS; a label that only restates the number is worse than an empty one,
-- because an empty label is visibly a gap while 'KSIC 66121' looks answered.
--
-- SEC hands us a real name next to the code — sicDescription, "Air Transportation,
-- Scheduled" — and the job discarded it. It no longer does. DART's company profile
-- gives no name at all, so KSIC nodes stay empty here until a KSIC name table exists;
-- that is the honest state and it is left visible rather than papered over.
--
-- Scoped to the two source-fed releases. legacy-import-b3-v1 is the frozen baseline and
-- whatever labels it carries are what that import said.

UPDATE core.taxonomy_node node
   SET label = ''
  FROM core.taxonomy_release release
 WHERE release.taxonomy_release_id = node.taxonomy_release_id
   AND release.release_version IN ('dart-company-profile-v1', 'sec-submissions-v1')
   AND node.label = release.taxonomy_system || ' ' || node.code;
`;
