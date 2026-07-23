export const cryptoTruthFoundationMigrationSql = `
-- P6-2 — crypto truth: separate event lifecycle, evidence, dependency, and
-- depeg observations over the P6-1 identity module.
CREATE SCHEMA IF NOT EXISTS crypto_truth;

CREATE TABLE IF NOT EXISTS crypto_truth.event (
    crypto_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_key       TEXT NOT NULL UNIQUE,
    event_type      TEXT NOT NULL CHECK (event_type IN (
      'transaction_anomaly','contract_upgrade','audit_publication','exploit',
      'depeg','peg_recovery','protocol_pause','validator_incident',
      'bridge_incident','oracle_incident','governance_execution',
      'chain_halt','chain_restart'
    )),
    blockchain_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (event_key LIKE 'crypto:event:%')
);
CREATE INDEX IF NOT EXISTS ix_crypto_event_chain_type
  ON crypto_truth.event (blockchain_entity_id, event_type);

CREATE TABLE IF NOT EXISTS crypto_truth.event_revision (
    crypto_event_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_event_id BIGINT NOT NULL REFERENCES crypto_truth.event(crypto_event_id),
    revision_no     INTEGER NOT NULL CHECK (revision_no > 0),
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN (
      'detected','reported','confirmed','effective','resolved','retracted'
    )),
    summary_text    TEXT,
    primary_reference_kind TEXT NOT NULL
      CHECK (primary_reference_kind IN ('transaction','source_digest')),
    primary_reference_value TEXT NOT NULL CHECK (length(btrim(primary_reference_value)) > 0),
    finality_state  TEXT NOT NULL
      CHECK (finality_state IN ('unfinalized','safe','finalized','not_applicable')),
    block_height    NUMERIC CHECK (block_height IS NULL OR block_height >= 0),
    block_hash      TEXT,
    transaction_hash TEXT,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
    occurred_at     TIMESTAMPTZ,
    available_at    TIMESTAMPTZ NOT NULL,
    known_at        TIMESTAMPTZ NOT NULL,
    valid_from      TIMESTAMPTZ,
    valid_until     TIMESTAMPTZ,
    supersedes_crypto_event_revision_id BIGINT
      REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (crypto_event_id, revision_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at),
    CHECK (occurred_at IS NULL OR available_at >= occurred_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (
      (primary_reference_kind = 'transaction'
        AND transaction_hash IS NOT NULL
        AND transaction_hash ~ '^0x[0-9a-f]{64}$'
        AND finality_state <> 'not_applicable') OR
      (primary_reference_kind = 'source_digest'
        AND primary_reference_value ~ '^[a-f0-9]{64}$'
        AND finality_state = 'not_applicable')
    ),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_event_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_event_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_event_revision_pit
  ON crypto_truth.event_revision (crypto_event_id, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_crypto_event_revision_source
  ON crypto_truth.event_revision (source_revision_id);
CREATE INDEX IF NOT EXISTS ix_crypto_event_revision_tx
  ON crypto_truth.event_revision (transaction_hash) WHERE transaction_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS crypto_truth.event_participant (
    crypto_event_participant_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_event_revision_id BIGINT NOT NULL
      REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    participant_role TEXT NOT NULL CHECK (participant_role IN (
      'actor','target','affected','dependency','issuer','auditor',
      'attacker_candidate','reserve_asset','venue'
    )),
    role_detail      JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(role_detail) = 'object'),
    UNIQUE (crypto_event_revision_id, crypto_entity_id, participant_role)
);
CREATE INDEX IF NOT EXISTS ix_crypto_event_participant_entity
  ON crypto_truth.event_participant (crypto_entity_id, participant_role);

CREATE TABLE IF NOT EXISTS crypto_truth.event_evidence (
    crypto_event_evidence_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_event_revision_id BIGINT NOT NULL
      REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    evidence_kind   TEXT NOT NULL CHECK (evidence_kind IN (
      'onchain_transaction','audit_report','official_notice','block_explorer',
      'attestation','market_observation'
    )),
    evidence_locator JSONB NOT NULL,
    artifact_digest TEXT NOT NULL CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at    TIMESTAMPTZ NOT NULL,
    known_at        TIMESTAMPTZ NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (crypto_event_revision_id, artifact_digest, evidence_kind)
);
CREATE INDEX IF NOT EXISTS ix_crypto_event_evidence_source
  ON crypto_truth.event_evidence (source_revision_id, known_at DESC);

CREATE TABLE IF NOT EXISTS crypto_truth.contract_dependency_revision (
    contract_dependency_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dependency_key  TEXT NOT NULL,
    revision_no     INTEGER NOT NULL CHECK (revision_no > 0),
    from_crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    to_crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    dependency_kind TEXT NOT NULL CHECK (dependency_kind IN (
      'calls','delegatecalls','oracle_feed','bridge_route','reserve_backing',
      'custody','settlement','upgrade_admin','liquidity_pool'
    )),
    dependency_state TEXT NOT NULL CHECK (dependency_state IN (
      'observed','verified','inactive','retracted'
    )),
    confidence      NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    evidence_locator JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at    TIMESTAMPTZ NOT NULL,
    known_at        TIMESTAMPTZ NOT NULL,
    valid_from      TIMESTAMPTZ,
    valid_until     TIMESTAMPTZ,
    supersedes_contract_dependency_revision_id BIGINT
      REFERENCES crypto_truth.contract_dependency_revision(contract_dependency_revision_id),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dependency_key, revision_no),
    CHECK (length(btrim(dependency_key)) > 0),
    CHECK (from_crypto_entity_id <> to_crypto_entity_id),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_contract_dependency_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_contract_dependency_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_dependency_from_pit
  ON crypto_truth.contract_dependency_revision
  (from_crypto_entity_id, dependency_kind, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_crypto_dependency_to_pit
  ON crypto_truth.contract_dependency_revision
  (to_crypto_entity_id, dependency_kind, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS crypto_truth.depeg_observation (
    crypto_depeg_observation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_event_revision_id BIGINT NOT NULL
      REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    stablecoin_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    quote_unit       TEXT NOT NULL CHECK (length(btrim(quote_unit)) > 0),
    observed_price  NUMERIC NOT NULL CHECK (observed_price > 0),
    reference_price NUMERIC NOT NULL CHECK (reference_price > 0),
    deviation_bps   NUMERIC NOT NULL,
    calculation_method TEXT NOT NULL CHECK (length(btrim(calculation_method)) > 0),
    evidence_locator JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    observed_at     TIMESTAMPTZ NOT NULL,
    available_at    TIMESTAMPTZ NOT NULL,
    known_at        TIMESTAMPTZ NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (available_at >= observed_at),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_crypto_depeg_stablecoin_pit
  ON crypto_truth.depeg_observation (stablecoin_entity_id, known_at DESC);

CREATE OR REPLACE FUNCTION crypto_truth.reject_truth_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

CREATE OR REPLACE FUNCTION crypto_truth.guard_event_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_kind TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto event is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT entity_kind INTO v_kind
  FROM crypto_identity.entity
  WHERE crypto_entity_id = NEW.blockchain_entity_id;
  IF v_kind NOT IN ('blockchain','l2') THEN
    RAISE EXCEPTION 'crypto event chain anchor must be a blockchain or l2 identity';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION crypto_truth.guard_event_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_event BIGINT;
  v_previous_revision INTEGER;
  v_previous_state TEXT;
  v_previous_rank INTEGER;
  v_new_rank INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto event revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.crypto_event_id, previous.revision_no, previous.lifecycle_state
      INTO v_previous_event, v_previous_revision, v_previous_state
    FROM crypto_truth.event_revision previous
    WHERE previous.crypto_event_revision_id = NEW.supersedes_crypto_event_revision_id
    FOR SHARE;
    IF v_previous_event IS DISTINCT FROM NEW.crypto_event_id
       OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'crypto event supersession must reference the previous revision of the same event';
    END IF;
    v_previous_rank := CASE v_previous_state
      WHEN 'detected' THEN 1 WHEN 'reported' THEN 2 WHEN 'confirmed' THEN 3
      WHEN 'effective' THEN 4 WHEN 'resolved' THEN 5 WHEN 'retracted' THEN 5 END;
    v_new_rank := CASE NEW.lifecycle_state
      WHEN 'detected' THEN 1 WHEN 'reported' THEN 2 WHEN 'confirmed' THEN 3
      WHEN 'effective' THEN 4 WHEN 'resolved' THEN 5 WHEN 'retracted' THEN 5 END;
    IF v_new_rank < v_previous_rank THEN
      RAISE EXCEPTION 'crypto event lifecycle cannot move backward';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION crypto_truth.guard_dependency_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_key TEXT;
  v_previous_revision INTEGER;
  v_previous_from BIGINT;
  v_previous_to BIGINT;
  v_previous_kind TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto dependency revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.dependency_key, previous.revision_no,
           previous.from_crypto_entity_id, previous.to_crypto_entity_id,
           previous.dependency_kind
      INTO v_previous_key, v_previous_revision,
           v_previous_from, v_previous_to, v_previous_kind
    FROM crypto_truth.contract_dependency_revision previous
    WHERE previous.contract_dependency_revision_id = NEW.supersedes_contract_dependency_revision_id
    FOR SHARE;
    IF v_previous_key IS DISTINCT FROM NEW.dependency_key
       OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1
       OR v_previous_from IS DISTINCT FROM NEW.from_crypto_entity_id
       OR v_previous_to IS DISTINCT FROM NEW.to_crypto_entity_id
       OR v_previous_kind IS DISTINCT FROM NEW.dependency_kind THEN
      RAISE EXCEPTION 'crypto dependency supersession must preserve identity and advance one revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION crypto_truth.guard_depeg_observation_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entity_kind TEXT;
  v_event_type TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto depeg observation is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT entity_kind INTO v_entity_kind
  FROM crypto_identity.entity
  WHERE crypto_entity_id = NEW.stablecoin_entity_id;
  IF v_entity_kind <> 'stablecoin' THEN
    RAISE EXCEPTION 'depeg observation requires a stablecoin identity';
  END IF;
  SELECT event.event_type INTO v_event_type
  FROM crypto_truth.event_revision revision
  JOIN crypto_truth.event event ON event.crypto_event_id = revision.crypto_event_id
  WHERE revision.crypto_event_revision_id = NEW.crypto_event_revision_id;
  IF v_event_type NOT IN ('depeg','peg_recovery') THEN
    RAISE EXCEPTION 'depeg observation requires a depeg or peg recovery event';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS event_append_only ON crypto_truth.event;
CREATE TRIGGER event_append_only BEFORE INSERT OR UPDATE OR DELETE ON crypto_truth.event
FOR EACH ROW EXECUTE FUNCTION crypto_truth.guard_event_write();

DROP TRIGGER IF EXISTS event_revision_append_only ON crypto_truth.event_revision;
CREATE TRIGGER event_revision_append_only BEFORE INSERT OR UPDATE OR DELETE ON crypto_truth.event_revision
FOR EACH ROW EXECUTE FUNCTION crypto_truth.guard_event_revision_write();

DROP TRIGGER IF EXISTS event_participant_append_only ON crypto_truth.event_participant;
CREATE TRIGGER event_participant_append_only BEFORE UPDATE OR DELETE ON crypto_truth.event_participant
FOR EACH ROW EXECUTE FUNCTION crypto_truth.reject_truth_mutation();

DROP TRIGGER IF EXISTS event_evidence_append_only ON crypto_truth.event_evidence;
CREATE TRIGGER event_evidence_append_only BEFORE UPDATE OR DELETE ON crypto_truth.event_evidence
FOR EACH ROW EXECUTE FUNCTION crypto_truth.reject_truth_mutation();

DROP TRIGGER IF EXISTS contract_dependency_revision_append_only ON crypto_truth.contract_dependency_revision;
CREATE TRIGGER contract_dependency_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_truth.contract_dependency_revision
FOR EACH ROW EXECUTE FUNCTION crypto_truth.guard_dependency_revision_write();

DROP TRIGGER IF EXISTS depeg_observation_append_only ON crypto_truth.depeg_observation;
CREATE TRIGGER depeg_observation_append_only BEFORE INSERT OR UPDATE OR DELETE ON crypto_truth.depeg_observation
FOR EACH ROW EXECUTE FUNCTION crypto_truth.guard_depeg_observation_write();

GRANT USAGE ON SCHEMA crypto_truth TO si_knowledge, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  crypto_truth.event,
  crypto_truth.event_revision,
  crypto_truth.event_participant,
  crypto_truth.event_evidence,
  crypto_truth.contract_dependency_revision,
  crypto_truth.depeg_observation
TO si_knowledge;
GRANT SELECT ON
  crypto_truth.event,
  crypto_truth.event_revision,
  crypto_truth.event_participant,
  crypto_truth.event_evidence,
  crypto_truth.contract_dependency_revision,
  crypto_truth.depeg_observation
TO si_publisher;
GRANT SELECT ON
  crypto_truth.event,
  crypto_truth.event_revision,
  crypto_truth.event_participant,
  crypto_truth.event_evidence,
  crypto_truth.contract_dependency_revision,
  crypto_truth.depeg_observation
TO si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crypto_truth TO si_knowledge;
`;
