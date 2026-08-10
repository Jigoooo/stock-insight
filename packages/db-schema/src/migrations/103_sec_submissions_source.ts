export const secSubmissionsSourceMigrationSql = `
-- A dedicated ingestion source for SEC submissions, and the SIC taxonomy release it
-- feeds.
--
-- WHY NOT REUSE 'sec-edgar'. That source is the companyfacts endpoint — XBRL financial
-- facts. Submissions is a different endpoint with different content: filer metadata,
-- including the SIC code that companyfacts does not carry at all. Folding them under
-- one provider_key is the mistake migration 069 wrote down after five distinct internal
-- snapshots all reported themselves as internal-etf-holdings-snapshot.
--
-- There is a second, sharper reason here. governance.source_shape_revision derives a
-- payload's field set per source revision, and ingestion.parser.drift alarms when that
-- set changes. Two endpoints under one provider_key would make the shape flip between
-- companyfacts-shaped and submissions-shaped on every run — a permanent false drift on
-- a gauge whose whole value is that it fires rarely.
--
-- WHY provisional_review_required. Its sibling 'sec-edgar' carries
-- terms_reviewed: false, and approving this one would claim a review that has not
-- happened. Approval also requires an exact ADR-002 tier triple (see
-- run-source-contract-audit.ts), which is a licence decision, not a schema one.
INSERT INTO ingestion.source (
  provider_key, source_type, tier, license_status, redistribution, enforcement, metadata
)
SELECT 'sec-edgar-submissions',
       'api', 1, 'conditional', 'derived_only', 'warn',
       jsonb_build_object(
         'display_name', 'SEC EDGAR submissions (filer metadata and SIC)',
         'source_class', 'official_api',
         'api_endpoint', 'https://data.sec.gov/submissions/CIK{cik}.json',
         'terms_url', 'https://www.sec.gov/about/webmaster-frequently-asked-questions',
         'terms_reviewed', false,
         'created_by', 'migration-103'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM ingestion.source WHERE provider_key = 'sec-edgar-submissions'
);

INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status, cadence_policy, cutoff_policy, delay_policy,
  correction_policy, required_fields, license_policy, redistribution_policy,
  raw_retention_policy, quality_gate_policy, effective_from, known_from, content_hash
)
SELECT src.source_id, 1, 'provisional_review_required',
       -- A filer's SIC changes when the filer reclassifies, which is rare and
       -- unscheduled. Polling cadence is ours to choose; the source has none.
       jsonb_build_object('kind', 'on_demand', 'note', 'filer metadata changes are unscheduled'),
       -- Submissions has no as-of. The honest cutoff is when we fetched it, which is
       -- weaker than a filing receipt date and is recorded as such rather than dressed
       -- up as one.
       jsonb_build_object('kind', 'fetch_time', 'no_backdating', true),
       jsonb_build_object('state', 'unknown', 'note', 'reclassification-to-fetch lag not measured'),
       jsonb_build_object('mode', 'append_revision'),
       -- A classification cannot exist without the filer it describes and the code
       -- itself. sicDescription is a label and is deliberately not required: a code
       -- with no label is usable, a label with no code is not.
       jsonb_build_array('cik', 'sic'),
       jsonb_build_object('license_status', 'conditional'),
       jsonb_build_object('mode', 'derived_only'),
       jsonb_build_object('mode', 'retain'),
       jsonb_build_object(
         'observed_document', true,
         -- The SIC is asserted BY THE FILER on its own submissions record. Unlike the
         -- supply relations in migration 069, nothing here is our extraction from
         -- prose — which is why this classification may be marked source_reported.
         'classification_is_filer_assertion', true,
         'exact_source_endpoint', 'https://data.sec.gov/submissions/CIK{cik}.json'
       ),
       '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z',
       encode(sha256('sec-edgar-submissions:v1'::bytea), 'hex')
FROM ingestion.source src
WHERE src.provider_key = 'sec-edgar-submissions'
  AND NOT EXISTS (
    SELECT 1 FROM ingestion.source_contract_revision existing
    WHERE existing.source_id = src.source_id
  );

-- The SIC release this feeds, for the same reason migration 101 opened a second KSIC
-- release: migration 021 froze legacy-import-b3-v1 and said later source changes need
-- a new release rather than an edit to the baseline.
--
-- 43 US stocks sit at explicit UNCLASSIFIED because the legacy import had no
-- industry_code for them, and internal-company-profile-snapshot — which closed the
-- Korean gap — carries no code for any US company. Their SIC exists, in an endpoint
-- this repository did not read.
INSERT INTO core.taxonomy_release (
  taxonomy_system, release_version, policy_status, effective_from, known_from,
  source_reference, metadata
)
SELECT 'SIC', 'sec-submissions-v1', 'provisional_review_required',
       TIMESTAMPTZ '2026-08-10T00:00:00Z', now(),
       'ingestion:sec-edgar-submissions',
       jsonb_build_object(
         'provider', 'sec-edgar-submissions',
         'upstream', 'sec-edgar',
         'policy', 'b3-v1'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM core.taxonomy_release
   WHERE taxonomy_system='SIC' AND release_version='sec-submissions-v1'
);
`;
