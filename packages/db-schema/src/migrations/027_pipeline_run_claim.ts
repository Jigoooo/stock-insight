export const pipelineRunClaimMigrationSql = `
-- B9 — durable pipeline run claim with fencing token (master plan §8 B9,
-- scheduler cutover runbook step 1). Legacy AND new schedulers must both
-- acquire this claim before running a worker; whoever loses the claim must
-- not execute. Expired-lease takeover bumps the fencing token so a paused
-- old owner resuming late can be rejected by token comparison downstream.
-- Purely additive; migration 027.

CREATE TABLE IF NOT EXISTS ops.pipeline_run_claim (
    pipeline_run_claim_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    natural_run_key  TEXT NOT NULL,
    dataset_key      TEXT NOT NULL,
    claimed_by       TEXT NOT NULL,
    fencing_token    BIGINT NOT NULL DEFAULT 1 CHECK (fencing_token >= 1),
    claim_status     TEXT NOT NULL DEFAULT 'claimed'
      CHECK (claim_status IN ('claimed','completed','failed','expired')),
    claimed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    completed_at     TIMESTAMPTZ,
    metadata         JSONB NOT NULL DEFAULT '{}',
    CHECK (lease_expires_at > claimed_at),
    CHECK (claim_status NOT IN ('completed','failed') OR completed_at IS NOT NULL),
    UNIQUE (natural_run_key)
);
CREATE INDEX IF NOT EXISTS ix_pipeline_run_claim_dataset
  ON ops.pipeline_run_claim (dataset_key, claim_status);

-- Atomic claim: insert a new key directly; on conflict, lock the current row
-- first and only then capture the takeover timestamp so lock wait never consumes
-- the new owner's lease.
CREATE OR REPLACE FUNCTION ops.claim_pipeline_run(
  p_natural_run_key TEXT,
  p_dataset_key     TEXT,
  p_claimed_by      TEXT,
  p_lease_seconds   INTEGER
) RETURNS TABLE (
  claimed       BOOLEAN,
  fencing_token BIGINT,
  owner         TEXT
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ops
AS $$
DECLARE
  v_row ops.pipeline_run_claim%ROWTYPE;
  v_now TIMESTAMPTZ;
BEGIN
  IF nullif(btrim(p_natural_run_key), '') IS NULL
     OR nullif(btrim(p_dataset_key), '') IS NULL
     OR nullif(btrim(p_claimed_by), '') IS NULL THEN
    RAISE EXCEPTION 'claim keys and owner must be non-empty';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 86400 THEN
    RAISE EXCEPTION 'lease seconds must be between 1 and 86400';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_natural_run_key, 0));
  SELECT * INTO v_row FROM ops.pipeline_run_claim
  WHERE natural_run_key = p_natural_run_key
  FOR UPDATE;
  IF NOT FOUND THEN
    v_now := clock_timestamp();
    INSERT INTO ops.pipeline_run_claim (
      natural_run_key, dataset_key, claimed_by, claimed_at, lease_expires_at
    ) VALUES (
      p_natural_run_key, p_dataset_key, p_claimed_by, v_now,
      v_now + make_interval(secs => p_lease_seconds)
    )
    RETURNING * INTO v_row;
    RETURN QUERY SELECT true, v_row.fencing_token, v_row.claimed_by;
    RETURN;
  END IF;
  IF v_row.claim_status = 'completed' THEN
    RETURN QUERY SELECT false, v_row.fencing_token, v_row.claimed_by;
    RETURN;
  END IF;
  v_now := clock_timestamp();

  IF v_row.claim_status IN ('failed','expired')
     OR v_row.lease_expires_at <= v_now THEN
    UPDATE ops.pipeline_run_claim
    SET claimed_by       = p_claimed_by,
        dataset_key      = p_dataset_key,
        claim_status     = 'claimed',
        claimed_at       = v_now,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        completed_at     = NULL,
        fencing_token    = v_row.fencing_token + 1
    WHERE pipeline_run_claim_id = v_row.pipeline_run_claim_id
    RETURNING * INTO v_row;
    RETURN QUERY SELECT true, v_row.fencing_token, v_row.claimed_by;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, v_row.fencing_token, v_row.claimed_by;
END $$;

CREATE OR REPLACE FUNCTION ops.renew_pipeline_run(
  p_natural_run_key TEXT,
  p_claimed_by      TEXT,
  p_fencing_token  BIGINT,
  p_lease_seconds  INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ops
AS $$
DECLARE
  v_row ops.pipeline_run_claim%ROWTYPE;
  v_now TIMESTAMPTZ;
  v_updated BOOLEAN := false;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 86400 THEN
    RAISE EXCEPTION 'lease seconds must be between 1 and 86400';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_natural_run_key, 0));
  SELECT * INTO v_row FROM ops.pipeline_run_claim
  WHERE natural_run_key = p_natural_run_key
  FOR UPDATE;
  v_now := clock_timestamp();
  UPDATE ops.pipeline_run_claim
  SET lease_expires_at = v_now + make_interval(secs => p_lease_seconds)
  WHERE natural_run_key = p_natural_run_key
    AND claimed_by = p_claimed_by
    AND fencing_token = p_fencing_token
    AND claim_status = 'claimed'
    AND lease_expires_at > v_now
  RETURNING true INTO v_updated;
  RETURN coalesce(v_updated, false);
END $$;

CREATE OR REPLACE FUNCTION ops.finish_pipeline_run(
  p_natural_run_key TEXT,
  p_claimed_by      TEXT,
  p_fencing_token  BIGINT,
  p_terminal_status TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ops
AS $$
DECLARE
  v_row ops.pipeline_run_claim%ROWTYPE;
  v_now TIMESTAMPTZ;
  v_updated BOOLEAN := false;
BEGIN
  IF p_terminal_status IS NULL OR p_terminal_status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'terminal status must be completed or failed';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_natural_run_key, 0));
  SELECT * INTO v_row FROM ops.pipeline_run_claim
  WHERE natural_run_key = p_natural_run_key
  FOR UPDATE;
  v_now := clock_timestamp();
  UPDATE ops.pipeline_run_claim
  SET claim_status = p_terminal_status,
      completed_at = v_now
  WHERE natural_run_key = p_natural_run_key
    AND claimed_by = p_claimed_by
    AND fencing_token = p_fencing_token
    AND claim_status = 'claimed'
    AND lease_expires_at > v_now
  RETURNING true INTO v_updated;
  RETURN coalesce(v_updated, false);
END $$;

GRANT USAGE ON SCHEMA ops TO si_analytics;
REVOKE ALL ON ops.pipeline_run_claim FROM PUBLIC, si_analytics;
GRANT SELECT ON ops.pipeline_run_claim TO si_analytics;
REVOKE ALL ON SEQUENCE ops.pipeline_run_claim_pipeline_run_claim_id_seq FROM PUBLIC, si_analytics;
REVOKE ALL ON FUNCTION ops.claim_pipeline_run(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.renew_pipeline_run(TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.finish_pipeline_run(TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.claim_pipeline_run(TEXT, TEXT, TEXT, INTEGER) TO si_analytics;
GRANT EXECUTE ON FUNCTION ops.renew_pipeline_run(TEXT, TEXT, BIGINT, INTEGER) TO si_analytics;
GRANT EXECUTE ON FUNCTION ops.finish_pipeline_run(TEXT, TEXT, BIGINT, TEXT) TO si_analytics;
`;
