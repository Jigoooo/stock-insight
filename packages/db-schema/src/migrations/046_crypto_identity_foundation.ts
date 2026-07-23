export const cryptoIdentityFoundationMigrationSql = `
-- P6-1 — crypto identity foundation. Separate ontology module over shared
-- source provenance and optional reviewed crosswalks to core.entity.
CREATE SCHEMA IF NOT EXISTS crypto_identity;

CREATE TABLE IF NOT EXISTS crypto_identity.entity (
    crypto_entity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_key       TEXT NOT NULL UNIQUE,
    entity_kind      TEXT NOT NULL CHECK (entity_kind IN (
      'blockchain','l2','protocol','smart_contract','token','stablecoin',
      'bridge','oracle','validator','exchange','custodian','wallet_cluster'
    )),
    chain_id         TEXT,
    account_address  TEXT,
    asset_id         TEXT,
    canonical_slug   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (entity_key LIKE 'crypto:' || entity_kind || ':%'),
    CHECK (
      (entity_kind IN ('blockchain','l2')
        AND chain_id IS NOT NULL AND account_address IS NULL
        AND asset_id IS NULL AND canonical_slug IS NULL) OR
      (entity_kind IN ('token','stablecoin')
        AND chain_id IS NOT NULL AND canonical_slug IS NULL
        AND ((account_address IS NOT NULL AND asset_id IS NULL) OR
             (account_address IS NULL AND asset_id IS NOT NULL))) OR
      (entity_kind IN ('smart_contract','bridge','oracle','validator','wallet_cluster')
        AND chain_id IS NOT NULL AND account_address IS NOT NULL
        AND asset_id IS NULL AND canonical_slug IS NULL) OR
      (entity_kind IN ('protocol','exchange','custodian')
        AND chain_id IS NULL AND account_address IS NULL
        AND asset_id IS NULL AND canonical_slug IS NOT NULL)
    ),
    CHECK (chain_id IS NULL OR chain_id ~ '^[a-z0-9-]{3,32}:[A-Za-z0-9-]{1,32}$'),
    CHECK (account_address IS NULL OR length(account_address) BETWEEN 3 AND 128),
    -- CAIP-19 includes native slip44 assets and contract-backed erc20 assets.
    CHECK (asset_id IS NULL OR asset_id ~
      '^[a-z0-9-]{3,32}:[A-Za-z0-9-]{1,32}/[a-z0-9-]{3,32}:[A-Za-z0-9._~%+-]{1,128}$'),
    CHECK (canonical_slug IS NULL OR canonical_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE INDEX IF NOT EXISTS ix_crypto_entity_kind
  ON crypto_identity.entity (entity_kind, crypto_entity_id);

CREATE TABLE IF NOT EXISTS crypto_identity.entity_revision (
    crypto_entity_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    revision_no      INTEGER NOT NULL CHECK (revision_no > 0),
    display_name     TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
    symbol           TEXT,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    identity_digest  TEXT NOT NULL CHECK (identity_digest ~ '^[a-f0-9]{64}$'),
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    valid_from       TIMESTAMPTZ,
    valid_until      TIMESTAMPTZ,
    supersedes_crypto_entity_revision_id BIGINT
      REFERENCES crypto_identity.entity_revision(crypto_entity_revision_id),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (crypto_entity_id, revision_no),
    CHECK (symbol IS NULL OR length(btrim(symbol)) > 0),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_entity_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_entity_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_entity_revision_pit
  ON crypto_identity.entity_revision (crypto_entity_id, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_crypto_entity_revision_source
  ON crypto_identity.entity_revision (source_revision_id);

CREATE TABLE IF NOT EXISTS crypto_identity.entity_alias (
    crypto_entity_alias_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    alias_kind       TEXT NOT NULL CHECK (alias_kind IN ('name','symbol','address_label','legacy_key')),
    alias_value      TEXT NOT NULL CHECK (length(btrim(alias_value)) > 0),
    language_code    TEXT,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    valid_from       TIMESTAMPTZ,
    valid_until      TIMESTAMPTZ,
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (crypto_entity_id, alias_kind, alias_value, known_at)
);
CREATE INDEX IF NOT EXISTS ix_crypto_entity_alias_lookup
  ON crypto_identity.entity_alias (alias_kind, alias_value, known_at DESC);

CREATE TABLE IF NOT EXISTS crypto_identity.identity_evidence (
    crypto_identity_evidence_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    evidence_kind    TEXT NOT NULL CHECK (evidence_kind IN (
      'identifier_match','contract_metadata','official_registry','source_assertion','manual_review'
    )),
    evidence_locator JSONB NOT NULL,
    confidence       NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_crypto_identity_evidence_entity
  ON crypto_identity.identity_evidence (crypto_entity_id, known_at DESC);

CREATE TABLE IF NOT EXISTS crypto_identity.core_crosswalk (
    crypto_core_crosswalk_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crosswalk_key    TEXT NOT NULL,
    revision_no      INTEGER NOT NULL CHECK (revision_no > 0),
    crypto_entity_id BIGINT NOT NULL REFERENCES crypto_identity.entity(crypto_entity_id),
    core_entity_id   BIGINT NOT NULL REFERENCES core.entity(entity_id),
    relation_kind    TEXT NOT NULL DEFAULT 'same_real_world_identity'
      CHECK (relation_kind = 'same_real_world_identity'),
    mapping_status   TEXT NOT NULL CHECK (mapping_status IN ('proposed','verified','rejected','superseded')),
    confidence       NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    reviewer_id      TEXT,
    source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at     TIMESTAMPTZ NOT NULL,
    known_at         TIMESTAMPTZ NOT NULL,
    supersedes_crypto_core_crosswalk_id BIGINT
      REFERENCES crypto_identity.core_crosswalk(crypto_core_crosswalk_id),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (crosswalk_key, revision_no),
    CHECK (length(btrim(crosswalk_key)) > 0),
    CHECK (known_at >= available_at),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (mapping_status <> 'verified' OR (reviewer_id IS NOT NULL AND confidence IS NOT NULL)),
    CHECK (
      (revision_no = 1 AND supersedes_crypto_core_crosswalk_id IS NULL) OR
      (revision_no > 1 AND supersedes_crypto_core_crosswalk_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_crypto_core_crosswalk_crypto
  ON crypto_identity.core_crosswalk (crypto_entity_id, known_at DESC);
CREATE INDEX IF NOT EXISTS ix_crypto_core_crosswalk_core
  ON crypto_identity.core_crosswalk (core_entity_id, known_at DESC);

CREATE OR REPLACE FUNCTION crypto_identity.reject_identity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

CREATE OR REPLACE FUNCTION crypto_identity.guard_entity_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_entity BIGINT;
  v_previous_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto identity revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.crypto_entity_id, previous.revision_no
      INTO v_previous_entity, v_previous_revision
    FROM crypto_identity.entity_revision previous
    WHERE previous.crypto_entity_revision_id = NEW.supersedes_crypto_entity_revision_id
    FOR SHARE;
    IF v_previous_entity IS DISTINCT FROM NEW.crypto_entity_id
       OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'crypto identity supersession must reference the previous revision of the same entity';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION crypto_identity.guard_core_crosswalk_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_key TEXT;
  v_previous_revision INTEGER;
  v_previous_crypto BIGINT;
  v_previous_core BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'crypto core crosswalk is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.crosswalk_key, previous.revision_no,
           previous.crypto_entity_id, previous.core_entity_id
      INTO v_previous_key, v_previous_revision, v_previous_crypto, v_previous_core
    FROM crypto_identity.core_crosswalk previous
    WHERE previous.crypto_core_crosswalk_id = NEW.supersedes_crypto_core_crosswalk_id
    FOR SHARE;
    IF v_previous_key IS DISTINCT FROM NEW.crosswalk_key
       OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1
       OR v_previous_crypto IS DISTINCT FROM NEW.crypto_entity_id
       OR v_previous_core IS DISTINCT FROM NEW.core_entity_id THEN
      RAISE EXCEPTION 'crypto crosswalk supersession must preserve both identities and advance one revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS entity_append_only ON crypto_identity.entity;
CREATE TRIGGER entity_append_only BEFORE UPDATE OR DELETE ON crypto_identity.entity
FOR EACH ROW EXECUTE FUNCTION crypto_identity.reject_identity_mutation();

DROP TRIGGER IF EXISTS entity_revision_append_only ON crypto_identity.entity_revision;
CREATE TRIGGER entity_revision_append_only BEFORE INSERT OR UPDATE OR DELETE ON crypto_identity.entity_revision
FOR EACH ROW EXECUTE FUNCTION crypto_identity.guard_entity_revision_write();

DROP TRIGGER IF EXISTS entity_alias_append_only ON crypto_identity.entity_alias;
CREATE TRIGGER entity_alias_append_only BEFORE UPDATE OR DELETE ON crypto_identity.entity_alias
FOR EACH ROW EXECUTE FUNCTION crypto_identity.reject_identity_mutation();

DROP TRIGGER IF EXISTS identity_evidence_append_only ON crypto_identity.identity_evidence;
CREATE TRIGGER identity_evidence_append_only BEFORE UPDATE OR DELETE ON crypto_identity.identity_evidence
FOR EACH ROW EXECUTE FUNCTION crypto_identity.reject_identity_mutation();

DROP TRIGGER IF EXISTS core_crosswalk_append_only ON crypto_identity.core_crosswalk;
CREATE TRIGGER core_crosswalk_append_only BEFORE INSERT OR UPDATE OR DELETE ON crypto_identity.core_crosswalk
FOR EACH ROW EXECUTE FUNCTION crypto_identity.guard_core_crosswalk_write();

GRANT USAGE ON SCHEMA crypto_identity TO si_knowledge, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  crypto_identity.entity,
  crypto_identity.entity_revision,
  crypto_identity.entity_alias,
  crypto_identity.identity_evidence,
  crypto_identity.core_crosswalk
TO si_knowledge;
GRANT SELECT ON
  crypto_identity.entity,
  crypto_identity.entity_revision,
  crypto_identity.entity_alias,
  crypto_identity.identity_evidence,
  crypto_identity.core_crosswalk
TO si_publisher;
GRANT SELECT ON
  crypto_identity.entity,
  crypto_identity.entity_revision,
  crypto_identity.entity_alias,
  crypto_identity.identity_evidence,
  crypto_identity.core_crosswalk
TO si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crypto_identity TO si_knowledge;
`;
