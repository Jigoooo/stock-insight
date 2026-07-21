export const productionNetworkMigrationSql = `
-- P2-WB — Production network: industry IO, disclosed firm relations, product
-- classification, trade routes, industry->firm allocation, and a bounded typed
-- meta-path traversal policy (enhancement plan P2-4/P2-6, §13.1-§13.3).
-- Additive migration 038. Append-only ledgers on the analytics schema; industry
-- and firm nodes reference the P1 core.entity, ports reference the P1 geo layer.

-- ── industry IO linkage (OECD ICIO / Leontief technical coefficients) ─────────
CREATE TABLE IF NOT EXISTS analytics.io_industry_linkage (
    io_industry_linkage_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    linkage_key          TEXT NOT NULL UNIQUE,
    source_industry_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    target_industry_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    technical_coefficient NUMERIC NOT NULL CHECK (technical_coefficient >= 0),
    io_table_version     TEXT NOT NULL CHECK (length(btrim(io_table_version)) > 0),
    evidence_locator     JSONB NOT NULL,
    available_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(linkage_key)) > 0),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at),
    CHECK (source_industry_entity_id <> target_industry_entity_id)
);
CREATE INDEX IF NOT EXISTS ix_io_industry_linkage_source
  ON analytics.io_industry_linkage (source_industry_entity_id, io_table_version);

-- ── disclosed firm supplier / customer relations ─────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.firm_supply_relation (
    firm_supply_relation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    relation_key         TEXT NOT NULL UNIQUE,
    from_firm_entity_id  BIGINT NOT NULL REFERENCES core.entity(entity_id),
    to_firm_entity_id    BIGINT NOT NULL REFERENCES core.entity(entity_id),
    relation_kind        TEXT NOT NULL CHECK (relation_kind IN ('supplier','customer')),
    disclosure_source    TEXT NOT NULL CHECK (length(btrim(disclosure_source)) > 0),
    revenue_share        NUMERIC CHECK (revenue_share IS NULL OR (revenue_share >= 0 AND revenue_share <= 1)),
    evidence_locator     JSONB NOT NULL,
    available_at         TIMESTAMPTZ NOT NULL,
    known_at             TIMESTAMPTZ NOT NULL,
    valid_from           TIMESTAMPTZ,
    valid_until          TIMESTAMPTZ,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(relation_key)) > 0),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (from_firm_entity_id <> to_firm_entity_id)
);
CREATE INDEX IF NOT EXISTS ix_firm_supply_relation_from
  ON analytics.firm_supply_relation (from_firm_entity_id, relation_kind);
CREATE INDEX IF NOT EXISTS ix_firm_supply_relation_to
  ON analytics.firm_supply_relation (to_firm_entity_id, relation_kind);

-- ── product classification (HS / ECCN) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.product_classification (
    product_classification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    classification_key   TEXT NOT NULL UNIQUE,
    entity_id            BIGINT REFERENCES core.entity(entity_id),
    classification_system TEXT NOT NULL CHECK (classification_system IN ('hs','eccn','naics','sic')),
    code                 TEXT NOT NULL CHECK (length(btrim(code)) > 0),
    description          TEXT,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(classification_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_product_classification_entity
  ON analytics.product_classification (entity_id, classification_system);

-- ── trade route (ports / lanes resolved through the P1 geo layer) ─────────────
CREATE TABLE IF NOT EXISTS analytics.trade_route (
    trade_route_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    route_key            TEXT NOT NULL UNIQUE,
    origin_geo_entity_id BIGINT REFERENCES geo.entity(geo_entity_id),
    destination_geo_entity_id BIGINT REFERENCES geo.entity(geo_entity_id),
    transport_mode       TEXT NOT NULL CHECK (transport_mode IN ('sea','air','rail','road','pipeline')),
    chokepoint_geo_entity_id BIGINT REFERENCES geo.entity(geo_entity_id),
    evidence_locator     JSONB,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(route_key)) > 0),
    CHECK (evidence_locator IS NULL OR jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_trade_route_origin
  ON analytics.trade_route (origin_geo_entity_id, transport_mode);

-- ── industry -> firm allocation (bounded, provenanced downward mapping) ───────
CREATE TABLE IF NOT EXISTS analytics.industry_firm_allocation (
    industry_firm_allocation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_key       TEXT NOT NULL UNIQUE,
    industry_entity_id   BIGINT NOT NULL REFERENCES core.entity(entity_id),
    firm_entity_id       BIGINT NOT NULL REFERENCES core.entity(entity_id),
    allocation_weight    NUMERIC NOT NULL CHECK (allocation_weight >= 0 AND allocation_weight <= 1),
    allocation_basis     TEXT NOT NULL CHECK (allocation_basis IN ('revenue','asset','production','employment','market_cap','manual')),
    as_of                TIMESTAMPTZ NOT NULL,
    evidence_locator     JSONB NOT NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(allocation_key)) > 0),
    CHECK (jsonb_typeof(evidence_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (industry_entity_id, firm_entity_id, allocation_basis, as_of)
);
CREATE INDEX IF NOT EXISTS ix_industry_firm_allocation_industry
  ON analytics.industry_firm_allocation (industry_entity_id, allocation_basis, as_of);

-- ── bounded typed meta-path traversal policy (§13.3) ──────────────────────────
-- Traversal is only ever along a declared typed meta-path within a hop and cost
-- budget. A mixed-relation shortest path over the whole graph is forbidden.
CREATE TABLE IF NOT EXISTS analytics.meta_path_policy (
    meta_path_policy_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    policy_key           TEXT NOT NULL UNIQUE,
    surface              TEXT NOT NULL CHECK (surface IN ('ui','api','offline')),
    meta_path_pattern    TEXT NOT NULL CHECK (length(btrim(meta_path_pattern)) > 0),
    max_hops             INTEGER NOT NULL CHECK (max_hops >= 1),
    cost_budget          NUMERIC NOT NULL CHECK (cost_budget > 0),
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(policy_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object'),
    -- §13.3: the UI is capped at three hops.
    CHECK (surface <> 'ui' OR max_hops <= 3)
);

-- ── guards ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.reject_production_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- Industry->firm allocation is append-only, and for a given
-- (industry, basis, as_of) the allocation shares may not sum above 1.
CREATE OR REPLACE FUNCTION analytics.guard_industry_firm_allocation_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'analytics.industry_firm_allocation is append-only' USING ERRCODE = '55000';
  END IF;
  -- Serialize concurrent inserts for the same (industry, basis, as_of) bucket so
  -- the running-SUM check below cannot be raced by two transactions each reading
  -- a pre-insert sum and both passing. The xact lock is released at commit.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.industry_entity_id::text || '|' || NEW.allocation_basis || '|' || NEW.as_of::text,
      0
    )
  );
  SELECT coalesce(sum(allocation_weight), 0) INTO v_total
  FROM analytics.industry_firm_allocation
  WHERE industry_entity_id = NEW.industry_entity_id
    AND allocation_basis = NEW.allocation_basis
    AND as_of = NEW.as_of;
  IF v_total + NEW.allocation_weight > 1.0000001 THEN
    RAISE EXCEPTION 'allocation weights for an industry may not exceed 1 (basis %, existing %, new %)',
      NEW.allocation_basis, v_total, NEW.allocation_weight;
  END IF;
  RETURN NEW;
END $$;

-- ── meta-path policy seed (§13.3: UI 1-3 hop, API bounded, offline deeper) ─────
INSERT INTO analytics.meta_path_policy (policy_key, surface, meta_path_pattern, max_hops, cost_budget)
VALUES
  ('ui-supplier-chain', 'ui', 'firm-[supplier]->firm', 3, 3.0),
  ('ui-industry-firm', 'ui', 'industry-[io]->industry-[allocation]->firm', 3, 3.0),
  ('api-supply-impact', 'api', 'shock-[channel]->exposure-[firm_supply]->firm', 3, 5.0),
  ('offline-deep-chain', 'offline', 'firm-[supplier]->firm', 8, 20.0)
ON CONFLICT (policy_key) DO NOTHING;

DO $$
DECLARE v_ui_over BIGINT;
BEGIN
  -- P2-WB meta-path policy seed invariant: no UI policy exceeds three hops.
  SELECT count(*) INTO v_ui_over FROM analytics.meta_path_policy WHERE surface = 'ui' AND max_hops > 3;
  IF v_ui_over <> 0 THEN
    RAISE EXCEPTION 'P2-WB meta-path policy seed produced % UI policies over 3 hops', v_ui_over;
  END IF;
END $$;

-- ── install guards after seed ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS industry_firm_allocation_write_guard ON analytics.industry_firm_allocation;
CREATE TRIGGER industry_firm_allocation_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.industry_firm_allocation
FOR EACH ROW EXECUTE FUNCTION analytics.guard_industry_firm_allocation_write();

DROP TRIGGER IF EXISTS io_industry_linkage_write_guard ON analytics.io_industry_linkage;
CREATE TRIGGER io_industry_linkage_write_guard
BEFORE UPDATE OR DELETE ON analytics.io_industry_linkage
FOR EACH ROW EXECUTE FUNCTION analytics.reject_production_child_mutation();

DROP TRIGGER IF EXISTS firm_supply_relation_write_guard ON analytics.firm_supply_relation;
CREATE TRIGGER firm_supply_relation_write_guard
BEFORE UPDATE OR DELETE ON analytics.firm_supply_relation
FOR EACH ROW EXECUTE FUNCTION analytics.reject_production_child_mutation();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
GRANT USAGE ON SCHEMA analytics TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  analytics.io_industry_linkage,
  analytics.firm_supply_relation,
  analytics.product_classification,
  analytics.trade_route,
  analytics.industry_firm_allocation,
  analytics.meta_path_policy
TO si_analytics;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics, si_knowledge, si_publisher;

GRANT SELECT ON
  analytics.io_industry_linkage,
  analytics.firm_supply_relation,
  analytics.product_classification,
  analytics.trade_route,
  analytics.industry_firm_allocation,
  analytics.meta_path_policy
TO si_knowledge, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;
    GRANT SELECT ON
      analytics.io_industry_linkage,
      analytics.firm_supply_relation,
      analytics.product_classification,
      analytics.trade_route,
      analytics.industry_firm_allocation,
      analytics.meta_path_policy
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
