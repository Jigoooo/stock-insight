BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ops.publication_record_revision.v1'));

CREATE OR REPLACE FUNCTION ops.publication_record_payload(p_record_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
STRICT
AS $$
  SELECT to_jsonb(pr) - ARRAY[
    'analysis_run_id','analysis_revision','cutoff_at','source_watermark_at','lifecycle_state'
  ]
  FROM public.publication_records pr
  WHERE pr.id=p_record_id;
$$;

CREATE OR REPLACE FUNCTION ops.publication_record_payload_sha256(p_record_id BIGINT)
RETURNS TEXT
LANGUAGE sql
STABLE
STRICT
AS $$
  SELECT encode(digest(ops.publication_record_payload(p_record_id)::text,'sha256'),'hex');
$$;

CREATE TABLE IF NOT EXISTS ops.publication_record_revision (
  record_revision_id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL,
  record_key TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (record_id, payload_sha256),
  UNIQUE (record_revision_id, record_id, record_key),
  CONSTRAINT publication_record_revision_identity_fk
    FOREIGN KEY (record_id, record_key)
    REFERENCES public.publication_records(id, record_key)
    ON DELETE RESTRICT,
  CONSTRAINT publication_record_revision_payload_hash_check
    CHECK (payload_sha256=encode(digest(payload::text,'sha256'),'hex'))
);

CREATE OR REPLACE FUNCTION ops.reject_publication_record_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'publication record revision ledger is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_publication_record_revision_mutation
  ON ops.publication_record_revision;
CREATE TRIGGER trg_reject_publication_record_revision_mutation
BEFORE UPDATE OR DELETE OR TRUNCATE ON ops.publication_record_revision
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_publication_record_revision_mutation();

ALTER TABLE ops.analysis_run_record
  ADD COLUMN IF NOT EXISTS record_revision_id BIGINT;

-- Capture the current payload once. This does not promote mismatched historical
-- bindings: those stay NULL and therefore stay invalid until a new run revision.
INSERT INTO ops.publication_record_revision(record_id,record_key,payload_sha256,payload)
SELECT pr.id,pr.record_key,ops.publication_record_payload_sha256(pr.id),
       ops.publication_record_payload(pr.id)
FROM public.publication_records pr
ON CONFLICT (record_id,payload_sha256) DO NOTHING;

DROP TRIGGER IF EXISTS trg_reject_analysis_run_record_mutation ON ops.analysis_run_record;
UPDATE ops.analysis_run_record binding
SET record_revision_id=revision.record_revision_id
FROM ops.publication_record_revision revision
WHERE revision.record_id=binding.record_id
  AND revision.record_key=binding.record_key
  AND revision.payload_sha256=binding.payload_sha256
  AND binding.record_revision_id IS NULL;
CREATE TRIGGER trg_reject_analysis_run_record_mutation
BEFORE UPDATE OR DELETE OR TRUNCATE ON ops.analysis_run_record
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_analysis_run_ledger_mutation();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='analysis_run_record_record_revision_fk'
      AND conrelid='ops.analysis_run_record'::regclass
  ) THEN
    ALTER TABLE ops.analysis_run_record
      ADD CONSTRAINT analysis_run_record_record_revision_fk
      FOREIGN KEY (record_revision_id,record_id,record_key)
      REFERENCES ops.publication_record_revision(record_revision_id,record_id,record_key)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ops.capture_analysis_run_record_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ops, public, pg_temp
AS $$
DECLARE
  current_payload JSONB;
  current_sha256 TEXT;
  matched_revision_id BIGINT;
BEGIN
  IF NEW.record_revision_id IS NOT NULL THEN
    PERFORM 1
    FROM ops.publication_record_revision revision
    WHERE revision.record_revision_id=NEW.record_revision_id
      AND revision.record_id=NEW.record_id
      AND revision.record_key=NEW.record_key
      AND revision.payload_sha256=NEW.payload_sha256;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'analysis binding revision identity does not match payload';
    END IF;
    RETURN NEW;
  END IF;

  current_payload := ops.publication_record_payload(NEW.record_id);
  current_sha256 := encode(digest(current_payload::text,'sha256'),'hex');

  IF NEW.payload_sha256=current_sha256 THEN
    INSERT INTO ops.publication_record_revision(record_id,record_key,payload_sha256,payload)
    VALUES (NEW.record_id,NEW.record_key,current_sha256,current_payload)
    ON CONFLICT (record_id,payload_sha256) DO NOTHING;
  END IF;

  SELECT revision.record_revision_id INTO matched_revision_id
  FROM ops.publication_record_revision revision
  WHERE revision.record_id=NEW.record_id
    AND revision.record_key=NEW.record_key
    AND revision.payload_sha256=NEW.payload_sha256;

  IF matched_revision_id IS NULL AND NEW.lifecycle_state='active' THEN
    RAISE EXCEPTION 'payload snapshot hash does not match binding for %',NEW.record_key;
  END IF;
  NEW.record_revision_id := matched_revision_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION ops.capture_analysis_run_record_revision() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_capture_analysis_run_record_revision ON ops.analysis_run_record;
CREATE TRIGGER trg_capture_analysis_run_record_revision
BEFORE INSERT ON ops.analysis_run_record
FOR EACH ROW EXECUTE FUNCTION ops.capture_analysis_run_record_revision();

CREATE OR REPLACE FUNCTION ops.analysis_run_binding_requires_payload_recovery(
  p_analysis_run_id TEXT,
  p_revision INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ops, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ops.analysis_run_record binding
    LEFT JOIN ops.publication_record_revision revision
      ON revision.record_revision_id=binding.record_revision_id
    WHERE binding.analysis_run_id=p_analysis_run_id
      AND binding.revision=p_revision
      AND binding.lifecycle_state='active'
      AND (
        binding.record_revision_id IS NULL
        OR revision.record_revision_id IS NULL
        OR revision.record_id<>binding.record_id
        OR revision.record_key<>binding.record_key
        OR revision.payload_sha256<>binding.payload_sha256
      )
  );
$$;

REVOKE ALL ON FUNCTION ops.analysis_run_binding_requires_payload_recovery(TEXT,INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.analysis_run_binding_requires_payload_recovery(TEXT,INTEGER)
  TO PUBLIC;

-- Preserve the original validator/registrar as an internal implementation. The
-- public wrapper below adds one narrowly-scoped path: a same-content replay may
-- append a new revision when the current binding predates immutable snapshots.
DO $$
BEGIN
  IF to_regprocedure(
    'ops.register_analysis_run_contract_v1(text,text,date,text,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text)'
  ) IS NULL THEN
    ALTER FUNCTION ops.register_analysis_run_contract(
      TEXT,TEXT,DATE,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,JSONB,JSONB,TEXT
    ) RENAME TO register_analysis_run_contract_v1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ops.register_analysis_run_contract(
  p_analysis_run_id TEXT,
  p_domain TEXT,
  p_run_date DATE,
  p_run_type TEXT,
  p_cutoff_at TIMESTAMPTZ,
  p_source_watermark_at TIMESTAMPTZ,
  p_fresh_until TIMESTAMPTZ,
  p_source_record_keys JSONB,
  p_source_keys JSONB,
  p_content_sha256 TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  validated_revision INTEGER;
  current_row ops.analysis_run_contract%ROWTYPE;
  next_revision INTEGER;
  previous_writer TEXT;
  bound_source_keys JSONB;
  requires_repair BOOLEAN;
BEGIN
  -- v1 remains the canonical validator. It locks the contract row and rejects
  -- conflicting provenance, key readback, or source bindings before returning.
  SELECT ops.register_analysis_run_contract_v1(
    p_analysis_run_id,p_domain,p_run_date,p_run_type,p_cutoff_at,
    p_source_watermark_at,p_fresh_until,p_source_record_keys,p_source_keys,
    p_content_sha256
  ) INTO validated_revision;

  SELECT * INTO current_row
  FROM ops.analysis_run_contract
  WHERE analysis_run_id=p_analysis_run_id
  FOR UPDATE;

  requires_repair := ops.analysis_run_binding_requires_payload_recovery(
    p_analysis_run_id,current_row.current_revision
  );

  IF current_row.content_sha256<>p_content_sha256 OR NOT requires_repair THEN
    RETURN validated_revision;
  END IF;

  -- Close the recovery check-to-capture race. A concurrent publisher must not
  -- mutate any payload after it has matched the historical binding but before
  -- the immutable revision trigger snapshots it. Lock in record-id order to
  -- keep multi-record recoveries deadlock-safe, and retain the locks through
  -- the revision append below.
  PERFORM record.id
  FROM public.publication_records AS record
  JOIN ops.analysis_run_record AS binding ON binding.record_id=record.id
  WHERE binding.analysis_run_id=p_analysis_run_id
    AND binding.revision=current_row.current_revision
    AND binding.lifecycle_state='active'
  ORDER BY record.id
  FOR UPDATE OF record;

  IF EXISTS (
    SELECT 1
    FROM ops.analysis_run_record binding
    WHERE binding.analysis_run_id=p_analysis_run_id
      AND binding.revision=current_row.current_revision
      AND binding.lifecycle_state='active'
      AND ops.publication_record_payload_sha256(binding.record_id)<>binding.payload_sha256
  ) THEN
    RAISE EXCEPTION
      'same-content recovery payloads have not been restored for %',p_analysis_run_id;
  END IF;

  previous_writer := current_setting('ops.analysis_contract_writer',true);
  PERFORM set_config('ops.analysis_contract_writer','register:'||p_analysis_run_id,true);
  next_revision := current_row.current_revision + 1;

  UPDATE ops.analysis_run_contract SET
    current_revision=next_revision,
    lifecycle_state='active',
    retracted_at=NULL,
    retraction_reason=NULL,
    updated_at=clock_timestamp()
  WHERE analysis_run_id=p_analysis_run_id;

  INSERT INTO ops.analysis_run_revision(
    analysis_run_id,revision,lifecycle_state,cutoff_at,source_watermark_at,fresh_until,
    source_record_keys,source_keys,content_sha256,reason
  ) VALUES (
    p_analysis_run_id,next_revision,'active',current_row.cutoff_at,
    current_row.source_watermark_at,current_row.fresh_until,current_row.source_record_keys,
    current_row.source_keys,current_row.content_sha256,'immutable payload recovery'
  );

  INSERT INTO ops.analysis_run_record(
    analysis_run_id,revision,record_id,record_key,lifecycle_state,payload_sha256
  )
  SELECT p_analysis_run_id,next_revision,pr.id,pr.record_key,'active',
         ops.publication_record_payload_sha256(pr.id)
  FROM public.publication_records pr
  WHERE pr.record_key IN (SELECT jsonb_array_elements_text(p_source_record_keys));

  INSERT INTO ops.analysis_run_record_source(
    analysis_run_id,revision,record_key,source_key,lifecycle_state
  )
  SELECT p_analysis_run_id,next_revision,binding.record_key,rs.source_key,'active'
  FROM ops.analysis_run_record binding
  JOIN public.record_sources rs ON rs.record_id=binding.record_id
  WHERE binding.analysis_run_id=p_analysis_run_id
    AND binding.revision=next_revision
    AND rs.source_key IN (SELECT jsonb_array_elements_text(p_source_keys));

  SELECT coalesce(jsonb_agg(source_key ORDER BY source_key), '[]'::jsonb)
  INTO bound_source_keys
  FROM (
    SELECT DISTINCT source_key
    FROM ops.analysis_run_record_source
    WHERE analysis_run_id=p_analysis_run_id AND revision=next_revision
  ) sources;
  IF bound_source_keys<>p_source_keys THEN
    RAISE EXCEPTION 'source binding recovery readback mismatch for %',p_analysis_run_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ops.analysis_run_record
    WHERE analysis_run_id=p_analysis_run_id
      AND revision=next_revision
      AND record_revision_id IS NULL
  ) THEN
    RAISE EXCEPTION 'immutable payload recovery did not seal every binding for %',p_analysis_run_id;
  END IF;

  UPDATE public.publication_records
  SET analysis_run_id=p_analysis_run_id,
      analysis_revision=next_revision,
      cutoff_at=current_row.cutoff_at,
      source_watermark_at=current_row.source_watermark_at,
      lifecycle_state='active'
  WHERE record_key IN (SELECT jsonb_array_elements_text(p_source_record_keys));

  DELETE FROM ops.gbrain_ingest_proof WHERE run_id=p_analysis_run_id;
  UPDATE ops.dataset_watermark
  SET status='unknown',watermark_at=NULL,row_count=NULL,updated_at=clock_timestamp(),
      details=details || jsonb_build_object(
        'reason','analysis run immutable payload recovered',
        'invalidated_source_run_id',p_analysis_run_id,
        'invalidated_revision',next_revision
      )
  WHERE source_run_id=p_analysis_run_id;

  PERFORM set_config('ops.analysis_contract_writer',COALESCE(previous_writer,''),true);
  RETURN next_revision;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_analysis_run_record_revision
  ON ops.analysis_run_record(record_revision_id)
  WHERE record_revision_id IS NOT NULL;

CREATE OR REPLACE VIEW ops.publication_projection_status AS
WITH actual AS (
  SELECT
    contract.analysis_run_id,
    coalesce((
      SELECT jsonb_agg(binding.record_key ORDER BY binding.record_key)
      FROM ops.analysis_run_record binding
      WHERE binding.analysis_run_id=contract.analysis_run_id
        AND binding.revision=contract.current_revision
        AND binding.lifecycle_state='active'
    ), '[]'::jsonb) AS actual_record_keys,
    coalesce((
      SELECT jsonb_agg(source_key ORDER BY source_key)
      FROM (
        SELECT DISTINCT binding.source_key
        FROM ops.analysis_run_record_source binding
        WHERE binding.analysis_run_id=contract.analysis_run_id
          AND binding.revision=contract.current_revision
          AND binding.lifecycle_state='active'
      ) linked
    ), '[]'::jsonb) AS actual_source_keys,
    (SELECT count(*) FROM ops.analysis_run_record binding
      WHERE binding.analysis_run_id=contract.analysis_run_id
        AND binding.revision=contract.current_revision
        AND binding.lifecycle_state='active') AS actual_record_count,
    (SELECT count(*)
      FROM ops.analysis_run_record binding
      JOIN ops.publication_record_revision revision
        ON revision.record_revision_id=binding.record_revision_id
      WHERE binding.analysis_run_id=contract.analysis_run_id
        AND binding.revision=contract.current_revision
        AND binding.lifecycle_state='active'
        AND revision.payload->>'record_type'='briefing') AS briefing_count,
    coalesce((SELECT bool_and(
        binding.record_revision_id IS NOT NULL
        AND revision.record_id=binding.record_id
        AND revision.record_key=binding.record_key
        AND revision.payload_sha256=binding.payload_sha256
      ) FROM ops.analysis_run_record binding
      LEFT JOIN ops.publication_record_revision revision
        ON revision.record_revision_id=binding.record_revision_id
      WHERE binding.analysis_run_id=contract.analysis_run_id
        AND binding.revision=contract.current_revision
        AND binding.lifecycle_state='active'),false) AS payloads_match
  FROM ops.analysis_run_contract contract
), watermark AS (
  SELECT
    contract.analysis_run_id,
    bool_and(w.status='available' AND w.source_run_id=contract.analysis_run_id
      AND w.analysis_revision=contract.current_revision
      AND w.watermark_at IS NOT NULL AND isfinite(w.watermark_at)
      AND w.watermark_at>=contract.cutoff_at
      AND w.watermark_at<=clock_timestamp()+interval '5 minutes'
      AND w.cutoff_at=contract.cutoff_at
      AND w.source_watermark_at=contract.source_watermark_at) FILTER (
        WHERE w.dataset_name IN ('publication_records','user_feed_index')
    ) AS watermarks_available,
    count(*) FILTER (WHERE w.dataset_name IN ('publication_records','user_feed_index')) AS watermark_count
  FROM ops.analysis_run_contract contract
  LEFT JOIN ops.dataset_watermark w
    ON w.domain=contract.domain AND w.source_run_id=contract.analysis_run_id
  GROUP BY contract.analysis_run_id
)
SELECT
  contract.analysis_run_id,
  contract.domain,
  contract.run_date,
  contract.run_type,
  contract.current_revision AS analysis_revision,
  contract.cutoff_at,
  contract.source_watermark_at,
  contract.fresh_until,
  contract.source_record_keys,
  contract.source_keys,
  actual.actual_record_count,
  actual.briefing_count,
  CASE
    WHEN contract.lifecycle_state='retracted' THEN 'retracted'
    WHEN actual.actual_record_keys<>contract.source_record_keys
      OR actual.actual_source_keys<>contract.source_keys
      OR actual.briefing_count<>1
      OR actual.payloads_match IS DISTINCT FROM true THEN 'invalid'
    WHEN clock_timestamp()>contract.fresh_until THEN 'stale'
    WHEN coalesce(watermark.watermark_count,0)<>2
      OR watermark.watermarks_available IS DISTINCT FROM true THEN 'pending'
    ELSE 'available'
  END AS projection_status,
  contract.content_sha256,
  contract.updated_at
FROM ops.analysis_run_contract contract
JOIN actual USING (analysis_run_id)
LEFT JOIN watermark USING (analysis_run_id);

CREATE OR REPLACE VIEW ops.internal_web_publication_records AS
SELECT
  status.analysis_run_id,
  status.analysis_revision,
  status.cutoff_at,
  status.source_watermark_at,
  status.fresh_until,
  pr.id,
  pr.record_key,
  pr.record_type,
  pr.domain,
  pr.market,
  pr.run_date,
  pr.run_type,
  pr.source_system,
  pr.source_table,
  pr.source_pk,
  pr.entity_id,
  pr.entity_key,
  pr.ticker,
  pr.name,
  pr.category,
  pr.title,
  pr.body_text,
  pr.summary_text,
  pr.numeric_value,
  pr.change_pct,
  pr.currency,
  pr.confidence,
  pr.horizon,
  pr.quality_flags,
  pr.raw_refs,
  pr.raw_json,
  pr.created_at,
  pr.published_at,
  binding.lifecycle_state
FROM ops.publication_projection_status status
JOIN ops.analysis_run_record binding
  ON binding.analysis_run_id=status.analysis_run_id
 AND binding.revision=status.analysis_revision
 AND binding.lifecycle_state='active'
JOIN ops.publication_record_revision revision
  ON revision.record_revision_id=binding.record_revision_id
 AND revision.record_id=binding.record_id
 AND revision.record_key=binding.record_key
 AND revision.payload_sha256=binding.payload_sha256
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.publication_records, revision.payload) pr
WHERE status.projection_status='available'
  AND pr.domain=status.domain
  AND pr.run_date=status.run_date
  AND (pr.record_type<>'briefing' OR pr.run_type=status.run_type)
  AND revision.payload_sha256=binding.payload_sha256;

COMMENT ON TABLE ops.publication_record_revision IS
  'Immutable typed payload snapshots captured when publication records are bound to analysis revisions.';
COMMENT ON COLUMN ops.analysis_run_record.record_revision_id IS
  'Immutable publication payload revision used by this analysis binding; NULL marks unrecoverable historical mismatches.';

COMMIT;
