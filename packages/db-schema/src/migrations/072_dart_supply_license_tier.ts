export const dartSupplyLicenseTierMigrationSql = `
-- Give opendart-business-report-supply the ADR-002 tier contract it should have
-- had, and which migration 069 omitted.
--
-- 069 registered the source with policy_status='approved' but a license_policy of
-- {basis: official_api_terms, status: conditional} — no ADR-002 tier tuple. The
-- repository's own invariant is that an approved contract must EITHER carry an
-- exact ADR-002 tier tuple OR be an internal transitional snapshot; this was
-- neither, so it sat as the only violation among 36 approved contracts.
--
-- It went unnoticed because source-contract-integrity.test.ts skips unless
-- STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL is set, and it is not set in the
-- ordinary test run. Six tests reported "skipped" and the suite was green. A test
-- that never runs is a test that cannot fail — the same shape as a job with no
-- caller and a policy row with no reader.
--
-- T1 / accepted_evidence_and_display / attribution_required, mirroring the sibling
-- 'opendart' source approved 2026-07-20. Same API, same licence, and the same use:
-- the filing is quoted as accepted evidence behind SUPPLIES and CUSTOMER_OF.
-- Contracts are append-only, so this is a new revision rather than an edit.
INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status, cadence_policy, cutoff_policy, delay_policy,
  correction_policy, required_fields, license_policy, redistribution_policy,
  raw_retention_policy, quality_gate_policy, effective_from, known_from, content_hash
)
SELECT prev.source_id,
       prev.revision_no + 1,
       'approved',
       prev.cadence_policy,
       prev.cutoff_policy,
       prev.delay_policy,
       prev.correction_policy,
       prev.required_fields,
       jsonb_build_object(
         'adr', 'ADR-002',
         'tier', 'T1',
         'approved_at', '2026-08-06 21:00:00+09',
         'approved_usage', 'accepted_evidence_and_display',
         'license_status', 'conditional'
       ),
       jsonb_build_object(
         'adr', 'ADR-002',
         'mode', 'attribution_required',
         'enforcement', 'warn',
         'redistribution', 'derived_only'
       ),
       prev.raw_retention_policy,
       prev.quality_gate_policy,
       prev.effective_from,
       now(),
       encode(sha256('opendart-business-report-supply:v2-adr002-t1'::bytea), 'hex')
FROM ingestion.source_contract_revision prev
JOIN ingestion.source src ON src.source_id = prev.source_id
WHERE src.provider_key = 'opendart-business-report-supply'
  AND prev.revision_no = (
    SELECT max(inner_rev.revision_no)
    FROM ingestion.source_contract_revision inner_rev
    WHERE inner_rev.source_id = prev.source_id
  )
  AND prev.license_policy->>'adr' IS DISTINCT FROM 'ADR-002';
`;
