export const identityTaxonomyMigrationSql = `
-- B3 — Identity and taxonomy (master plan §3.4, B3).
-- Truth policy: only existing public.entities SIC/KSIC codes are promoted.
-- Missing classifications become explicit UNCLASSIFIED memberships; no sector
-- or industry label/code is fabricated.

CREATE TABLE IF NOT EXISTS core.security_issuer_identity (
    security_issuer_identity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    security_entity_id          BIGINT NOT NULL REFERENCES core.entity(entity_id),
    issuer_entity_id            BIGINT NOT NULL REFERENCES core.entity(entity_id),
    identity_match_key          TEXT NOT NULL,
    mapping_basis               TEXT NOT NULL,
    valid_from                  TIMESTAMPTZ NOT NULL,
    known_from                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata                    JSONB NOT NULL DEFAULT '{}',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (security_entity_id),
    UNIQUE (issuer_entity_id),
    CHECK (security_entity_id <> issuer_entity_id)
);

CREATE OR REPLACE FUNCTION core.validate_security_issuer_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE security_type TEXT; issuer_type TEXT;
BEGIN
  SELECT entity_type INTO security_type FROM core.entity WHERE entity_id=NEW.security_entity_id;
  SELECT entity_type INTO issuer_type FROM core.entity WHERE entity_id=NEW.issuer_entity_id;
  IF security_type <> 'Stock' OR issuer_type <> 'Company' THEN
    RAISE EXCEPTION 'security_issuer_identity requires Stock -> Company, got % -> %', security_type, issuer_type;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION core.reject_identity_taxonomy_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME USING ERRCODE='55000';
END $$;

DROP TRIGGER IF EXISTS security_issuer_identity_validate ON core.security_issuer_identity;
CREATE TRIGGER security_issuer_identity_validate
BEFORE INSERT ON core.security_issuer_identity
FOR EACH ROW EXECUTE FUNCTION core.validate_security_issuer_identity();

DROP TRIGGER IF EXISTS security_issuer_identity_immutable ON core.security_issuer_identity;
CREATE TRIGGER security_issuer_identity_immutable
BEFORE UPDATE OR DELETE ON core.security_issuer_identity
FOR EACH ROW EXECUTE FUNCTION core.reject_identity_taxonomy_mutation();

-- Exact identity bridge: Stock INTERNAL_KEY=KR:005930 ↔ Company
-- INTERNAL_KEY=COMPANY:KR:005930. Live readback before B3: 254/254 exact.
INSERT INTO core.security_issuer_identity (
  security_entity_id, issuer_entity_id, identity_match_key,
  mapping_basis, valid_from, known_from, metadata
)
SELECT stock.entity_id,
       company.entity_id,
       stock_identifier.identifier_value,
       'exact_internal_key_bridge',
       greatest(stock.created_at, company.created_at),
       now(),
       jsonb_build_object('policy','b3-v1','company_prefix','COMPANY:')
FROM core.entity stock
JOIN core.entity_identifier stock_identifier
  ON stock_identifier.entity_id=stock.entity_id
 AND stock_identifier.identifier_type='INTERNAL_KEY'
JOIN core.entity_identifier company_identifier
  ON company_identifier.identifier_type='INTERNAL_KEY'
 AND company_identifier.identifier_value='COMPANY:' || stock_identifier.identifier_value
JOIN core.entity company ON company.entity_id=company_identifier.entity_id
WHERE stock.entity_type='Stock' AND company.entity_type='Company'
ON CONFLICT (security_entity_id) DO NOTHING;

-- Canonical graph predicate for downstream traversal (idempotent legacy key).
INSERT INTO knowledge.relation (
  subject_entity_id, predicate, object_entity_id, relation_kind,
  confidence, source_quality, corroboration_count,
  valid_from, recorded_from, status, rule_version,
  legacy_relation_key, metadata
)
SELECT identity.security_entity_id,
       'ISSUED_BY',
       identity.issuer_entity_id,
       'structural',
       1.0,
       1.0,
       1,
       identity.valid_from,
       now(),
       'active',
       'b3-identity-v1',
       'b3:issued_by:' || identity.security_entity_id::text || ':' || identity.issuer_entity_id::text,
       jsonb_build_object('mapping_basis',identity.mapping_basis,'identity_match_key',identity.identity_match_key)
FROM core.security_issuer_identity identity
ON CONFLICT (legacy_relation_key) WHERE legacy_relation_key IS NOT NULL DO NOTHING;

CREATE TABLE IF NOT EXISTS core.taxonomy_release (
    taxonomy_release_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    taxonomy_system     TEXT NOT NULL CHECK (taxonomy_system IN ('SIC','KSIC')),
    release_version     TEXT NOT NULL,
    policy_status       TEXT NOT NULL DEFAULT 'provisional_review_required'
      CHECK (policy_status IN ('provisional_review_required','approved','retired')),
    effective_from      TIMESTAMPTZ NOT NULL,
    known_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_reference    TEXT NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}',
    UNIQUE (taxonomy_system, release_version)
);

CREATE TABLE IF NOT EXISTS core.taxonomy_node (
    taxonomy_node_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    taxonomy_release_id BIGINT NOT NULL REFERENCES core.taxonomy_release(taxonomy_release_id),
    code             TEXT NOT NULL,
    label            TEXT,
    parent_code      TEXT,
    hierarchy_level  INTEGER NOT NULL DEFAULT 0,
    node_status      TEXT NOT NULL DEFAULT 'source_reported'
      CHECK (node_status IN ('source_reported','unclassified','verified','retired')),
    metadata         JSONB NOT NULL DEFAULT '{}',
    UNIQUE (taxonomy_release_id, code)
);

CREATE TABLE IF NOT EXISTS core.taxonomy_crosswalk (
    taxonomy_crosswalk_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_taxonomy_node_id BIGINT NOT NULL REFERENCES core.taxonomy_node(taxonomy_node_id),
    to_taxonomy_node_id   BIGINT NOT NULL REFERENCES core.taxonomy_node(taxonomy_node_id),
    mapping_type          TEXT NOT NULL CHECK (mapping_type IN ('exact','narrower','broader','related')),
    confidence            REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    evidence_metadata     JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_taxonomy_node_id, to_taxonomy_node_id)
);

CREATE TABLE IF NOT EXISTS core.entity_taxonomy_membership (
    entity_taxonomy_membership_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id          BIGINT NOT NULL REFERENCES core.entity(entity_id),
    taxonomy_node_id   BIGINT NOT NULL REFERENCES core.taxonomy_node(taxonomy_node_id),
    classification_status TEXT NOT NULL
      CHECK (classification_status IN ('source_reported','verified','unclassified')),
    source_reference   TEXT NOT NULL,
    valid_from         TIMESTAMPTZ NOT NULL,
    known_from         TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata           JSONB NOT NULL DEFAULT '{}',
    UNIQUE (entity_id, taxonomy_node_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_taxonomy_system
ON core.entity_taxonomy_membership (
  entity_id,
  ((metadata->>'taxonomy_system'))
);

-- Version is intentionally an internal import baseline, not a false claim
-- about an official SIC/KSIC edition.
INSERT INTO core.taxonomy_release (
  taxonomy_system, release_version, policy_status,
  effective_from, source_reference, metadata
)
VALUES
  ('SIC','legacy-import-b3-v1','provisional_review_required','2026-07-19T00:00:00Z','public.entities.industry_code', '{"edition":"unknown","review_required":true}'),
  ('KSIC','legacy-import-b3-v1','provisional_review_required','2026-07-19T00:00:00Z','public.entities.industry_code', '{"edition":"unknown","review_required":true}')
ON CONFLICT (taxonomy_system, release_version) DO NOTHING;

-- Exact source-reported nodes only.
INSERT INTO core.taxonomy_node (
  taxonomy_release_id, code, label, hierarchy_level, node_status, metadata
)
SELECT DISTINCT release.taxonomy_release_id,
       legacy.industry_code,
       nullif(legacy.industry_code_desc,''),
       length(legacy.industry_code),
       'source_reported',
       jsonb_build_object('source','public.entities','policy','b3-v1')
FROM public.entities legacy
JOIN core.taxonomy_release release
  ON release.taxonomy_system=legacy.industry_code_system
 AND release.release_version='legacy-import-b3-v1'
WHERE legacy.industry_code_system IN ('SIC','KSIC')
  AND nullif(legacy.industry_code,'') IS NOT NULL
ON CONFLICT (taxonomy_release_id, code) DO NOTHING;

-- Honest fallback node per system.
INSERT INTO core.taxonomy_node (
  taxonomy_release_id, code, label, hierarchy_level, node_status, metadata
)
SELECT taxonomy_release_id, 'UNCLASSIFIED', 'Unclassified', 0, 'unclassified',
       '{"reason":"no_source_reported_code","policy":"b3-v1"}'::jsonb
FROM core.taxonomy_release
WHERE release_version='legacy-import-b3-v1'
ON CONFLICT (taxonomy_release_id, code) DO NOTHING;

-- Every Stock receives one system membership. Existing SIC/KSIC code is kept;
-- absent code maps to UNCLASSIFIED according to country (KR→KSIC, else SIC).
WITH stock_key AS (
  SELECT stock.entity_id,
         stock.country_code,
         identifier.identifier_value AS entity_key,
         CASE WHEN stock.country_code='KR' THEN 'KSIC' ELSE 'SIC' END AS default_system
  FROM core.entity stock
  JOIN core.entity_identifier identifier
    ON identifier.entity_id=stock.entity_id AND identifier.identifier_type='INTERNAL_KEY'
  WHERE stock.entity_type='Stock'
), classified AS (
  SELECT stock_key.*,
         CASE WHEN legacy.industry_code_system IN ('SIC','KSIC')
                   AND nullif(legacy.industry_code,'') IS NOT NULL
              THEN legacy.industry_code_system ELSE stock_key.default_system END AS taxonomy_system,
         CASE WHEN legacy.industry_code_system IN ('SIC','KSIC')
                   AND nullif(legacy.industry_code,'') IS NOT NULL
              THEN legacy.industry_code ELSE 'UNCLASSIFIED' END AS taxonomy_code,
         CASE WHEN legacy.industry_code_system IN ('SIC','KSIC')
                   AND nullif(legacy.industry_code,'') IS NOT NULL
              THEN 'source_reported' ELSE 'unclassified' END AS classification_status
  FROM stock_key
  LEFT JOIN public.entities legacy ON legacy.entity_key=stock_key.entity_key
)
INSERT INTO core.entity_taxonomy_membership (
  entity_id, taxonomy_node_id, classification_status,
  source_reference, valid_from, known_from, metadata
)
SELECT classified.entity_id,
       node.taxonomy_node_id,
       classified.classification_status,
       CASE WHEN classified.classification_status='source_reported'
            THEN 'public.entities.industry_code' ELSE 'b3-explicit-unclassified' END,
       '2026-07-19T00:00:00Z',
       now(),
       jsonb_build_object('taxonomy_system',classified.taxonomy_system,'policy','b3-v1')
FROM classified
JOIN core.taxonomy_release release
  ON release.taxonomy_system=classified.taxonomy_system
 AND release.release_version='legacy-import-b3-v1'
JOIN core.taxonomy_node node
  ON node.taxonomy_release_id=release.taxonomy_release_id
 AND node.code=classified.taxonomy_code
ON CONFLICT (entity_id, taxonomy_node_id) DO NOTHING;

GRANT SELECT ON core.security_issuer_identity,
                core.taxonomy_release,
                core.taxonomy_node,
                core.taxonomy_crosswalk,
                core.entity_taxonomy_membership
TO stock_insight_app_reader;
`;
