-- P0-7 — source contract approval execution (ADR-002).
-- Appends a NEW revision per provisional source with policy_status='approved'
-- and the ADR-002 tier + usage boundary recorded in license/redistribution
-- policies. Append-only: no existing revision is modified; the current view
-- picks the newest revision per source.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE p0_source_tier_map (
  provider_key TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  usage TEXT NOT NULL,
  redistribution TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO p0_source_tier_map(provider_key, tier, usage, redistribution)
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
    ('yfinance-error',           'T5', 'internal_ops_only',             'forbidden');
DO $$
DECLARE
  candidate_count INTEGER := 0;
  unmapped_count INTEGER := 0;
  inserted_count INTEGER := 0;
  unmapped_providers TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('p0-7-source-contract-approval', 0));

  SELECT count(*)::int,
         count(*) FILTER (WHERE tier_map.provider_key IS NULL)::int,
         string_agg(source.provider_key, ',' ORDER BY source.provider_key)
           FILTER (WHERE tier_map.provider_key IS NULL)
  INTO candidate_count, unmapped_count, unmapped_providers
  FROM ingestion.source_contract_current_v1 current_contract
  JOIN ingestion.source source USING (source_id)
  LEFT JOIN p0_source_tier_map tier_map ON tier_map.provider_key = source.provider_key
  WHERE current_contract.policy_status = 'provisional_review_required';

  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'unmapped provisional source providers: %', unmapped_providers;
  END IF;

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
           'approved_at', clock_timestamp()::text
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
         clock_timestamp(), clock_timestamp(),
         current_contract.source_contract_revision_id,
         encode(sha256(convert_to(
           source.provider_key || ':ADR-002:' || tier_map.tier || ':' ||
             (current_contract.revision_no + 1)::text,
           'UTF8')), 'hex')
  FROM ingestion.source_contract_current_v1 current_contract
  JOIN ingestion.source source USING (source_id)
  JOIN p0_source_tier_map tier_map ON tier_map.provider_key = source.provider_key
  WHERE current_contract.policy_status = 'provisional_review_required';

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> candidate_count THEN
    RAISE EXCEPTION 'source contract approval count mismatch: candidates=% inserted=%',
      candidate_count, inserted_count;
  END IF;

  INSERT INTO public.migration_runs (
    run_id, job_name, source_system, status, started_at, finished_at,
    rows_read, rows_written, rows_skipped, error, summary
  ) VALUES (
    gen_random_uuid()::text,
    'p0-7-source-contract-approval',
    'governance',
    'completed',
    clock_timestamp(),
    clock_timestamp(),
    candidate_count,
    inserted_count,
    candidate_count - inserted_count,
    NULL,
    jsonb_build_object(
      'adr', 'ADR-002',
      'action', 'approve provisional source contracts with tier boundaries',
      'candidate_count', candidate_count,
      'inserted_count', inserted_count
    )
  );
END $$;

COMMIT;

SELECT policy_status, count(*) FROM ingestion.source_contract_current_v1 GROUP BY 1;
