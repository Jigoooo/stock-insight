export const cryptoCrossDomainGraphMigrationSql = `
-- P6-5 — explicit join layer: crypto ontology stays separate, while company,
-- security, macro, regulation, geo, and event links become first-class evidence.
CREATE SCHEMA IF NOT EXISTS cross_domain;

CREATE TABLE IF NOT EXISTS cross_domain.crypto_core_relation_revision (
    crypto_core_relation_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    relation_key       TEXT NOT NULL,
    revision_no        INTEGER NOT NULL CHECK (revision_no > 0),
    crypto_entity_id   BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    core_entity_id     BIGINT NOT NULL REFERENCES core.entity(entity_id),
    relation_kind      TEXT NOT NULL CHECK (relation_kind IN (
      'issued_by_company','treasury_held_by_company','reserve_managed_by_company',
      'operated_by_company','mined_by_company','custodied_by_company',
      'revenue_exposure_company','cost_exposure_company',
      'payment_distribution_company','etf_underlying_exposure'
    )),
    relation_state     TEXT NOT NULL CHECK (relation_state IN (
      'proposed','verified','rejected','superseded'
    )),
    economic_magnitude NUMERIC CHECK (economic_magnitude IS NULL OR economic_magnitude >= 0),
    economic_magnitude_unit TEXT,
    epistemic_confidence NUMERIC
      CHECK (epistemic_confidence IS NULL OR (epistemic_confidence >= 0 AND epistemic_confidence <= 1)),
    reviewer_id        TEXT,
    evidence_locator   JSONB NOT NULL,
    evidence_digest    TEXT NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at       TIMESTAMPTZ NOT NULL,
    known_at           TIMESTAMPTZ NOT NULL,
    valid_from         TIMESTAMPTZ,
    valid_until        TIMESTAMPTZ,
    supersedes_crypto_core_relation_revision_id BIGINT
      REFERENCES cross_domain.crypto_core_relation_revision(crypto_core_relation_revision_id),
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (relation_key, revision_no),
    CHECK (length(btrim(relation_key)) > 0),
    CHECK (
      (economic_magnitude IS NULL AND economic_magnitude_unit IS NULL) OR
      (economic_magnitude IS NOT NULL AND economic_magnitude_unit IS NOT NULL AND
       length(btrim(economic_magnitude_unit)) > 0)
    ),
    CHECK (relation_state <> 'verified' OR
      (reviewer_id IS NOT NULL AND epistemic_confidence IS NOT NULL)),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (NOT (metadata ? 'confidence_weighted_magnitude')),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_core_relation_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_core_relation_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_cross_crypto_core_crypto_pit
  ON cross_domain.crypto_core_relation_revision
  (crypto_entity_id, relation_kind, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_cross_crypto_core_core_pit
  ON cross_domain.crypto_core_relation_revision
  (core_entity_id, relation_kind, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS cross_domain.crypto_core_metric_revision (
    crypto_core_metric_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    metric_key         TEXT NOT NULL,
    revision_no        INTEGER NOT NULL CHECK (revision_no > 0),
    crypto_core_relation_revision_id BIGINT NOT NULL
      REFERENCES cross_domain.crypto_core_relation_revision(crypto_core_relation_revision_id),
    metric_kind        TEXT NOT NULL CHECK (metric_kind IN (
      'treasury_quantity','treasury_cost_basis','fair_value','revenue_share',
      'mining_hashrate','reserve_amount','custody_assets','ownership_share',
      'etf_net_asset_exposure'
    )),
    metric_value       NUMERIC NOT NULL,
    metric_unit        TEXT NOT NULL CHECK (length(btrim(metric_unit)) > 0),
    as_of              TIMESTAMPTZ NOT NULL,
    calculation_method TEXT NOT NULL CHECK (length(btrim(calculation_method)) > 0),
    evidence_locator   JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at       TIMESTAMPTZ NOT NULL,
    known_at           TIMESTAMPTZ NOT NULL,
    supersedes_crypto_core_metric_revision_id BIGINT
      REFERENCES cross_domain.crypto_core_metric_revision(crypto_core_metric_revision_id),
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (metric_key, revision_no),
    CHECK (length(btrim(metric_key)) > 0),
    CHECK (available_at >= as_of),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_core_metric_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_core_metric_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_cross_crypto_core_metric_pit
  ON cross_domain.crypto_core_metric_revision
  (crypto_core_relation_revision_id, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS cross_domain.crypto_geo_relation_revision (
    crypto_geo_relation_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    relation_key       TEXT NOT NULL,
    revision_no        INTEGER NOT NULL CHECK (revision_no > 0),
    crypto_entity_id   BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    geo_entity_id      BIGINT NOT NULL REFERENCES geo.entity(geo_entity_id),
    geo_relation_kind  TEXT NOT NULL CHECK (geo_relation_kind IN (
      'issuer_jurisdiction','reserve_custody_location','validator_location',
      'mining_operation','exchange_registration','data_center',
      'protocol_foundation','legal_domicile'
    )),
    relation_state     TEXT NOT NULL CHECK (relation_state IN (
      'proposed','verified','rejected','superseded'
    )),
    epistemic_confidence NUMERIC
      CHECK (epistemic_confidence IS NULL OR (epistemic_confidence >= 0 AND epistemic_confidence <= 1)),
    evidence_locator   JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at       TIMESTAMPTZ NOT NULL,
    known_at           TIMESTAMPTZ NOT NULL,
    valid_from         TIMESTAMPTZ,
    valid_until        TIMESTAMPTZ,
    supersedes_crypto_geo_relation_revision_id BIGINT
      REFERENCES cross_domain.crypto_geo_relation_revision(crypto_geo_relation_revision_id),
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (relation_key, revision_no),
    CHECK (length(btrim(relation_key)) > 0),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_geo_relation_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_geo_relation_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_cross_crypto_geo_pit
  ON cross_domain.crypto_geo_relation_revision
  (crypto_entity_id, geo_relation_kind, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS cross_domain.crypto_macro_relation_revision (
    crypto_macro_relation_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    relation_key       TEXT NOT NULL,
    revision_no        INTEGER NOT NULL CHECK (revision_no > 0),
    crypto_entity_id   BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    macro_core_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    macro_relation_kind TEXT NOT NULL CHECK (macro_relation_kind IN (
      'governed_by_regulation','sensitive_to_metric','exposed_to_risk_factor',
      'reserve_asset','settles_in_currency','priced_against_commodity'
    )),
    relation_state     TEXT NOT NULL CHECK (relation_state IN (
      'proposed','verified','rejected','superseded'
    )),
    epistemic_confidence NUMERIC
      CHECK (epistemic_confidence IS NULL OR (epistemic_confidence >= 0 AND epistemic_confidence <= 1)),
    evidence_locator   JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at       TIMESTAMPTZ NOT NULL,
    known_at           TIMESTAMPTZ NOT NULL,
    valid_from         TIMESTAMPTZ,
    valid_until        TIMESTAMPTZ,
    supersedes_crypto_macro_relation_revision_id BIGINT
      REFERENCES cross_domain.crypto_macro_relation_revision(crypto_macro_relation_revision_id),
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (relation_key, revision_no),
    CHECK (length(btrim(relation_key)) > 0),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_macro_relation_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_macro_relation_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_cross_crypto_macro_pit
  ON cross_domain.crypto_macro_relation_revision
  (crypto_entity_id, macro_relation_kind, known_at, revision_no DESC);

CREATE TABLE IF NOT EXISTS cross_domain.crypto_world_event_link_revision (
    crypto_world_event_link_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    link_key           TEXT NOT NULL,
    revision_no        INTEGER NOT NULL CHECK (revision_no > 0),
    crypto_event_revision_id BIGINT NOT NULL
      REFERENCES crypto_truth.event_revision(crypto_event_revision_id),
    world_event_revision_id BIGINT NOT NULL REFERENCES world.event_revision(event_revision_id),
    link_kind          TEXT NOT NULL CHECK (link_kind IN (
      'same_event','caused_by','contributes_to','affected_by','regulatory_action'
    )),
    link_state         TEXT NOT NULL CHECK (link_state IN (
      'proposed','verified','rejected','superseded'
    )),
    epistemic_confidence NUMERIC
      CHECK (epistemic_confidence IS NULL OR (epistemic_confidence >= 0 AND epistemic_confidence <= 1)),
    evidence_locator   JSONB NOT NULL,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at       TIMESTAMPTZ NOT NULL,
    known_at           TIMESTAMPTZ NOT NULL,
    supersedes_crypto_world_event_link_revision_id BIGINT
      REFERENCES cross_domain.crypto_world_event_link_revision(crypto_world_event_link_revision_id),
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (link_key, revision_no),
    CHECK (length(btrim(link_key)) > 0),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_world_event_link_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_world_event_link_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_cross_crypto_world_event
  ON cross_domain.crypto_world_event_link_revision
  (crypto_event_revision_id, known_at, revision_no DESC);

CREATE OR REPLACE FUNCTION cross_domain.guard_cross_domain_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_new JSONB := to_jsonb(NEW);
  v_previous JSONB;
  v_key_field TEXT;
  v_id_field TEXT;
  v_supersedes_field TEXT;
  v_identity_fields TEXT[];
  v_identity_field TEXT;
  v_core_type TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;

  IF TG_TABLE_NAME = 'crypto_core_relation_revision' THEN
    SELECT entity_type INTO v_core_type FROM core.entity
    WHERE entity_id = NEW.core_entity_id;
    IF v_core_type NOT IN ('Company','Stock','ETF','Fund','LegalEntity') THEN
      RAISE EXCEPTION 'crypto-core relation target type is not allowed';
    END IF;
    v_key_field := 'relation_key';
    v_id_field := 'crypto_core_relation_revision_id';
    v_supersedes_field := 'supersedes_crypto_core_relation_revision_id';
    v_identity_fields := ARRAY['crypto_entity_id', 'core_entity_id', 'relation_kind'];
  ELSIF TG_TABLE_NAME = 'crypto_core_metric_revision' THEN
    v_key_field := 'metric_key';
    v_id_field := 'crypto_core_metric_revision_id';
    v_supersedes_field := 'supersedes_crypto_core_metric_revision_id';
    v_identity_fields := ARRAY['crypto_core_relation_revision_id', 'metric_kind'];
  ELSIF TG_TABLE_NAME = 'crypto_geo_relation_revision' THEN
    v_key_field := 'relation_key';
    v_id_field := 'crypto_geo_relation_revision_id';
    v_supersedes_field := 'supersedes_crypto_geo_relation_revision_id';
    v_identity_fields := ARRAY['crypto_entity_id', 'geo_entity_id', 'geo_relation_kind'];
  ELSIF TG_TABLE_NAME = 'crypto_macro_relation_revision' THEN
    SELECT entity_type INTO v_core_type FROM core.entity
    WHERE entity_id = NEW.macro_core_entity_id;
    IF v_core_type NOT IN ('Metric','Regulation','RiskFactor','Country','Commodity') THEN
      RAISE EXCEPTION 'crypto-macro relation target type is not allowed';
    END IF;
    v_key_field := 'relation_key';
    v_id_field := 'crypto_macro_relation_revision_id';
    v_supersedes_field := 'supersedes_crypto_macro_relation_revision_id';
    v_identity_fields := ARRAY[
      'crypto_entity_id', 'macro_core_entity_id', 'macro_relation_kind'
    ];
  ELSE
    v_key_field := 'link_key';
    v_id_field := 'crypto_world_event_link_revision_id';
    v_supersedes_field := 'supersedes_crypto_world_event_link_revision_id';
    v_identity_fields := ARRAY[
      'crypto_event_revision_id', 'world_event_revision_id', 'link_kind'
    ];
  END IF;

  IF NEW.revision_no > 1 THEN
    EXECUTE format(
      'SELECT to_jsonb(previous) FROM %I.%I previous WHERE %I = $1',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, v_id_field
    ) INTO v_previous USING (v_new ->> v_supersedes_field)::BIGINT;
    IF v_previous IS NULL
       OR (v_previous ->> v_key_field) IS DISTINCT FROM (v_new ->> v_key_field)
       OR (v_previous ->> 'revision_no')::INTEGER IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'cross-domain supersession must preserve key and advance one revision';
    END IF;
    FOREACH v_identity_field IN ARRAY v_identity_fields LOOP
      IF (v_previous ->> v_identity_field) IS DISTINCT FROM (v_new ->> v_identity_field) THEN
        RAISE EXCEPTION 'cross-domain supersession must preserve canonical targets';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crypto_core_relation_revision_append_only
  ON cross_domain.crypto_core_relation_revision;
CREATE TRIGGER crypto_core_relation_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON cross_domain.crypto_core_relation_revision
FOR EACH ROW EXECUTE FUNCTION cross_domain.guard_cross_domain_revision_write();

DROP TRIGGER IF EXISTS crypto_core_metric_revision_append_only
  ON cross_domain.crypto_core_metric_revision;
CREATE TRIGGER crypto_core_metric_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON cross_domain.crypto_core_metric_revision
FOR EACH ROW EXECUTE FUNCTION cross_domain.guard_cross_domain_revision_write();

DROP TRIGGER IF EXISTS crypto_geo_relation_revision_append_only
  ON cross_domain.crypto_geo_relation_revision;
CREATE TRIGGER crypto_geo_relation_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON cross_domain.crypto_geo_relation_revision
FOR EACH ROW EXECUTE FUNCTION cross_domain.guard_cross_domain_revision_write();

DROP TRIGGER IF EXISTS crypto_macro_relation_revision_append_only
  ON cross_domain.crypto_macro_relation_revision;
CREATE TRIGGER crypto_macro_relation_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON cross_domain.crypto_macro_relation_revision
FOR EACH ROW EXECUTE FUNCTION cross_domain.guard_cross_domain_revision_write();

DROP TRIGGER IF EXISTS crypto_world_event_link_revision_append_only
  ON cross_domain.crypto_world_event_link_revision;
CREATE TRIGGER crypto_world_event_link_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON cross_domain.crypto_world_event_link_revision
FOR EACH ROW EXECUTE FUNCTION cross_domain.guard_cross_domain_revision_write();

GRANT USAGE ON SCHEMA cross_domain TO si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  cross_domain.crypto_core_relation_revision,
  cross_domain.crypto_core_metric_revision,
  cross_domain.crypto_geo_relation_revision,
  cross_domain.crypto_macro_relation_revision,
  cross_domain.crypto_world_event_link_revision
TO si_analytics;
GRANT SELECT ON
  cross_domain.crypto_core_relation_revision,
  cross_domain.crypto_core_metric_revision,
  cross_domain.crypto_geo_relation_revision,
  cross_domain.crypto_macro_relation_revision,
  cross_domain.crypto_world_event_link_revision
TO si_publisher;
GRANT SELECT ON
  cross_domain.crypto_core_relation_revision,
  cross_domain.crypto_core_metric_revision,
  cross_domain.crypto_geo_relation_revision,
  cross_domain.crypto_macro_relation_revision,
  cross_domain.crypto_world_event_link_revision
TO si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cross_domain TO si_analytics;
`;
