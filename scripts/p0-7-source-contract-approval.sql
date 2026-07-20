-- P0-7 — source contract approval execution (ADR-002).
-- Appends a NEW revision per provisional source with policy_status='approved'
-- and the ADR-002 tier + usage boundary recorded in license/redistribution
-- policies. Append-only: no existing revision is modified; the current view
-- picks the newest revision per source.

BEGIN;
SET LOCAL lock_timeout = '5s';

WITH tier_map(provider_key, tier, usage, redistribution) AS (
  VALUES
    ('bok-ecos',                 'T1', 'accepted_evidence_and_display', 'attribution_required'),
    ('fred',                     'T1', 'accepted_evidence_and_display', 'attribution_required'),
    ('ny-fed',                   'T1', 'accepted_evidence_and_display', 'attribution_required'),
    ('opendart',                 'T1', 'accepted_evidence_and_display', 'attribution_required'),
    ('treasury-fiscaldata',      'T1', 'accepted_evidence_and_display', 'attribution_required'),
    ('kdi-eiec-policy-materials','T1', 'accepted_evidence_and_display', 'attribution_required'),
    ('pykrx',                    'T1', 'accepted_evidence_and_display', 'attribution_required'),
    ('yfinance',                 'T3', 'internal_research_only',        'no_redistribution'),
    ('coingecko',                'T3', 'internal_research_only',        'no_redistribution'),
    ('coingecko-global',         'T3', 'internal_research_only',        'no_redistribution'),
    ('alternative-me',           'T3', 'internal_research_only',        'no_redistribution'),
    ('rss-news-bundle',          'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:cnbc-markets',         'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:economist-finance',    'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:ft-opinion',           'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:marketwatch',          'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:nyt-opinion',          'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:yahoo-finance',        'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:매경-사설-칼럼',        'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:매일경제',              'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:연합뉴스-경제',         'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:연합인포맥스',          'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:조선-경제사설',         'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('rss:한경-사설-칼럼',        'T4', 'candidate_evidence_span_quote', 'quote_and_link_only'),
    ('briefing-markdown',        'T5', 'internal_ops_only',             'forbidden'),
    ('stock-candidate',          'T5', 'internal_ops_only',             'forbidden'),
    ('crypto-candidate',         'T5', 'internal_ops_only',             'forbidden'),
    ('env',                      'T5', 'internal_ops_only',             'forbidden'),
    ('yfinance-error',           'T5', 'internal_ops_only',             'forbidden')
)
INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status,
  cadence_policy, cutoff_policy, delay_policy, correction_policy,
  required_fields, license_policy, redistribution_policy,
  raw_retention_policy, quality_gate_policy,
  effective_from, known_from, supersedes_contract_revision_id, content_hash
)
SELECT current_contract.source_id,
       current_contract.revision_no + 1,
       'approved',
       current_contract.cadence_policy,
       current_contract.cutoff_policy,
       current_contract.delay_policy,
       current_contract.correction_policy,
       current_contract.required_fields,
       current_contract.license_policy || jsonb_build_object(
         'adr', 'ADR-002',
         'tier', tier_map.tier,
         'approved_usage', tier_map.usage,
         'approved_at', now()::text
       ),
       current_contract.redistribution_policy || jsonb_build_object(
         'adr', 'ADR-002',
         'mode', tier_map.redistribution
       ),
       current_contract.raw_retention_policy || jsonb_build_object(
         'crypto_shredding_supported', true,
         'takedown_procedure', 'restricted_vault_then_shred'
       ),
       current_contract.quality_gate_policy,
       now(), now(),
       current_contract.source_contract_revision_id,
       encode(sha256(convert_to(
         source.provider_key || ':ADR-002:' || tier_map.tier || ':' || (current_contract.revision_no + 1)::text,
         'UTF8')), 'hex')
FROM ingestion.source_contract_current_v1 current_contract
JOIN ingestion.source source USING (source_id)
JOIN tier_map ON tier_map.provider_key = source.provider_key
WHERE current_contract.policy_status = 'provisional_review_required';

INSERT INTO public.migration_runs (run_id, job_name, source_system, status, started_at, finished_at, rows_read, rows_written, rows_skipped, error, summary)
VALUES (gen_random_uuid()::text, 'p0-7-source-contract-approval', 'governance', 'completed', now(), now(), 29, 29, 0, NULL,
        '{"adr":"ADR-002","action":"approve provisional source contracts with tier boundaries"}'::jsonb);

COMMIT;

SELECT policy_status, count(*) FROM ingestion.source_contract_current_v1 GROUP BY 1;
