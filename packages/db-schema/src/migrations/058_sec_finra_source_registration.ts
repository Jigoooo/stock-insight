export const secFinraSourceRegistrationMigrationSql = `
-- Registers the two collectors that were fetching outside the source registry.
--
-- ops.source_collection_policy holds 28 rows and every one of them has a matching
-- ingestion.source. SEC EDGAR and FINRA appeared in neither, while
-- run-sec-financial-facts.ts and run-finra-short-volume.ts fetched from them
-- nightly. They were collecting outside the governance every other source passes
-- through, and nothing recorded that they existed.
--
-- Registering them changes no collection behaviour: nothing in the codebase reads
-- collection_allowed or enforcement_mode: they are a ledger, not a gate. 18 of the
-- 28 existing rows sit at review_required and collect anyway. What changes is that
-- these two stop being invisible, and their rows can carry a source_revision.
--
-- reviewed_at is left NULL on both, as it is for ny-fed and treasury-fiscaldata.
-- The terms below were read from the public pages, not reviewed by counsel;
-- marking them reviewed would assert a diligence that did not happen.

INSERT INTO ops.source_collection_policy (
  provider_key, display_name, source_class, license_status, redistribution_scope,
  terms_url, attribution_required, credential_kind, credential_ref, collection_allowed,
  enforcement_mode, decision_reason, valid_from, policy_revision
) VALUES
  (
    'sec-edgar',
    'SEC EDGAR XBRL company facts',
    'official_api',
    'conditional',
    'derived_only',
    'https://www.sec.gov/about/webmaster-frequently-asked-questions',
    true,
    'none',
    'none:',
    true,
    'warn',
    'Government-created content and EDGAR public filing content are free to access and reuse. '
      'The conditions are operational rather than licensing: no authentication, a 10 requests/second '
      'ceiling per user across all machines, and a declared User-Agent identifying the requester. '
      'The collector already sends a contact User-Agent; its request rate has NOT been audited '
      'against the 10/s ceiling. Terms read from the public page, not reviewed by counsel.',
    now(),
    1
  ),
  (
    'finra',
    'FINRA Reg SHO daily short sale volume',
    'public_web',
    'review_required',
    'none',
    'https://www.finra.org/terms-of-use',
    true,
    'none',
    'none:',
    true,
    'shadow',
    'COLLECTING UNDER UNRESOLVED TERMS. The Reg SHO daily files at cdn.finra.org carry no '
      'licence notice and are published "for public dissemination purposes", but finra.org Terms of '
      'Use restrict site content to non-commercial personal or professional use and prohibit bulk '
      'monitoring, data mining/scraping/harvesting tools, derivative works, and use alongside '
      'predictive analytics or other AI. Three of those bracket what this app does: the nightly '
      'collector, the relation/impact derivation, and probability calibration. No document was found '
      'stating whether regulatory dissemination at cdn.finra.org is governed by the site terms. '
      'Registered so the exposure is on the ledger rather than invisible; continuing to collect is a '
      'standing decision, not a cleared one. Terms read from the public page, not reviewed by counsel.',
    now(),
    1
  )
ON CONFLICT (provider_key) DO NOTHING;

-- Same policy shape the other external APIs use (api / tier 1), with each source's
-- own licence posture carried through from the decision above.
INSERT INTO ingestion.source (
  provider_key, source_type, tier, license_status, redistribution, enforcement, metadata
)
SELECT policy.provider_key,
       'api',
       1,
       policy.license_status,
       policy.redistribution_scope,
       policy.enforcement_mode,
       jsonb_build_object(
         'seeded_from', 'ops.source_collection_policy',
         'display_name', policy.display_name,
         'terms_url', policy.terms_url,
         'terms_reviewed', false
       )
FROM ops.source_collection_policy policy
WHERE policy.provider_key IN ('sec-edgar', 'finra')
ON CONFLICT (provider_key) DO NOTHING;

-- Baseline contract revision, identical in shape to migration 020's seed so these
-- two are not a special case in the contract ledger.
INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status, cadence_policy, cutoff_policy,
  delay_policy, correction_policy, required_fields, license_policy,
  redistribution_policy, raw_retention_policy, quality_gate_policy,
  effective_from, known_from, content_hash
)
SELECT source.source_id,
       1,
       'provisional_review_required',
       '{"state":"unknown"}'::jsonb,
       '{"state":"unknown"}'::jsonb,
       '{"state":"unknown"}'::jsonb,
       '{"mode":"append_revision"}'::jsonb,
       '[]'::jsonb,
       jsonb_build_object('license_status', source.license_status),
       jsonb_build_object('redistribution', source.redistribution, 'enforcement', source.enforcement),
       '{"mode":"retain"}'::jsonb,
       jsonb_build_object('tier', source.tier, 'state', 'review_required'),
       source.created_at,
       now(),
       encode(sha256(convert_to(
         source.provider_key || '|baseline-b2-v1|' || source.license_status || '|' || source.redistribution,
         'UTF8'
       )), 'hex')
FROM ingestion.source source
WHERE source.provider_key IN ('sec-edgar', 'finra')
ON CONFLICT (source_id, revision_no) DO NOTHING;

-- Third market.* table to get a lineage column, same reasoning as 056 and 057.
-- Nullable, not backfilled: rows loaded before the collector was routed have no
-- revision and minting one would manufacture provenance.
ALTER TABLE market.short_volume_daily
  ADD COLUMN IF NOT EXISTS source_revision_id BIGINT
    REFERENCES ingestion.source_revision(source_revision_id);

CREATE INDEX IF NOT EXISTS ix_market_short_volume_source_revision
  ON market.short_volume_daily (source_revision_id)
  WHERE source_revision_id IS NOT NULL;

COMMENT ON COLUMN market.short_volume_daily.source_revision_id IS
  'ingestion.source_revision that produced this row. NULL for rows loaded before '
  'the collector was routed through the contract layer; never invented.';
`;
