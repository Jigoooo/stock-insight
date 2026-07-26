\set ON_ERROR_STOP on
BEGIN;

CREATE ROLE publication_revision_writer_probe NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public,ops TO publication_revision_writer_probe;
GRANT SELECT ON public.migration_runs,public.publication_records,
  public.source_documents,public.record_sources TO publication_revision_writer_probe;
GRANT UPDATE ON public.publication_records TO publication_revision_writer_probe;
GRANT SELECT,INSERT,UPDATE ON ops.analysis_run_contract TO publication_revision_writer_probe;
GRANT SELECT,INSERT ON ops.analysis_run_revision,ops.analysis_run_record,
  ops.analysis_run_record_source TO publication_revision_writer_probe;
GRANT SELECT,UPDATE ON ops.publication_identity_registry TO publication_revision_writer_probe;
GRANT SELECT,UPDATE ON ops.dataset_watermark TO publication_revision_writer_probe;
GRANT SELECT,DELETE ON ops.gbrain_ingest_proof TO publication_revision_writer_probe;
GRANT EXECUTE ON FUNCTION ops.register_analysis_run_contract(
  TEXT,TEXT,DATE,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,JSONB,TEXT
) TO publication_revision_writer_probe;
GRANT EXECUTE ON FUNCTION ops.register_analysis_run_contract_v1(
  TEXT,TEXT,DATE,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,JSONB,TEXT
) TO publication_revision_writer_probe;
GRANT EXECUTE ON FUNCTION ops.publication_record_payload(BIGINT),
  ops.publication_record_payload_sha256(BIGINT) TO publication_revision_writer_probe;

DO $test$
DECLARE
  source_contract ops.analysis_run_contract%ROWTYPE;
  source_briefing public.publication_records%ROWTYPE;
  rehearsal_run_id TEXT;
  rehearsal_record_key TEXT;
  expected_record_keys JSONB;
  registered_revision INTEGER;
  recovered_revision INTEGER;
  retracted_revision INTEGER;
  snapshot_count_before_retraction BIGINT;
  captured_title TEXT;
  rehearsal_cutoff_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO source_contract
  FROM ops.analysis_run_contract
  WHERE lifecycle_state='active'
  ORDER BY run_date DESC,updated_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rehearsal requires an active analysis contract';
  END IF;

  SELECT pr.* INTO source_briefing
  FROM ops.analysis_run_record binding
  JOIN public.publication_records pr ON pr.id=binding.record_id
  WHERE binding.analysis_run_id=source_contract.analysis_run_id
    AND binding.revision=source_contract.current_revision
    AND pr.record_type='briefing'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rehearsal source briefing missing';
  END IF;

  rehearsal_run_id := source_contract.domain || ':' || source_contract.run_date::text || ':revision_rehearsal';
  rehearsal_record_key := 'revision-rehearsal:' || txid_current()::text;

  INSERT INTO public.migration_runs(
    run_id,job_name,source_system,status,started_at,summary
  ) VALUES (
    rehearsal_run_id,'sync_daily_to_postgres','revision_rehearsal','pending_projection',
    clock_timestamp()-interval '2 minutes','{}'::jsonb
  );

  INSERT INTO public.publication_records(
    record_key,record_type,domain,market,run_date,run_type,source_system,source_table,
    source_pk,entity_id,entity_key,ticker,name,category,title,body_text,summary_text,
    numeric_value,change_pct,currency,confidence,horizon,quality_flags,raw_refs,raw_json,
    published_at
  ) VALUES (
    rehearsal_record_key,source_briefing.record_type,source_briefing.domain,
    source_briefing.market,source_briefing.run_date,'revision_rehearsal',
    'revision_rehearsal',source_briefing.source_table,
    source_briefing.source_pk || ':revision-rehearsal:' || txid_current()::text,
    source_briefing.entity_id,source_briefing.entity_key,source_briefing.ticker,
    source_briefing.name,source_briefing.category,'sealed title',source_briefing.body_text,
    source_briefing.summary_text,source_briefing.numeric_value,source_briefing.change_pct,
    source_briefing.currency,source_briefing.confidence,source_briefing.horizon,
    source_briefing.quality_flags,source_briefing.raw_refs,source_briefing.raw_json,
    clock_timestamp()
  );

  INSERT INTO public.record_sources(
    record_id,source_document_id,source_key,source_type,url,title,source_name,published_at,used_claim
  )
  SELECT clone.id,rs.source_document_id,rs.source_key,rs.source_type,rs.url,rs.title,
         rs.source_name,rs.published_at,rs.used_claim
  FROM public.record_sources rs
  JOIN public.publication_records clone ON clone.record_key=rehearsal_record_key
  WHERE rs.record_id=source_briefing.id;

  SELECT jsonb_agg(record_key ORDER BY record_key) INTO expected_record_keys
  FROM (
    SELECT CASE WHEN record_key=source_briefing.record_key
      THEN rehearsal_record_key ELSE record_key END AS record_key
    FROM ops.analysis_run_record
    WHERE analysis_run_id=source_contract.analysis_run_id
      AND revision=source_contract.current_revision
  ) keys;

  rehearsal_cutoff_at := clock_timestamp()-interval '1 minute';
  EXECUTE 'SET LOCAL ROLE publication_revision_writer_probe';
  SELECT ops.register_analysis_run_contract(
    rehearsal_run_id,source_contract.domain,source_contract.run_date,'revision_rehearsal',
    rehearsal_cutoff_at,rehearsal_cutoff_at-interval '1 minute',
    rehearsal_cutoff_at+interval '18 hours',
    expected_record_keys,source_contract.source_keys,repeat('a',64)
  ) INTO registered_revision;
  EXECUTE 'RESET ROLE';
  IF registered_revision<>1 THEN
    RAISE EXCEPTION 'unexpected rehearsal revision %',registered_revision;
  END IF;

  SET CONSTRAINTS ALL IMMEDIATE;

  IF EXISTS (
    SELECT 1 FROM ops.analysis_run_record
    WHERE analysis_run_id=rehearsal_run_id AND record_revision_id IS NULL
  ) THEN
    RAISE EXCEPTION 'new active binding did not capture every immutable payload revision';
  END IF;

  INSERT INTO ops.dataset_watermark(
    domain,dataset_name,watermark_at,source_run_id,row_count,status,updated_at,details,
    analysis_run_id,analysis_revision,cutoff_at,source_watermark_at
  )
  SELECT source_contract.domain,dataset_name,clock_timestamp(),rehearsal_run_id,
         jsonb_array_length(expected_record_keys),'available',clock_timestamp(),'{}'::jsonb,
         rehearsal_run_id,registered_revision,rehearsal_cutoff_at,
         rehearsal_cutoff_at-interval '1 minute'
  FROM unnest(ARRAY['publication_records','user_feed_index']) dataset_name
  ON CONFLICT (domain,dataset_name) DO UPDATE SET
    watermark_at=EXCLUDED.watermark_at,
    source_run_id=EXCLUDED.source_run_id,
    row_count=EXCLUDED.row_count,
    status=EXCLUDED.status,
    updated_at=EXCLUDED.updated_at,
    details=EXCLUDED.details,
    analysis_run_id=EXCLUDED.analysis_run_id,
    analysis_revision=EXCLUDED.analysis_revision,
    cutoff_at=EXCLUDED.cutoff_at,
    source_watermark_at=EXCLUDED.source_watermark_at;

  UPDATE public.publication_records SET title='mutable current title'
  WHERE record_key=rehearsal_record_key;
  SELECT title INTO captured_title
  FROM ops.internal_web_publication_records
  WHERE analysis_run_id=rehearsal_run_id
    AND record_key=rehearsal_record_key;
  IF captured_title IS DISTINCT FROM 'sealed title' THEN
    RAISE EXCEPTION 'immutable snapshot changed after current row mutation: %',captured_title;
  END IF;

  ALTER TABLE ops.analysis_run_record
    DISABLE TRIGGER trg_reject_analysis_run_record_mutation;
  UPDATE ops.analysis_run_record
  SET record_revision_id=NULL
  WHERE analysis_run_id=rehearsal_run_id AND revision=registered_revision;
  ALTER TABLE ops.analysis_run_record
    ENABLE TRIGGER trg_reject_analysis_run_record_mutation;

  EXECUTE 'SET LOCAL ROLE publication_revision_writer_probe';
  BEGIN
    SELECT ops.register_analysis_run_contract(
      rehearsal_run_id,source_contract.domain,source_contract.run_date,'revision_rehearsal',
      rehearsal_cutoff_at,rehearsal_cutoff_at-interval '1 minute',
      rehearsal_cutoff_at+interval '18 hours',
      expected_record_keys,source_contract.source_keys,repeat('a',64)
    ) INTO recovered_revision;
    RAISE EXCEPTION 'mutated same-content recovery unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='mutated same-content recovery unexpectedly succeeded' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%same-content recovery payloads have not been restored%' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';

  UPDATE public.publication_records SET title='sealed title'
  WHERE record_key=rehearsal_record_key;

  SET CONSTRAINTS ALL DEFERRED;
  EXECUTE 'SET LOCAL ROLE publication_revision_writer_probe';
  SELECT ops.register_analysis_run_contract(
    rehearsal_run_id,source_contract.domain,source_contract.run_date,'revision_rehearsal',
    rehearsal_cutoff_at,rehearsal_cutoff_at-interval '1 minute',
    rehearsal_cutoff_at+interval '18 hours',
    expected_record_keys,source_contract.source_keys,repeat('a',64)
  ) INTO recovered_revision;
  EXECUTE 'RESET ROLE';
  SET CONSTRAINTS ALL IMMEDIATE;

  IF recovered_revision<>registered_revision+1 THEN
    RAISE EXCEPTION 'same-content recovery did not append exactly one revision: %',
      recovered_revision;
  END IF;
  IF EXISTS (
    SELECT 1 FROM ops.analysis_run_record
    WHERE analysis_run_id=rehearsal_run_id
      AND revision=recovered_revision
      AND record_revision_id IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM ops.analysis_run_revision
    WHERE analysis_run_id=rehearsal_run_id
      AND revision=recovered_revision
      AND reason='immutable payload recovery'
  ) THEN
    RAISE EXCEPTION 'same-content recovery did not seal a governed revision';
  END IF;

  SELECT count(*) INTO snapshot_count_before_retraction
  FROM ops.publication_record_revision;
  SET CONSTRAINTS ALL DEFERRED;
  SELECT ops.retract_analysis_run_contract(
    rehearsal_run_id,'revision rehearsal retraction'
  ) INTO retracted_revision;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF retracted_revision<>recovered_revision+1 OR EXISTS (
    SELECT 1 FROM ops.analysis_run_record
    WHERE analysis_run_id=rehearsal_run_id
      AND revision=retracted_revision
      AND record_revision_id IS NULL
  ) OR (SELECT count(*) FROM ops.publication_record_revision)<>snapshot_count_before_retraction THEN
    RAISE EXCEPTION 'retraction did not reuse the sealed payload revision';
  END IF;

  ALTER TABLE ops.analysis_run_record
    DISABLE TRIGGER trg_authorize_analysis_run_record_insert;
  EXECUTE 'SET LOCAL ROLE publication_revision_writer_probe';
  BEGIN
    INSERT INTO ops.analysis_run_record(
      analysis_run_id,revision,record_id,record_key,lifecycle_state,payload_sha256
    )
    SELECT rehearsal_run_id,retracted_revision+1,record_id,record_key,'active',repeat('f',64)
    FROM ops.analysis_run_record
    WHERE analysis_run_id=rehearsal_run_id AND revision=recovered_revision
    LIMIT 1;
    RAISE EXCEPTION 'wrong-hash active binding unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='wrong-hash active binding unexpectedly succeeded' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%payload snapshot hash does not match binding%' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';
  ALTER TABLE ops.analysis_run_record
    ENABLE TRIGGER trg_authorize_analysis_run_record_insert;

  BEGIN
    UPDATE ops.publication_record_revision SET payload=payload
    WHERE record_revision_id=(
      SELECT record_revision_id FROM ops.analysis_run_record
      WHERE analysis_run_id=rehearsal_run_id LIMIT 1
    );
    RAISE EXCEPTION 'revision mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='revision mutation unexpectedly succeeded' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM ops.publication_record_revision
    WHERE record_revision_id=(SELECT min(record_revision_id) FROM ops.publication_record_revision);
    RAISE EXCEPTION 'revision delete unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='revision delete unexpectedly succeeded' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
  END;

  EXECUTE 'SET LOCAL ROLE publication_revision_writer_probe';
  BEGIN
    TRUNCATE ops.publication_record_revision;
    RAISE EXCEPTION 'revision truncate unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
END;
$test$;

ROLLBACK;
