export const coreIngestionFoundationMigrationSql = `
-- SET B / B-2: canonical identity (core) + ingestion registry + ops model/prompt registries.
-- Additive only. Transitional sources (public.entities, ops.source_collection_policy) stay untouched.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ingestion;

-- ── core ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.entity (
    entity_id       BIGSERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL CHECK (entity_type IN (
      'Company','LegalEntity','Stock','ETF','Token','Protocol','Blockchain','Exchange',
      'Product','Technology','Industry','Theme','Country','Person','Fund','Wallet',
      'Commodity','Metric','Regulation','RiskFactor')),
    canonical_name  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','provisional','merged','retired')),
    country_code    TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_core_entity_type_status ON core.entity (entity_type, status);
CREATE INDEX IF NOT EXISTS idx_core_entity_name_tsv
  ON core.entity USING gin (to_tsvector('simple', canonical_name));

CREATE TABLE IF NOT EXISTS core.entity_identifier (
    identifier_id      BIGSERIAL PRIMARY KEY,
    entity_id          BIGINT NOT NULL REFERENCES core.entity(entity_id),
    identifier_type    TEXT NOT NULL CHECK (identifier_type IN (
      'CIK','DART_CORP_CODE','ISIN','MIC','LOCAL_TICKER','LEI','CHAIN_CONTRACT',
      'COINGECKO_ID','FRED_SERIES','ECOS_SERIES','INDUSTRY_CODE','INTERNAL_KEY')),
    identifier_value   TEXT NOT NULL,
    namespace          TEXT NOT NULL DEFAULT '',
    valid_from         TIMESTAMPTZ,
    valid_to           TIMESTAMPTZ,
    UNIQUE (identifier_type, identifier_value, namespace)
);
CREATE INDEX IF NOT EXISTS idx_core_identifier_entity ON core.entity_identifier (entity_id);

CREATE TABLE IF NOT EXISTS core.entity_alias (
    alias_id           BIGSERIAL PRIMARY KEY,
    entity_id          BIGINT NOT NULL REFERENCES core.entity(entity_id),
    alias_text         TEXT NOT NULL,
    language_code      TEXT NOT NULL DEFAULT '',
    alias_type         TEXT,
    source_id          BIGINT,
    UNIQUE (entity_id, alias_text, language_code)
);
CREATE INDEX IF NOT EXISTS idx_core_alias_text ON core.entity_alias (alias_text);

CREATE TABLE IF NOT EXISTS core.listing (
    listing_id          BIGSERIAL PRIMARY KEY,
    security_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    exchange_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    local_ticker        TEXT NOT NULL,
    currency            TEXT NOT NULL,
    listing_status      TEXT NOT NULL DEFAULT 'listed'
                        CHECK (listing_status IN ('listed','suspended','delisted')),
    valid_from          TIMESTAMPTZ NOT NULL,
    valid_to            TIMESTAMPTZ,
    metadata            JSONB NOT NULL DEFAULT '{}',
    UNIQUE (exchange_entity_id, local_ticker, valid_from)
);
CREATE INDEX IF NOT EXISTS idx_core_listing_security ON core.listing (security_entity_id);

-- ── ingestion ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingestion.source (
    source_id       BIGSERIAL PRIMARY KEY,
    provider_key    TEXT NOT NULL UNIQUE,
    source_type     TEXT NOT NULL CHECK (source_type IN ('api','feed','file','crawler','internal')),
    tier            SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 4),
    license_status  TEXT NOT NULL,
    redistribution  TEXT NOT NULL,
    enforcement     TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion.source_contract (
    contract_id     BIGSERIAL PRIMARY KEY,
    source_id       BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    version         INTEGER NOT NULL,
    schedule_policy JSONB NOT NULL,
    required_fields JSONB NOT NULL,
    quality_policy  JSONB NOT NULL,
    revision_policy JSONB NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, version)
);

CREATE TABLE IF NOT EXISTS ingestion.fetch_run (
    fetch_run_id    BIGSERIAL PRIMARY KEY,
    source_id       BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    run_id          TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    status          TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
    records_read    INTEGER,
    records_written INTEGER,
    records_skipped INTEGER,
    error_summary   JSONB,
    watermark_at    TIMESTAMPTZ,
    summary         JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ingestion_fetch_run_source
  ON ingestion.fetch_run (source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ingestion.raw_object (
    raw_object_id   BIGSERIAL PRIMARY KEY,
    fetch_run_id    BIGINT NOT NULL REFERENCES ingestion.fetch_run(fetch_run_id),
    source_id       BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    source_document_id TEXT,
    content_hash    TEXT NOT NULL,
    object_uri      TEXT NOT NULL,
    http_meta       JSONB,
    fetched_at      TIMESTAMPTZ NOT NULL,
    UNIQUE (source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS ingestion.source_watermark (
    source_id     BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    dataset_name  TEXT NOT NULL,
    watermark_at  TIMESTAMPTZ NOT NULL,
    gap_ranges    JSONB NOT NULL DEFAULT '[]',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_id, dataset_name)
);

-- ── ops registries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.model_registry (
    model_id      TEXT PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('extraction','translation','generation','embedding','nli','ranking')),
    dimension     INTEGER,
    config        JSONB NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','candidate','retired')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.prompt_registry (
    prompt_id     TEXT NOT NULL,
    version       INTEGER NOT NULL,
    role          TEXT NOT NULL,
    template_hash TEXT NOT NULL,
    template_uri  TEXT NOT NULL,
    eval_result   JSONB,
    status        TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','active','retired')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (prompt_id, version)
);

-- ── worker roles (NOLOGIN until adopted; LOGIN+password granted per worker rollout) ──
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['si_collector','si_knowledge','si_analytics','si_publisher','si_personal','si_readapi']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;

  -- collector: ingestion RW
  GRANT USAGE ON SCHEMA ingestion TO si_collector;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ingestion TO si_collector;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA ingestion TO si_collector;
  -- knowledge worker: core RW + ingestion R
  GRANT USAGE ON SCHEMA core, ingestion TO si_knowledge;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA core TO si_knowledge;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA core TO si_knowledge;
  GRANT SELECT ON ALL TABLES IN SCHEMA ingestion TO si_knowledge;
  -- analytics/publisher/personal/readapi: core+ingestion read (schema별 RW는 해당 스키마 생성 migration에서 부여)
  GRANT USAGE ON SCHEMA core, ingestion TO si_analytics, si_publisher, si_personal, si_readapi;
  GRANT SELECT ON ALL TABLES IN SCHEMA core TO si_analytics, si_publisher, si_personal, si_readapi;
  GRANT SELECT ON ALL TABLES IN SCHEMA ingestion TO si_analytics, si_publisher;

  -- app roles (live web/api): read-only on core/ingestion
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA core, ingestion TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA core TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA ingestion TO stock_insight_app_reader;
  END IF;
END $$;
`;
