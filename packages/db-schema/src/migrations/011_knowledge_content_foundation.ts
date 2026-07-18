export const knowledgeContentFoundationMigrationSql = `
-- SET D / D-1: knowledge layer (document/chunk/claim/event + links) and
-- content layer (report definition/run/report/evidence + latest pointer).
-- Additive only. Embedding column is added later once ops.model_registry has
-- an active embedding model (dimension must come from the registry, not code).

CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS content;

-- ── knowledge ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge.document (
    document_id        BIGSERIAL PRIMARY KEY,
    source_id          BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    source_document_id TEXT,
    source_type        TEXT NOT NULL,
    canonical_url      TEXT,
    title              TEXT,
    published_at       TIMESTAMPTZ,
    observed_at        TIMESTAMPTZ NOT NULL,
    available_at       TIMESTAMPTZ NOT NULL,
    language_code      TEXT,
    content_hash       TEXT NOT NULL,
    raw_object_uri     TEXT NOT NULL,
    source_quality     REAL,
    processing_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (processing_status IN ('pending','chunked','extracted','quarantined','skipped')),
    legacy_source_document_pk BIGINT,     -- public.source_documents.id (idempotency anchor)
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, content_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_doc_legacy
  ON knowledge.document (legacy_source_document_pk) WHERE legacy_source_document_pk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_doc_published ON knowledge.document (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_doc_status ON knowledge.document (processing_status);

CREATE TABLE IF NOT EXISTS knowledge.document_chunk (
    chunk_id           BIGSERIAL PRIMARY KEY,
    document_id        BIGINT NOT NULL REFERENCES knowledge.document(document_id),
    chunk_index        INTEGER NOT NULL,
    content            TEXT NOT NULL,
    token_count        INTEGER,
    content_hash       TEXT NOT NULL,
    UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS knowledge.document_entity (
    document_id   BIGINT NOT NULL REFERENCES knowledge.document(document_id),
    entity_id     BIGINT NOT NULL REFERENCES core.entity(entity_id),
    link_method   TEXT NOT NULL CHECK (link_method IN ('symbol_exact','alias_exact','context_scored','legacy_key','manual')),
    confidence    REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    span          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_de_entity ON knowledge.document_entity (entity_id);

CREATE TABLE IF NOT EXISTS knowledge.claim (
    claim_id             BIGSERIAL PRIMARY KEY,
    subject_entity_id    BIGINT REFERENCES core.entity(entity_id),
    predicate            TEXT NOT NULL,
    object_entity_id     BIGINT REFERENCES core.entity(entity_id),
    object_value         JSONB,
    claim_type           TEXT NOT NULL CHECK (claim_type IN
      ('asserted_fact','reported_claim','forecast','opinion','guidance','rumor','derived_claim','model_hypothesis')),
    polarity             SMALLINT NOT NULL DEFAULT 1,
    valid_from           TIMESTAMPTZ,
    valid_to             TIMESTAMPTZ,
    observed_at          TIMESTAMPTZ NOT NULL,
    published_at         TIMESTAMPTZ,
    extraction_confidence REAL,
    verification_status  TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN
      ('unverified','corroborated','verified','contradicted','retracted','untrusted_legacy')),
    extraction_run_id    TEXT NOT NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',
    CHECK (object_entity_id IS NULL OR object_value IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_claim_subject
  ON knowledge.claim (subject_entity_id, predicate, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_claim_status ON knowledge.claim (claim_type, verification_status);

CREATE TABLE IF NOT EXISTS knowledge.claim_evidence (
    claim_id      BIGINT NOT NULL REFERENCES knowledge.claim(claim_id),
    document_id   BIGINT NOT NULL REFERENCES knowledge.document(document_id),
    chunk_id      BIGINT REFERENCES knowledge.document_chunk(chunk_id),
    quote         TEXT,
    PRIMARY KEY (claim_id, document_id)
);

CREATE TABLE IF NOT EXISTS knowledge.event (
    event_id            BIGSERIAL PRIMARY KEY,
    event_type          TEXT NOT NULL,
    actor_entity_id     BIGINT REFERENCES core.entity(entity_id),
    target_entity_id    BIGINT REFERENCES core.entity(entity_id),
    occurred_at         TIMESTAMPTZ,
    expected_end_at     TIMESTAMPTZ,
    announced_at        TIMESTAMPTZ,
    magnitude           NUMERIC,
    magnitude_unit      TEXT,
    surprise_score      REAL,
    verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN
      ('unverified','corroborated','verified','contradicted','retracted','untrusted_legacy')),
    dedupe_key          TEXT NOT NULL UNIQUE,
    source_document_id  BIGINT REFERENCES knowledge.document(document_id),
    summary_text        TEXT,
    extraction_run_id   TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_event_target
  ON knowledge.event (target_entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_event_type ON knowledge.event (event_type, announced_at DESC);

-- ── content ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content.report_definition (
    report_definition_id BIGSERIAL PRIMARY KEY,
    report_type          TEXT NOT NULL,
    audience_type        TEXT NOT NULL,
    schedule_policy      JSONB NOT NULL,
    section_policy       JSONB NOT NULL,
    quality_policy       JSONB NOT NULL,
    active               BOOLEAN NOT NULL DEFAULT true,
    version              INTEGER NOT NULL,
    UNIQUE (report_type, version)
);

CREATE TABLE IF NOT EXISTS content.report_run (
    report_run_id        BIGSERIAL PRIMARY KEY,
    report_definition_id BIGINT NOT NULL REFERENCES content.report_definition(report_definition_id),
    scheduled_for        TIMESTAMPTZ NOT NULL,
    as_of                TIMESTAMPTZ NOT NULL,
    data_cutoff          TIMESTAMPTZ NOT NULL,
    status               TEXT NOT NULL CHECK (status IN ('planned','running','generated','validated','published','failed','skipped')),
    knowledge_snapshot_id TEXT NOT NULL,
    feature_snapshot_id   TEXT NOT NULL DEFAULT 'none',
    model_version         TEXT,
    prompt_version        TEXT,
    pipeline_version      TEXT NOT NULL,
    started_at            TIMESTAMPTZ,
    finished_at           TIMESTAMPTZ,
    error_summary         JSONB,
    UNIQUE (report_definition_id, scheduled_for, pipeline_version)
);

CREATE TABLE IF NOT EXISTS content.report (
    report_id            BIGSERIAL PRIMARY KEY,
    report_run_id        BIGINT NOT NULL REFERENCES content.report_run(report_run_id),
    report_type          TEXT NOT NULL,
    scope_entity_id      BIGINT REFERENCES core.entity(entity_id),
    audience_key         TEXT NOT NULL DEFAULT 'global',
    title                TEXT NOT NULL,
    summary              TEXT NOT NULL,
    report_payload       JSONB NOT NULL,
    status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
      ('draft','validating','approved','published','superseded','quarantined')),
    quality_score        REAL,
    published_at         TIMESTAMPTZ,
    supersedes_report_id BIGINT REFERENCES content.report(report_id),
    content_hash         TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_report_type_status ON content.report (report_type, status);

CREATE TABLE IF NOT EXISTS content.report_evidence (
    report_id            BIGINT NOT NULL REFERENCES content.report(report_id),
    section_key          TEXT NOT NULL,
    evidence_type        TEXT NOT NULL CHECK (evidence_type IN
      ('document','claim','event','metric','impact_path','feature')),
    evidence_id          BIGINT NOT NULL,
    citation_order       INTEGER,
    PRIMARY KEY (report_id, section_key, evidence_type, evidence_id)
);

CREATE TABLE IF NOT EXISTS serving.latest_report_pointer (
    report_type   TEXT NOT NULL,
    scope_key     TEXT NOT NULL DEFAULT 'global',
    report_id     BIGINT NOT NULL REFERENCES content.report(report_id),
    switched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (report_type, scope_key)
);

-- ── grants ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  GRANT USAGE ON SCHEMA knowledge TO si_knowledge, si_analytics, si_publisher, si_readapi;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA knowledge TO si_knowledge;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA knowledge TO si_knowledge;
  GRANT SELECT ON ALL TABLES IN SCHEMA knowledge TO si_analytics, si_publisher, si_readapi;

  GRANT USAGE ON SCHEMA content TO si_publisher, si_personal, si_readapi;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA content TO si_publisher;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA content TO si_publisher;
  GRANT SELECT ON ALL TABLES IN SCHEMA content TO si_personal, si_readapi;
  GRANT SELECT, INSERT, UPDATE ON serving.latest_report_pointer TO si_publisher;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA knowledge, content TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA knowledge TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA content TO stock_insight_app_reader;
    GRANT SELECT ON serving.latest_report_pointer TO stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA knowledge GRANT SELECT ON TABLES TO stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA content GRANT SELECT ON TABLES TO stock_insight_app_reader;
  END IF;
END $$;
`;
