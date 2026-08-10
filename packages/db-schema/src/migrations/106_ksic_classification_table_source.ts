export const ksicClassificationTableSourceMigrationSql = `
-- A source for the KSIC code→name table, so KSIC nodes can say what they mean.
--
-- 169 Korean stocks carry a KSIC code and every one of their taxonomy nodes has an
-- empty label, because DART's company profile reports the code and never its name.
-- '66121' is not something a reviewer can act on; '증권 중개업' is. Sector playbooks
-- are written by reading what an industry IS, so this blocks that work outright.
--
-- WHY A THIRD-PARTY MIRROR, STATED PLAINLY. The authoritative publisher is Statistics
-- Korea. Its portal moved to kssc.narastat.kr in December 2025 and neither that host
-- nor the old kostat.go.kr one resolves from this network; data.go.kr and KOSIS both
-- respond but publish no KSIC code→name API — checked, not assumed. What is reachable
-- is github.com/FinanceData/KSIC, which mirrors the table and cites 통계청 as its
-- origin. It carries NO LICENSE FILE.
--
-- So this source is registered the way an unverified mirror should be: license_status
-- 'conditional', redistribution 'internal_only', contract provisional. The underlying
-- classification is a Korean government work and is very likely freely usable, but
-- "very likely" is not a licence review, and asserting one here would put a claim in
-- the ledger that nobody made. Displaying these names to users needs that review
-- first; using them internally to decide which playbook governs a company does not.
--
-- WHICH REVISION, AND WHY IT IS RECORDED. The mirror publishes the 9th (2008, 1,931
-- entries) and 10th (2017, 2,000) revisions. Measured against the 123 KSIC codes this
-- database actually holds: 9th covers 118, 10th covers 121. They also DISAGREE on the
-- name of 50 codes we hold — 20111 is '석유화학계 기초화학물질 제조업' in the 9th and
-- '석유화학계 기초 화학 물질 제조업' in the 10th. A label with no revision behind it is
-- therefore ambiguous, so the revision is part of the source identity rather than a
-- footnote.
--
-- The two codes neither revision covers (21100 셀트리온, 21212 한미약품) keep empty
-- labels. Their 4-digit parents exist and it would be easy to borrow those names, and
-- wrong: the parent is a broader category, and writing it on a leaf claims a precision
-- the source never gave.
INSERT INTO ingestion.source (
  provider_key, source_type, tier, license_status, redistribution, enforcement, metadata
)
SELECT 'ksic-classification-table',
       'api', 3, 'conditional', 'internal_only', 'warn',
       jsonb_build_object(
         'display_name', 'KSIC 한국표준산업분류 code table (third-party mirror)',
         'source_class', 'third_party_mirror',
         'authoritative_publisher', '통계청 / 국가데이터처',
         'mirror_url', 'https://github.com/FinanceData/KSIC',
         'mirror_license', 'none stated',
         'revision', 'KSIC 10th (2017)',
         'authoritative_portal_unreachable', 'kssc.narastat.kr and kssc.kostat.go.kr do not resolve from this network',
         'terms_reviewed', false,
         'created_by', 'migration-106'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM ingestion.source WHERE provider_key = 'ksic-classification-table'
);

INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status, cadence_policy, cutoff_policy, delay_policy,
  correction_policy, required_fields, license_policy, redistribution_policy,
  raw_retention_policy, quality_gate_policy, effective_from, known_from, content_hash
)
SELECT src.source_id, 1, 'provisional_review_required',
       -- A classification revision lands roughly once a decade. There is nothing to
       -- poll; this is fetched when the table is missing or a new revision is adopted.
       jsonb_build_object('kind', 'revision_release', 'note', 'KSIC revisions are ~10 years apart'),
       jsonb_build_object('kind', 'fetch_time', 'no_backdating', true),
       jsonb_build_object('state', 'unknown', 'note', 'mirror lag behind the official revision not measured'),
       jsonb_build_object('mode', 'append_revision'),
       jsonb_build_array('Industy_code', 'Industy_name'),
       -- Deliberately not an ADR-002 tier. That tuple is a licence decision and no
       -- licence has been reviewed; claiming a tier would be the assertion this whole
       -- header exists to avoid.
       jsonb_build_object('license_status', 'conditional', 'basis', 'unlicensed_third_party_mirror'),
       jsonb_build_object('mode', 'internal_only'),
       jsonb_build_object('mode', 'retain'),
       jsonb_build_object(
         'observed_document', true,
         -- The column names are the mirror's, typo included. Renaming them on the way
         -- in would make the stored shape disagree with the bytes it came from.
         'upstream_column_typo', 'Industy_code / Industy_name',
         'revision_disagreement_measured', '50 of the codes this database holds are named differently in the 9th and 10th revisions',
         'exact_source_endpoint', 'https://raw.githubusercontent.com/FinanceData/KSIC/master/KSIC_10.csv.gz'
       ),
       '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z',
       encode(sha256('ksic-classification-table:v1'::bytea), 'hex')
FROM ingestion.source src
WHERE src.provider_key = 'ksic-classification-table'
  AND NOT EXISTS (
    SELECT 1 FROM ingestion.source_contract_revision existing
    WHERE existing.source_id = src.source_id
  );
`;
