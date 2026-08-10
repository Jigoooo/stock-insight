export const dartIndustryTaxonomyReleaseMigrationSql = `
-- A second KSIC release, sourced from DART company profiles rather than the legacy
-- import.
--
-- WHY A NEW RELEASE AND NOT AN UPDATE. Migration 021 wrote the rule down when it
-- built the baseline: "Every Stock receives one system membership in this frozen
-- baseline release. Later source changes require a new taxonomy release + temporal
-- membership; reapplying this import must never replace or collide with baseline
-- history." Editing legacy-import-b3-v1 in place would rewrite what that import
-- said, which is the one thing it was built to preserve.
--
-- WHAT GAP THIS OPENS. 178 of 297 stocks carry an explicit UNCLASSIFIED membership —
-- honest, because the legacy import's public.entities.industry_code was populated for
-- only 119 of them. Measured 2026-08-10, 135 of those 178 are Korean stocks whose
-- KSIC code is ALREADY in this database: public.company_profiles.profile_json
-- ->>'industryCode', captured from DART through internal-company-profile-snapshot,
-- covers 222 KR securities. Nothing needs collecting; the codes were never mapped.
--
-- The remaining 43 are US stocks. Their SIC lives in SEC's submissions endpoint,
-- which this repository does not ingest — sec-edgar is wired to companyfacts, whose
-- payload carries no classification at all. That is a collector change, not a
-- mapping, and it is deliberately not in this migration.
--
-- WHY provisional_review_required. Same status the two baseline releases carry.
-- A code reported by a source is not a code we have verified; the taxonomy contract
-- test asserts every release stays provisional until evidence is approved, and one
-- more source does not change that.
--
-- The nodes and memberships are NOT created here. Codes are data — they arrive with
-- whichever companies the profile snapshot covers, and new Korean listings will bring
-- codes this migration could not have known. run-industry-classification.ts fills them
-- on every analytics run, so the gap closes as coverage grows instead of freezing at
-- whatever 2026-08-10 happened to hold.

INSERT INTO core.taxonomy_release (
  taxonomy_system, release_version, policy_status, effective_from, known_from,
  source_reference, metadata
)
SELECT 'KSIC', 'dart-company-profile-v1', 'provisional_review_required',
       TIMESTAMPTZ '2026-08-10T00:00:00Z', now(),
       'public.company_profiles.profile_json->>industryCode',
       jsonb_build_object(
         'provider', 'internal-company-profile-snapshot',
         'upstream', 'opendart',
         'policy', 'b3-v1'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM core.taxonomy_release
   WHERE taxonomy_system='KSIC' AND release_version='dart-company-profile-v1'
);
`;
