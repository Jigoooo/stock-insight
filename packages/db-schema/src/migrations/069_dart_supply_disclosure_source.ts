export const dartSupplyDisclosureSourceMigrationSql = `
-- B1 — a dedicated ingestion source for supply relations read out of Korean
-- 사업보고서 filings.
--
-- Why not reuse source 18 ('opendart'): that source is the financial-facts API
-- (재무제표), and this is a different endpoint (document.xml), different content
-- (filing full text), and a different epistemic status — a financial fact is
-- reported by the filer, whereas a supply relation here is EXTRACTED by us from
-- prose. Folding both under one provider_key is the mistake corrected on
-- 2026-08-05, when five distinct internal snapshots all reported themselves as
-- internal-etf-holdings-snapshot and the provenance of 798 rows read as a lie.
--
-- Shaped after 'opendart' (source_type, tier, license_status, redistribution)
-- because it IS the same API under the same licence. What differs is stated
-- rather than copied: this contract says what we know about cadence and refuses
-- to claim what we do not.
--
-- NOTE ON ENFORCEMENT: only policy_status is enforced by code. Migration 024's
-- evidence gate admits source_revision evidence only when the backing contract is
-- 'approved', which is why this revision is approved here. The policy JSON below
-- is read by no runtime path — source-contract-integrity.test.ts hashes it, so it
-- is an auditable written record, not a gate. It is worded accordingly.
INSERT INTO ingestion.source (
  provider_key, source_type, tier, license_status, redistribution, enforcement, metadata
)
SELECT 'opendart-business-report-supply',
       'api', 1, 'conditional', 'derived_only', 'warn',
       jsonb_build_object(
         'display_name', 'OpenDART 사업보고서 supply/customer disclosure',
         'source_class', 'official_api',
         'api_endpoint', 'https://opendart.fss.or.kr/api/document.xml',
         'target_table', 'analytics.firm_supply_relation',
         'created_by', 'migration-069'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM ingestion.source WHERE provider_key = 'opendart-business-report-supply'
);

INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status, cadence_policy, cutoff_policy, delay_policy,
  correction_policy, required_fields, license_policy, redistribution_policy,
  raw_retention_policy, quality_gate_policy, effective_from, known_from, content_hash
)
SELECT src.source_id, 1, 'approved',
       -- Annual, and we know that: 사업보고서 is filed once per fiscal year. The
       -- sibling contract says 'unknown' for cadence; here it is known, so it is
       -- stated.
       jsonb_build_object('kind', 'annual_business_report', 'timezone', 'Asia/Seoul'),
       -- The filing's receipt number carries its receipt date, so the cutoff is
       -- the filing itself rather than our capture time.
       jsonb_build_object('kind', 'filing_receipt_date', 'no_backdating', true),
       -- Not measured. The lag between a filing being accepted by DART and this
       -- job reading it depends on when the collector's cursor reaches the issuer,
       -- and the collector is chunked across days by request budget. Saying
       -- 'unknown' is the honest entry until it is measured.
       jsonb_build_object('state', 'unknown', 'note', 'filing-to-fetch lag not measured'),
       jsonb_build_object('mode', 'append_revision'),
       -- A row cannot exist without these two: the filing it came from and the
       -- issuer that filed it.
       jsonb_build_array('rcept_no', 'corp_code'),
       jsonb_build_object('basis', 'official_api_terms', 'status', 'conditional'),
       jsonb_build_object('mode', 'derived_only'),
       jsonb_build_object('mode', 'retain'),
       jsonb_build_object(
         -- The DOCUMENT is observed. The RELATION is our extraction from its
         -- prose, and conflating the two would let an inference inherit the
         -- authority of a filing. Both facts are recorded separately.
         'observed_document', true,
         'relation_is_extraction_not_filer_assertion', true,
         -- Two decisions that changed the measurement, kept where an auditor can
         -- see them. Decoding EUC-KR produced 148,449 replacement characters and
         -- a reading of "0 매출처" — an absence that was really a misread. Names
         -- are counted only near a customer phrase because searching whole
         -- documents turned a holding company's PORTFOLIO into its customers.
         'decode_encoding', 'utf-8',
         'context_window_chars', 150,
         -- An issuer whose report has no 매출처 section is a real observation, not
         -- a failure: 6 of 40 sampled reports had none. Unlike the curated macro
         -- mapping, emptiness here must not be treated as a defect.
         'empty_result_is_valid_observation', true,
         'exact_source_endpoint', 'https://opendart.fss.or.kr/api/document.xml'
       ),
       '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z',
       encode(sha256('opendart-business-report-supply:v1'::bytea), 'hex')
FROM ingestion.source src
WHERE src.provider_key = 'opendart-business-report-supply'
  AND NOT EXISTS (
    SELECT 1 FROM ingestion.source_contract_revision existing
    WHERE existing.source_id = src.source_id
  );

-- Cursor for the chunked collector. The full universe is 188 KR issuers at ~2
-- requests each, and the daily OpenDART budget for document.xml ran out at 120
-- requests on 2026-08-05, so one run cannot cover it. The collector records how
-- far it got and resumes; hitting the quota is a normal ending, not a failure.
CREATE TABLE IF NOT EXISTS ingestion.dart_supply_cursor (
  cursor_key text PRIMARY KEY,
  last_corp_code text NOT NULL,
  issuers_completed integer NOT NULL DEFAULT 0,
  cycle_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (length(btrim(cursor_key)) > 0),
  CHECK (length(btrim(last_corp_code)) > 0),
  CHECK (issuers_completed >= 0),
  CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE ingestion.dart_supply_cursor IS
  'Resume point for run-dart-supply-disclosure.ts. One row per cursor_key; the collector advances last_corp_code and stops cleanly when OpenDART returns status 020 (quota exceeded).';
`;
