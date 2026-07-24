export const cryptoTokenomicsMigrationSql = `
-- P6-3 — token supply, unlock, emission, and governance economics.
CREATE SCHEMA IF NOT EXISTS crypto_analytics;

CREATE TABLE IF NOT EXISTS crypto_analytics.token_supply_revision (
    token_supply_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supply_key       TEXT NOT NULL,
    revision_no      INTEGER NOT NULL CHECK (revision_no > 0),
    token_entity_id  BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    total_supply     NUMERIC NOT NULL CHECK (total_supply >= 0),
    circulating_supply NUMERIC NOT NULL CHECK (circulating_supply >= 0),
    maximum_supply   NUMERIC CHECK (maximum_supply IS NULL OR maximum_supply >= 0),
    amount_unit      TEXT NOT NULL CHECK (length(btrim(amount_unit)) > 0),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    evidence_locator JSONB NOT NULL,
    as_of            TIMESTAMPTZ NOT NULL,
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    supersedes_token_supply_revision_id BIGINT
      REFERENCES crypto_analytics.token_supply_revision(token_supply_revision_id),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (supply_key, revision_no),
    CHECK (length(btrim(supply_key)) > 0),
    CHECK (circulating_supply <= total_supply),
    CHECK (maximum_supply IS NULL OR total_supply <= maximum_supply),
    CHECK (available_at >= as_of),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_token_supply_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_token_supply_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_supply_token_pit
  ON crypto_analytics.token_supply_revision (token_entity_id, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS crypto_analytics.unlock_schedule_revision (
    unlock_schedule_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unlock_key       TEXT NOT NULL,
    revision_no      INTEGER NOT NULL CHECK (revision_no > 0),
    token_entity_id  BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    beneficiary_class TEXT NOT NULL CHECK (beneficiary_class IN (
      'team','investor','foundation','ecosystem','community','treasury','validator','other'
    )),
    unlock_state     TEXT NOT NULL CHECK (unlock_state IN (
      'scheduled','confirmed','executed','cancelled','superseded'
    )),
    unlock_at        TIMESTAMPTZ,
    window_start     TIMESTAMPTZ,
    window_end       TIMESTAMPTZ,
    unlock_amount    NUMERIC CHECK (unlock_amount IS NULL OR unlock_amount > 0),
    percentage_of_total_supply NUMERIC
      CHECK (percentage_of_total_supply IS NULL OR
        (percentage_of_total_supply > 0 AND percentage_of_total_supply <= 1)),
    amount_unit      TEXT,
    calculation_method TEXT NOT NULL CHECK (length(btrim(calculation_method)) > 0),
    crypto_event_revision_id BIGINT REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    evidence_locator JSONB NOT NULL,
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    supersedes_unlock_schedule_revision_id BIGINT
      REFERENCES crypto_analytics.unlock_schedule_revision(unlock_schedule_revision_id),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (unlock_key, revision_no),
    CHECK (length(btrim(unlock_key)) > 0),
    CHECK (window_end IS NULL OR window_start IS NULL OR window_end >= window_start),
    CHECK (unlock_amount IS NOT NULL OR percentage_of_total_supply IS NOT NULL),
    CHECK (unlock_amount IS NULL OR (amount_unit IS NOT NULL AND length(btrim(amount_unit)) > 0)),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_unlock_schedule_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_unlock_schedule_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_unlock_token_pit
  ON crypto_analytics.unlock_schedule_revision (token_entity_id, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_crypto_unlock_time
  ON crypto_analytics.unlock_schedule_revision (unlock_at) WHERE unlock_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS crypto_analytics.emission_schedule_revision (
    emission_schedule_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    emission_key     TEXT NOT NULL,
    revision_no      INTEGER NOT NULL CHECK (revision_no > 0),
    token_entity_id  BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    emission_state   TEXT NOT NULL CHECK (emission_state IN (
      'scheduled','active','paused','completed','cancelled','superseded'
    )),
    emission_amount  NUMERIC NOT NULL CHECK (emission_amount > 0),
    amount_unit      TEXT NOT NULL CHECK (length(btrim(amount_unit)) > 0),
    cadence          TEXT NOT NULL CHECK (cadence IN (
      'per_block','per_epoch','daily','monthly','annual','custom'
    )),
    cadence_detail   JSONB NOT NULL DEFAULT '{}',
    effective_from   TIMESTAMPTZ NOT NULL,
    effective_until  TIMESTAMPTZ,
    rule_text        TEXT,
    crypto_event_revision_id BIGINT REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    evidence_locator JSONB NOT NULL,
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    supersedes_emission_schedule_revision_id BIGINT
      REFERENCES crypto_analytics.emission_schedule_revision(emission_schedule_revision_id),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (emission_key, revision_no),
    CHECK (length(btrim(emission_key)) > 0),
    CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(cadence_detail) = 'object'),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_emission_schedule_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_emission_schedule_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_emission_token_pit
  ON crypto_analytics.emission_schedule_revision (token_entity_id, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS crypto_analytics.governance_proposal (
    governance_proposal_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_key      TEXT NOT NULL UNIQUE,
    protocol_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    blockchain_entity_id BIGINT REFERENCES crypto_identity.entity(crypto_entity_id),
    external_proposal_id TEXT NOT NULL CHECK (length(btrim(external_proposal_id)) > 0),
    first_source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    created_at        TIMESTAMPTZ NOT NULL,
    CHECK (length(btrim(proposal_key)) > 0)
);
CREATE INDEX IF NOT EXISTS ix_crypto_governance_protocol
  ON crypto_analytics.governance_proposal (protocol_entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crypto_analytics.governance_proposal_revision (
    governance_proposal_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    governance_proposal_id BIGINT NOT NULL
      REFERENCES crypto_analytics.governance_proposal(governance_proposal_id),
    revision_no       INTEGER NOT NULL CHECK (revision_no > 0),
    proposal_state    TEXT NOT NULL CHECK (proposal_state IN (
      'draft','active','passed','rejected','executed','cancelled','expired'
    )),
    title             TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    summary_text      TEXT,
    voting_starts_at  TIMESTAMPTZ,
    voting_ends_at    TIMESTAMPTZ,
    quorum_value      NUMERIC CHECK (quorum_value IS NULL OR quorum_value >= 0),
    votes_for         NUMERIC CHECK (votes_for IS NULL OR votes_for >= 0),
    votes_against     NUMERIC CHECK (votes_against IS NULL OR votes_against >= 0),
    votes_abstain     NUMERIC CHECK (votes_abstain IS NULL OR votes_abstain >= 0),
    voting_unit       TEXT,
    result_digest     TEXT CHECK (result_digest IS NULL OR result_digest ~ '^[a-f0-9]{64}$'),
    crypto_event_revision_id BIGINT REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    evidence_locator  JSONB NOT NULL,
    available_at      TIMESTAMPTZ NOT NULL,
    known_at          TIMESTAMPTZ NOT NULL,
    supersedes_governance_proposal_revision_id BIGINT
      REFERENCES crypto_analytics.governance_proposal_revision(governance_proposal_revision_id),
    metadata          JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (governance_proposal_id, revision_no),
    CHECK (voting_ends_at IS NULL OR voting_starts_at IS NULL OR voting_ends_at >= voting_starts_at),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_governance_proposal_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_governance_proposal_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_governance_revision_pit
  ON crypto_analytics.governance_proposal_revision
  (governance_proposal_id, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS crypto_analytics.governance_action (
    governance_action_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    governance_proposal_revision_id BIGINT NOT NULL
      REFERENCES crypto_analytics.governance_proposal_revision(governance_proposal_revision_id),
    action_index      INTEGER NOT NULL CHECK (action_index >= 0),
    action_kind       TEXT NOT NULL CHECK (action_kind IN (
      'parameter_change','treasury_transfer','contract_upgrade','emission_change',
      'fee_change','listing_change','other'
    )),
    target_crypto_entity_id BIGINT REFERENCES crypto_identity.entity(crypto_entity_id),
    amount            NUMERIC,
    amount_unit       TEXT,
    calldata_digest   TEXT CHECK (calldata_digest IS NULL OR calldata_digest ~ '^[a-f0-9]{64}$'),
    effect_summary    TEXT,
    metadata          JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (amount IS NULL OR (amount_unit IS NOT NULL AND length(btrim(amount_unit)) > 0)),
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (governance_proposal_revision_id, action_index)
);

CREATE OR REPLACE FUNCTION crypto_analytics.reject_tokenomics_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

CREATE OR REPLACE FUNCTION crypto_analytics.guard_token_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_kind TEXT;
  v_previous_key TEXT;
  v_previous_revision INTEGER;
  v_previous_token BIGINT;
  v_supersedes BIGINT;
  v_key TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto tokenomics revision is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT entity_kind INTO v_kind
  FROM crypto_identity.entity
  WHERE crypto_entity_id = NEW.token_entity_id;
  IF v_kind NOT IN ('token','stablecoin') THEN
    RAISE EXCEPTION 'tokenomics revision requires token or stablecoin identity';
  END IF;
  IF TG_TABLE_NAME = 'token_supply_revision' THEN
    v_supersedes := NEW.supersedes_token_supply_revision_id; v_key := NEW.supply_key;
  ELSIF TG_TABLE_NAME = 'unlock_schedule_revision' THEN
    v_supersedes := NEW.supersedes_unlock_schedule_revision_id; v_key := NEW.unlock_key;
  ELSE
    v_supersedes := NEW.supersedes_emission_schedule_revision_id; v_key := NEW.emission_key;
  END IF;
  IF NEW.revision_no > 1 THEN
    IF TG_TABLE_NAME = 'token_supply_revision' THEN
      SELECT supply_key, revision_no, token_entity_id
        INTO v_previous_key, v_previous_revision, v_previous_token
      FROM crypto_analytics.token_supply_revision WHERE token_supply_revision_id = v_supersedes;
    ELSIF TG_TABLE_NAME = 'unlock_schedule_revision' THEN
      SELECT unlock_key, revision_no, token_entity_id
        INTO v_previous_key, v_previous_revision, v_previous_token
      FROM crypto_analytics.unlock_schedule_revision WHERE unlock_schedule_revision_id = v_supersedes;
    ELSE
      SELECT emission_key, revision_no, token_entity_id
        INTO v_previous_key, v_previous_revision, v_previous_token
      FROM crypto_analytics.emission_schedule_revision WHERE emission_schedule_revision_id = v_supersedes;
    END IF;
    IF v_previous_key IS DISTINCT FROM v_key
       OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1
       OR v_previous_token IS DISTINCT FROM NEW.token_entity_id THEN
      RAISE EXCEPTION 'tokenomics supersession must preserve key and token and advance one revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION crypto_analytics.guard_governance_proposal_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_protocol_kind TEXT;
  v_chain_kind TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto governance proposal is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT entity_kind INTO v_protocol_kind FROM crypto_identity.entity
  WHERE crypto_entity_id = NEW.protocol_entity_id;
  IF v_protocol_kind NOT IN ('protocol','smart_contract') THEN
    RAISE EXCEPTION 'governance proposal requires protocol or smart contract identity';
  END IF;
  IF NEW.blockchain_entity_id IS NOT NULL THEN
    SELECT entity_kind INTO v_chain_kind FROM crypto_identity.entity
    WHERE crypto_entity_id = NEW.blockchain_entity_id;
    IF v_chain_kind NOT IN ('blockchain','l2') THEN
      RAISE EXCEPTION 'governance chain anchor must be blockchain or l2 identity';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION crypto_analytics.guard_governance_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_proposal BIGINT;
  v_previous_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto governance revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT governance_proposal_id, revision_no
      INTO v_previous_proposal, v_previous_revision
    FROM crypto_analytics.governance_proposal_revision
    WHERE governance_proposal_revision_id = NEW.supersedes_governance_proposal_revision_id;
    IF v_previous_proposal IS DISTINCT FROM NEW.governance_proposal_id
       OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'governance supersession must preserve proposal and advance one revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS token_supply_revision_append_only ON crypto_analytics.token_supply_revision;
CREATE TRIGGER token_supply_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_analytics.token_supply_revision
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.guard_token_revision_write();

DROP TRIGGER IF EXISTS unlock_schedule_revision_append_only ON crypto_analytics.unlock_schedule_revision;
CREATE TRIGGER unlock_schedule_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_analytics.unlock_schedule_revision
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.guard_token_revision_write();

DROP TRIGGER IF EXISTS emission_schedule_revision_append_only ON crypto_analytics.emission_schedule_revision;
CREATE TRIGGER emission_schedule_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_analytics.emission_schedule_revision
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.guard_token_revision_write();

DROP TRIGGER IF EXISTS governance_proposal_append_only ON crypto_analytics.governance_proposal;
CREATE TRIGGER governance_proposal_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_analytics.governance_proposal
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.guard_governance_proposal_write();

DROP TRIGGER IF EXISTS governance_proposal_revision_append_only ON crypto_analytics.governance_proposal_revision;
CREATE TRIGGER governance_proposal_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_analytics.governance_proposal_revision
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.guard_governance_revision_write();

DROP TRIGGER IF EXISTS governance_action_append_only ON crypto_analytics.governance_action;
CREATE TRIGGER governance_action_append_only BEFORE UPDATE OR DELETE ON crypto_analytics.governance_action
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.reject_tokenomics_mutation();

GRANT USAGE ON SCHEMA crypto_analytics TO si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  crypto_analytics.token_supply_revision,
  crypto_analytics.unlock_schedule_revision,
  crypto_analytics.emission_schedule_revision,
  crypto_analytics.governance_proposal,
  crypto_analytics.governance_proposal_revision,
  crypto_analytics.governance_action
TO si_analytics;
GRANT SELECT ON
  crypto_analytics.token_supply_revision,
  crypto_analytics.unlock_schedule_revision,
  crypto_analytics.emission_schedule_revision,
  crypto_analytics.governance_proposal,
  crypto_analytics.governance_proposal_revision,
  crypto_analytics.governance_action
TO si_publisher;
GRANT SELECT ON
  crypto_analytics.token_supply_revision,
  crypto_analytics.unlock_schedule_revision,
  crypto_analytics.emission_schedule_revision,
  crypto_analytics.governance_proposal,
  crypto_analytics.governance_proposal_revision,
  crypto_analytics.governance_action
TO si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crypto_analytics TO si_analytics;
`;
