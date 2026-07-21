export const precomputeCacheLedgerMigrationSql = `
-- P2-WE2 — Precompute strategy and cache-key ledger
-- (enhancement plan P2-9, §18.3). Additive migration 041. Three-tier precompute
-- strategy (always / conditional / on_demand) and an append-only cache-entry
-- ledger whose key MUST carry all four version components (snapshot, query,
-- ontology, model) so a stale precompute can never be served under a changed
-- snapshot/ontology/model. Invalidation is its own append-only ledger.

-- ── precompute policy (which surfaces precompute, and how) ────────────────────
CREATE TABLE IF NOT EXISTS analytics.precompute_policy (
    precompute_policy_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    policy_key           TEXT NOT NULL UNIQUE,
    surface              TEXT NOT NULL CHECK (length(btrim(surface)) > 0),
    strategy             TEXT NOT NULL CHECK (strategy IN ('always','conditional','on_demand')),
    condition_expr       TEXT,
    bound_cost           NUMERIC CHECK (bound_cost IS NULL OR bound_cost > 0),
    description          TEXT,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(policy_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object'),
    -- an on_demand policy must declare a bounded cost budget.
    CHECK (strategy <> 'on_demand' OR bound_cost IS NOT NULL),
    -- a conditional policy must declare its condition.
    CHECK (strategy <> 'conditional' OR condition_expr IS NOT NULL)
);

-- ── precompute cache entry (append-only; key carries all four versions) ───────
CREATE TABLE IF NOT EXISTS analytics.precompute_cache_entry (
    precompute_cache_entry_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    precompute_policy_id BIGINT REFERENCES analytics.precompute_policy(precompute_policy_id),
    cache_namespace      TEXT NOT NULL CHECK (length(btrim(cache_namespace)) > 0),
    cache_key            TEXT NOT NULL CHECK (length(btrim(cache_key)) > 0),
    -- §18.3: the four version components that make a cache entry safe to serve.
    snapshot_version     TEXT NOT NULL CHECK (length(btrim(snapshot_version)) > 0),
    query_version        TEXT NOT NULL CHECK (length(btrim(query_version)) > 0),
    ontology_version     TEXT NOT NULL CHECK (length(btrim(ontology_version)) > 0),
    model_version        TEXT NOT NULL CHECK (length(btrim(model_version)) > 0),
    payload_digest       TEXT NOT NULL CHECK (length(btrim(payload_digest)) > 0),
    payload_ref          JSONB NOT NULL,
    computed_at          TIMESTAMPTZ NOT NULL,
    fresh_until          TIMESTAMPTZ,
    is_invalidated       BOOLEAN NOT NULL DEFAULT false,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(payload_ref) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    UNIQUE (cache_namespace, cache_key, snapshot_version, query_version, ontology_version, model_version)
);
CREATE INDEX IF NOT EXISTS ix_precompute_cache_entry_lookup
  ON analytics.precompute_cache_entry (cache_namespace, cache_key, is_invalidated);

-- ── precompute invalidation (append-only ledger keyed by a version bump) ──────
CREATE TABLE IF NOT EXISTS analytics.precompute_invalidation (
    precompute_invalidation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    precompute_cache_entry_id BIGINT REFERENCES analytics.precompute_cache_entry(precompute_cache_entry_id),
    cache_namespace      TEXT NOT NULL CHECK (length(btrim(cache_namespace)) > 0),
    invalidation_reason  TEXT NOT NULL CHECK (invalidation_reason IN ('snapshot_bump','ontology_bump','model_bump','query_bump','manual')),
    invalidated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    detail               TEXT,
    metadata             JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_precompute_invalidation_entry
  ON analytics.precompute_invalidation (precompute_cache_entry_id);

-- ── guards ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.reject_precompute_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- Append-only cache entries. Only the is_invalidated flag may flip (true), which
-- retires an entry without deleting it; the version-keyed row stays for audit.
-- A cache entry must carry all four non-empty version components.
CREATE OR REPLACE FUNCTION analytics.guard_precompute_cache_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics.precompute_cache_entry is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(btrim(NEW.snapshot_version), '') = ''
       OR coalesce(btrim(NEW.query_version), '') = ''
       OR coalesce(btrim(NEW.ontology_version), '') = ''
       OR coalesce(btrim(NEW.model_version), '') = '' THEN
      RAISE EXCEPTION 'cache entry requires all four version components (snapshot, query, ontology, model)';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: only a one-way invalidation flip is permitted; everything else frozen.
  IF ROW(
    NEW.precompute_cache_entry_id, NEW.cache_namespace, NEW.cache_key,
    NEW.snapshot_version, NEW.query_version, NEW.ontology_version, NEW.model_version,
    NEW.payload_digest, NEW.payload_ref, NEW.computed_at
  ) IS DISTINCT FROM ROW(
    OLD.precompute_cache_entry_id, OLD.cache_namespace, OLD.cache_key,
    OLD.snapshot_version, OLD.query_version, OLD.ontology_version, OLD.model_version,
    OLD.payload_digest, OLD.payload_ref, OLD.computed_at
  ) THEN
    RAISE EXCEPTION 'precompute cache entry immutable fields cannot change' USING ERRCODE = '55000';
  END IF;
  IF OLD.is_invalidated = true AND NEW.is_invalidated = false THEN
    RAISE EXCEPTION 'precompute cache invalidation cannot be reversed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

-- ── precompute policy seed (§18.3 three-tier) ─────────────────────────────────
INSERT INTO analytics.precompute_policy (policy_key, surface, strategy, condition_expr, bound_cost, description)
VALUES
  ('dashboard-bootstrap-always', 'dashboard.bootstrap', 'always', NULL, NULL, 'Hot path; always precomputed'),
  ('relation-graph-conditional', 'relation.graph', 'conditional', 'watchlist_membership', NULL, 'Precompute only for watchlisted entities'),
  ('impact-scenario-ondemand', 'impact.scenario', 'on_demand', NULL, 10.0, 'Bounded on-demand; expensive scenario tree')
ON CONFLICT (policy_key) DO NOTHING;

DO $$
DECLARE v_missing INTEGER;
BEGIN
  -- P2-WE precompute policy seed invariant: all three tiers present.
  SELECT 3 - count(DISTINCT strategy) INTO v_missing FROM analytics.precompute_policy
  WHERE strategy IN ('always','conditional','on_demand');
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'P2-WE precompute policy seed missing % strategy tiers', v_missing;
  END IF;
END $$;

-- ── install guards after seed ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS precompute_cache_write_guard ON analytics.precompute_cache_entry;
CREATE TRIGGER precompute_cache_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON analytics.precompute_cache_entry
FOR EACH ROW EXECUTE FUNCTION analytics.guard_precompute_cache_write();

DROP TRIGGER IF EXISTS precompute_invalidation_write_guard ON analytics.precompute_invalidation;
CREATE TRIGGER precompute_invalidation_write_guard
BEFORE UPDATE OR DELETE ON analytics.precompute_invalidation
FOR EACH ROW EXECUTE FUNCTION analytics.reject_precompute_child_mutation();

-- ── least-privilege grants (append + read; no delete) ────────────────────────
GRANT USAGE ON SCHEMA analytics TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  analytics.precompute_policy,
  analytics.precompute_cache_entry,
  analytics.precompute_invalidation
TO si_analytics;
GRANT UPDATE (is_invalidated) ON analytics.precompute_cache_entry TO si_analytics;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics, si_knowledge, si_publisher;

GRANT SELECT ON
  analytics.precompute_policy,
  analytics.precompute_cache_entry,
  analytics.precompute_invalidation
TO si_knowledge, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;
    GRANT SELECT ON
      analytics.precompute_policy,
      analytics.precompute_cache_entry,
      analytics.precompute_invalidation
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
