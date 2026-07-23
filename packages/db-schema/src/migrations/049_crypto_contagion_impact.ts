export const cryptoContagionImpactMigrationSql = `
-- P6-4 — crypto impact and contagion, mirroring the stock impact chain while
-- keeping crypto channels and identities in their own ontology.

CREATE TABLE IF NOT EXISTS crypto_analytics.risk_shock (
    risk_shock_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shock_key     TEXT NOT NULL UNIQUE,
    crypto_event_revision_id BIGINT NOT NULL
      REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    shock_type    TEXT NOT NULL CHECK (shock_type IN (
      'bridge_failure','oracle_failure','custody_loss','exchange_insolvency',
      'stablecoin_depeg','liquidation_cascade','smart_contract_exploit',
      'validator_failure','liquidity_withdrawal','regulatory_restriction'
    )),
    economic_magnitude NUMERIC,
    economic_magnitude_unit TEXT,
    epistemic_confidence NUMERIC
      CHECK (epistemic_confidence IS NULL OR (epistemic_confidence >= 0 AND epistemic_confidence <= 1)),
    evidence_locator JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at   TIMESTAMPTZ NOT NULL,
    known_at       TIMESTAMPTZ NOT NULL,
    metadata       JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(shock_key)) > 0),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (NOT (metadata ? 'confidence_weighted_magnitude'))
);
CREATE INDEX IF NOT EXISTS ix_crypto_risk_shock_event
  ON crypto_analytics.risk_shock (crypto_event_revision_id, known_at DESC);

CREATE TABLE IF NOT EXISTS crypto_analytics.transmission_channel (
    transmission_channel_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    channel_class TEXT NOT NULL UNIQUE CHECK (channel_class IN (
      'contract_dependency','reserve_backing','bridge_route','oracle_feed',
      'custody_chain','exchange_venue','liquidity_pool','collateral_chain',
      'treasury_exposure','revenue_exposure'
    )),
    description   TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object')
);
INSERT INTO crypto_analytics.transmission_channel (channel_class, description)
VALUES
  ('contract_dependency','Smart contract call and control dependency'),
  ('reserve_backing','Reserve asset backing path'),
  ('bridge_route','Cross-chain bridge route'),
  ('oracle_feed','Price or state oracle feed'),
  ('custody_chain','Custodian and sub-custodian path'),
  ('exchange_venue','Centralized or decentralized venue path'),
  ('liquidity_pool','Shared liquidity pool path'),
  ('collateral_chain','Collateral and borrow path'),
  ('treasury_exposure','Corporate treasury holding path'),
  ('revenue_exposure','Corporate revenue sensitivity path')
ON CONFLICT (channel_class) DO NOTHING;

CREATE TABLE IF NOT EXISTS crypto_analytics.risk_exposure_revision (
    risk_exposure_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exposure_key   TEXT NOT NULL,
    revision_no    INTEGER NOT NULL CHECK (revision_no > 0),
    risk_shock_id  BIGINT NOT NULL REFERENCES crypto_analytics.risk_shock(risk_shock_id),
    transmission_channel_id BIGINT NOT NULL
      REFERENCES crypto_analytics.transmission_channel(transmission_channel_id),
    crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    sign           TEXT NOT NULL CHECK (sign IN ('positive','negative','ambiguous')),
    sensitivity    NUMERIC,
    horizon        TEXT CHECK (horizon IS NULL OR horizon IN ('immediate','short','medium','long')),
    lag_seconds    BIGINT CHECK (lag_seconds IS NULL OR lag_seconds >= 0),
    threshold_value NUMERIC,
    threshold_unit TEXT,
    economic_magnitude NUMERIC,
    economic_magnitude_unit TEXT,
    epistemic_confidence NUMERIC
      CHECK (epistemic_confidence IS NULL OR (epistemic_confidence >= 0 AND epistemic_confidence <= 1)),
    exposure_state TEXT NOT NULL DEFAULT 'building'
      CHECK (exposure_state IN ('building','sealed','superseded','retracted')),
    evidence_locator JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at   TIMESTAMPTZ NOT NULL,
    known_at       TIMESTAMPTZ NOT NULL,
    sealed_at      TIMESTAMPTZ,
    supersedes_risk_exposure_revision_id BIGINT
      REFERENCES crypto_analytics.risk_exposure_revision(risk_exposure_revision_id),
    metadata       JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (exposure_key, revision_no),
    CHECK (length(btrim(exposure_key)) > 0),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (NOT (metadata ? 'confidence_weighted_magnitude')),
    CHECK (
      (revision_no = 1 AND supersedes_risk_exposure_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_risk_exposure_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_risk_exposure_entity_pit
  ON crypto_analytics.risk_exposure_revision
  (crypto_entity_id, transmission_channel_id, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS crypto_analytics.risk_score_component (
    risk_score_component_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    risk_exposure_revision_id BIGINT NOT NULL
      REFERENCES crypto_analytics.risk_exposure_revision(risk_exposure_revision_id),
    component_kind TEXT NOT NULL CHECK (component_kind IN (
      'evidence_confidence','relation_strength','materiality','transmission',
      'direction','lag','market_reflection','model_uncertainty'
    )),
    component_value NUMERIC NOT NULL,
    rationale      TEXT,
    metadata       JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (risk_exposure_revision_id, component_kind)
);

CREATE TABLE IF NOT EXISTS crypto_analytics.contagion_edge_revision (
    contagion_edge_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contagion_edge_key TEXT NOT NULL,
    revision_no       INTEGER NOT NULL CHECK (revision_no > 0),
    from_crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    to_crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    transmission_channel_id BIGINT NOT NULL
      REFERENCES crypto_analytics.transmission_channel(transmission_channel_id),
    contract_dependency_revision_id BIGINT
      REFERENCES crypto_truth.contract_dependency_revision(contract_dependency_revision_id),
    propagation_weight NUMERIC NOT NULL CHECK (propagation_weight > 0 AND propagation_weight <= 1),
    lag_seconds       BIGINT CHECK (lag_seconds IS NULL OR lag_seconds >= 0),
    activation_threshold NUMERIC,
    threshold_unit    TEXT,
    evidence_locator JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    valid_from       TIMESTAMPTZ,
    valid_until      TIMESTAMPTZ,
    supersedes_contagion_edge_revision_id BIGINT
      REFERENCES crypto_analytics.contagion_edge_revision(contagion_edge_revision_id),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (contagion_edge_key, revision_no),
    CHECK (length(btrim(contagion_edge_key)) > 0),
    CHECK (from_crypto_entity_id <> to_crypto_entity_id),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_contagion_edge_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_contagion_edge_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_contagion_from_pit
  ON crypto_analytics.contagion_edge_revision
  (from_crypto_entity_id, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_crypto_contagion_to_pit
  ON crypto_analytics.contagion_edge_revision
  (to_crypto_entity_id, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS crypto_analytics.liquidation_observation (
    liquidation_observation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_event_revision_id BIGINT NOT NULL
      REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    venue_entity_id BIGINT REFERENCES crypto_identity.entity(crypto_entity_id),
    collateral_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    liability_entity_id BIGINT REFERENCES crypto_identity.entity(crypto_entity_id),
    liquidation_amount NUMERIC NOT NULL CHECK (liquidation_amount > 0),
    amount_unit     TEXT NOT NULL CHECK (length(btrim(amount_unit)) > 0),
    evidence_locator JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    observed_at    TIMESTAMPTZ NOT NULL,
    available_at   TIMESTAMPTZ NOT NULL,
    known_at       TIMESTAMPTZ NOT NULL,
    metadata       JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (available_at >= observed_at),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_crypto_liquidation_collateral_pit
  ON crypto_analytics.liquidation_observation (collateral_entity_id, known_at DESC);

CREATE OR REPLACE FUNCTION crypto_analytics.reject_contagion_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

CREATE OR REPLACE FUNCTION crypto_analytics.guard_risk_exposure_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_key TEXT;
  v_previous_revision INTEGER;
  v_previous_entity BIGINT;
  v_component_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'crypto risk exposure is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.exposure_state <> 'building' THEN
      RAISE EXCEPTION 'crypto risk exposure must start in building state';
    END IF;
    IF NEW.revision_no > 1 THEN
      SELECT exposure_key, revision_no, crypto_entity_id
        INTO v_previous_key, v_previous_revision, v_previous_entity
      FROM crypto_analytics.risk_exposure_revision
      WHERE risk_exposure_revision_id = NEW.supersedes_risk_exposure_revision_id;
      IF v_previous_key IS DISTINCT FROM NEW.exposure_key
         OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1
         OR v_previous_entity IS DISTINCT FROM NEW.crypto_entity_id THEN
        RAISE EXCEPTION 'crypto risk exposure supersession must preserve key and entity';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(
    NEW.risk_exposure_revision_id, NEW.exposure_key, NEW.revision_no,
    NEW.risk_shock_id, NEW.transmission_channel_id, NEW.crypto_entity_id,
    NEW.economic_magnitude, NEW.epistemic_confidence, NEW.available_at, NEW.known_at
  ) IS DISTINCT FROM ROW(
    OLD.risk_exposure_revision_id, OLD.exposure_key, OLD.revision_no,
    OLD.risk_shock_id, OLD.transmission_channel_id, OLD.crypto_entity_id,
    OLD.economic_magnitude, OLD.epistemic_confidence, OLD.available_at, OLD.known_at
  ) THEN
    RAISE EXCEPTION 'crypto risk exposure immutable fields cannot change';
  END IF;
  IF OLD.exposure_state = 'building' AND NEW.exposure_state = 'sealed' THEN
    SELECT count(DISTINCT component_kind) INTO v_component_count
    FROM crypto_analytics.risk_score_component
    WHERE risk_exposure_revision_id = OLD.risk_exposure_revision_id;
    IF v_component_count <> 8 THEN
      RAISE EXCEPTION 'crypto risk exposure requires the full eight-component decomposition before sealing';
    END IF;
    IF NEW.sealed_at IS NULL THEN
      RAISE EXCEPTION 'sealed crypto risk exposure requires sealed_at';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.exposure_state = 'building' AND NEW.exposure_state IN ('superseded','retracted') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid crypto risk exposure state transition';
END $$;

CREATE OR REPLACE FUNCTION crypto_analytics.guard_contagion_edge_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_key TEXT;
  v_previous_revision INTEGER;
  v_previous_from BIGINT;
  v_previous_to BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto contagion edge is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT contagion_edge_key, revision_no, from_crypto_entity_id, to_crypto_entity_id
      INTO v_previous_key, v_previous_revision, v_previous_from, v_previous_to
    FROM crypto_analytics.contagion_edge_revision
    WHERE contagion_edge_revision_id = NEW.supersedes_contagion_edge_revision_id;
    IF v_previous_key IS DISTINCT FROM NEW.contagion_edge_key
       OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1
       OR v_previous_from IS DISTINCT FROM NEW.from_crypto_entity_id
       OR v_previous_to IS DISTINCT FROM NEW.to_crypto_entity_id THEN
      RAISE EXCEPTION 'crypto contagion supersession must preserve endpoints and advance one revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS risk_shock_append_only ON crypto_analytics.risk_shock;
CREATE TRIGGER risk_shock_append_only BEFORE UPDATE OR DELETE ON crypto_analytics.risk_shock
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.reject_contagion_mutation();

DROP TRIGGER IF EXISTS transmission_channel_append_only ON crypto_analytics.transmission_channel;
CREATE TRIGGER transmission_channel_append_only BEFORE UPDATE OR DELETE ON crypto_analytics.transmission_channel
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.reject_contagion_mutation();

DROP TRIGGER IF EXISTS risk_exposure_revision_append_only ON crypto_analytics.risk_exposure_revision;
CREATE TRIGGER risk_exposure_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_analytics.risk_exposure_revision
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.guard_risk_exposure_write();

DROP TRIGGER IF EXISTS risk_score_component_append_only ON crypto_analytics.risk_score_component;
CREATE TRIGGER risk_score_component_append_only BEFORE UPDATE OR DELETE ON crypto_analytics.risk_score_component
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.reject_contagion_mutation();

DROP TRIGGER IF EXISTS contagion_edge_revision_append_only ON crypto_analytics.contagion_edge_revision;
CREATE TRIGGER contagion_edge_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON crypto_analytics.contagion_edge_revision
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.guard_contagion_edge_write();

DROP TRIGGER IF EXISTS liquidation_observation_append_only ON crypto_analytics.liquidation_observation;
CREATE TRIGGER liquidation_observation_append_only BEFORE UPDATE OR DELETE ON crypto_analytics.liquidation_observation
FOR EACH ROW EXECUTE FUNCTION crypto_analytics.reject_contagion_mutation();

GRANT SELECT, INSERT ON
  crypto_analytics.risk_shock,
  crypto_analytics.transmission_channel,
  crypto_analytics.risk_exposure_revision,
  crypto_analytics.risk_score_component,
  crypto_analytics.contagion_edge_revision,
  crypto_analytics.liquidation_observation
TO si_analytics;
GRANT SELECT ON
  crypto_analytics.risk_shock,
  crypto_analytics.transmission_channel,
  crypto_analytics.risk_exposure_revision,
  crypto_analytics.risk_score_component,
  crypto_analytics.contagion_edge_revision,
  crypto_analytics.liquidation_observation
TO si_publisher;
GRANT SELECT ON
  crypto_analytics.risk_shock,
  crypto_analytics.transmission_channel,
  crypto_analytics.risk_exposure_revision,
  crypto_analytics.risk_score_component,
  crypto_analytics.contagion_edge_revision,
  crypto_analytics.liquidation_observation
TO si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crypto_analytics TO si_analytics;
`;
