export const metricDefinitionRegistryMigrationSql = `
-- Metric definition registry and comparability — canonical/02 §7, canonical/04 §6.
--
-- The rule the registry exists to enforce: same KPI name, different definition,
-- no comparison. "Operating margin" from a Korean issuer under K-IFRS and from a
-- US issuer under US-GAAP are different numbers wearing the same word, and a peer
-- table that ranks them together is not measuring anything.
--
-- REQ-PROD-020 wants per-dimension rank with its definition and coverage shown,
-- not one score. REQ-PROD-021 wants an incomparable KPI to say so. Both need a
-- place where "what does this number mean" has an answer, which is this.
--
-- canonical/04 §6 adds the temporal half: when an issuer changes a segment or KPI
-- definition, computing a plain YoY across the change is forbidden. That is why a
-- definition is a revision with an effective interval and a supersession link
-- rather than a row that gets edited.
--
-- WHY COMPARABILITY IS A DIRECTED PAIR AND NOT A GROUP FLAG. A group key answers
-- "are these the same kind of thing", which is necessary and not sufficient.
-- NORMALIZABLE is frequently one-way: a definition that reports revenue excluding
-- a rebate can be converted to the inclusive one when the rebate is disclosed, and
-- not back. Storing one flag per definition cannot express that, and storing an
-- undirected pair silently claims a conversion that only exists in one direction.
--
-- GRANTS: pipeline roles only. See migration 078 on why the app roles get nothing
-- and why that means no boot-digest re-pin.

CREATE TABLE IF NOT EXISTS governance.metric_definition (
    metric_definition_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    definition_key TEXT NOT NULL
      CHECK (definition_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),

    -- Keyed to match world.numeric_fact so a fact can name the definition it was
    -- recorded under rather than leaving a reader to infer it from the concept.
    concept_namespace TEXT NOT NULL CHECK (length(btrim(concept_namespace)) > 0),
    concept_key       TEXT NOT NULL CHECK (length(btrim(concept_key)) > 0),
    canonical_concept TEXT NOT NULL CHECK (length(btrim(canonical_concept)) > 0),
    display_name      TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),

    -- Whose definition this is. 'canonical' is ours; the rest belong to whoever
    -- published them, and that distinction is the whole point — an issuer's
    -- non-GAAP margin is their definition, not a fact about the world.
    definition_scope TEXT NOT NULL
      CHECK (definition_scope IN ('canonical', 'issuer', 'source', 'regulator')),
    issuer_entity_id BIGINT REFERENCES core.entity(entity_id),
    source_id        BIGINT REFERENCES ingestion.source(source_id),

    numerator_description   TEXT,
    denominator_description TEXT,
    period_basis TEXT NOT NULL CHECK (period_basis IN (
      'instant', 'duration_quarter', 'duration_ytd', 'duration_ttm', 'duration_annual'
    )),
    inclusions TEXT[] NOT NULL DEFAULT '{}',
    exclusions TEXT[] NOT NULL DEFAULT '{}',
    accounting_basis TEXT NOT NULL CHECK (accounting_basis IN (
      'gaap', 'ifrs', 'k_ifrs', 'non_gaap', 'statutory', 'internal', 'unknown'
    )),

    unit        TEXT NOT NULL CHECK (length(btrim(unit)) > 0),
    currency    TEXT,
    scale_power INTEGER NOT NULL DEFAULT 0,

    comparability_group_key     TEXT NOT NULL
      CHECK (length(btrim(comparability_group_key)) > 0),
    comparability_group_version INTEGER NOT NULL CHECK (comparability_group_version > 0),

    -- Definition drift (canonical/04 §6). A changed definition is a new revision
    -- pointing at the one it replaced, so a YoY that spans the change can be
    -- detected instead of silently computed.
    supersedes_metric_definition_id BIGINT
      REFERENCES governance.metric_definition(metric_definition_id),
    definition_state TEXT NOT NULL DEFAULT 'active'
      CHECK (definition_state IN ('active', 'superseded', 'retired')),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to   TIMESTAMPTZ,

    known_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),
    notes      TEXT,

    UNIQUE (definition_key, revision_no),

    -- A scope that names nobody is not a scope.
    CONSTRAINT metric_definition_scope_target CHECK (
      (definition_scope = 'issuer' AND issuer_entity_id IS NOT NULL)
      OR (definition_scope = 'source' AND source_id IS NOT NULL)
      OR definition_scope IN ('canonical', 'regulator')
    ),

    -- A non-GAAP definition that states no adjustment is indistinguishable from
    -- the GAAP one it claims to differ from, and that is exactly the case where a
    -- reader is misled into comparing them.
    CONSTRAINT metric_definition_non_gaap_states_adjustment CHECK (
      accounting_basis <> 'non_gaap'
      OR cardinality(inclusions) > 0
      OR cardinality(exclusions) > 0
    ),

    -- A ratio needs both halves named. One-sided is how "margin" ends up meaning
    -- four different things.
    CONSTRAINT metric_definition_ratio_has_both_sides CHECK (
      unit <> 'ratio' OR (numerator_description IS NOT NULL AND denominator_description IS NOT NULL)
    ),

    CONSTRAINT metric_definition_currency_scope CHECK (
      (unit = 'currency') = (currency IS NOT NULL)
    ),

    CONSTRAINT metric_definition_effective_interval CHECK (
      effective_to IS NULL OR effective_to > effective_from
    ),

    CONSTRAINT metric_definition_no_self_supersede CHECK (
      supersedes_metric_definition_id IS NULL
      OR supersedes_metric_definition_id <> metric_definition_id
    )
);

CREATE INDEX IF NOT EXISTS metric_definition_concept_idx
  ON governance.metric_definition (concept_namespace, concept_key, effective_from DESC);

CREATE INDEX IF NOT EXISTS metric_definition_group_idx
  ON governance.metric_definition (comparability_group_key, comparability_group_version);

CREATE INDEX IF NOT EXISTS metric_definition_state_idx
  ON governance.metric_definition (definition_state, effective_from DESC);

-- Append-only apart from the lifecycle columns. What a definition *says* is fixed
-- at insert: editing it rewrites the meaning of every fact already recorded under
-- it, which is REQ-SEM-002 applied to definitions.
CREATE OR REPLACE FUNCTION governance.reject_metric_definition_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.metric_definition is append-only (delete rejected for %)',
      OLD.metric_definition_id;
  END IF;

  IF NEW.definition_key IS DISTINCT FROM OLD.definition_key
     OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
     OR NEW.concept_namespace IS DISTINCT FROM OLD.concept_namespace
     OR NEW.concept_key IS DISTINCT FROM OLD.concept_key
     OR NEW.canonical_concept IS DISTINCT FROM OLD.canonical_concept
     OR NEW.definition_scope IS DISTINCT FROM OLD.definition_scope
     OR NEW.numerator_description IS DISTINCT FROM OLD.numerator_description
     OR NEW.denominator_description IS DISTINCT FROM OLD.denominator_description
     OR NEW.period_basis IS DISTINCT FROM OLD.period_basis
     OR NEW.inclusions IS DISTINCT FROM OLD.inclusions
     OR NEW.exclusions IS DISTINCT FROM OLD.exclusions
     OR NEW.accounting_basis IS DISTINCT FROM OLD.accounting_basis
     OR NEW.unit IS DISTINCT FROM OLD.unit
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.scale_power IS DISTINCT FROM OLD.scale_power
     OR NEW.comparability_group_key IS DISTINCT FROM OLD.comparability_group_key
     OR NEW.comparability_group_version IS DISTINCT FROM OLD.comparability_group_version
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.known_at IS DISTINCT FROM OLD.known_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'governance.metric_definition content is immutable; add a revision (%)',
      OLD.metric_definition_id;
  END IF;

  IF NOT (
    (OLD.definition_state = 'active' AND NEW.definition_state IN ('active','superseded','retired'))
    OR (OLD.definition_state = NEW.definition_state)
  ) THEN
    RAISE EXCEPTION 'governance.metric_definition illegal transition % -> % (%)',
      OLD.definition_state, NEW.definition_state, OLD.metric_definition_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metric_definition_append_only ON governance.metric_definition;
CREATE TRIGGER metric_definition_append_only
  BEFORE DELETE OR UPDATE ON governance.metric_definition
  FOR EACH ROW EXECUTE FUNCTION governance.reject_metric_definition_mutation();

-- ── comparability ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance.metric_comparability (
    metric_comparability_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_metric_definition_id BIGINT NOT NULL
      REFERENCES governance.metric_definition(metric_definition_id),
    to_metric_definition_id BIGINT NOT NULL
      REFERENCES governance.metric_definition(metric_definition_id),

    comparability_state TEXT NOT NULL CHECK (comparability_state IN (
      'COMPARABLE', 'NORMALIZABLE', 'PARTIALLY_COMPARABLE', 'NOT_COMPARABLE', 'UNKNOWN'
    )),

    rationale TEXT NOT NULL CHECK (length(btrim(rationale)) > 0),

    -- NORMALIZABLE without a stated method is a promise nobody can execute, and it
    -- reads as "comparable, just do the conversion" to every caller.
    normalization_rule TEXT,

    -- PARTIALLY_COMPARABLE without a stated scope is UNKNOWN with a friendlier
    -- name — and a friendlier name is what gets it rendered as a comparison.
    partial_scope TEXT,

    assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assessed_by TEXT NOT NULL CHECK (length(btrim(assessed_by)) > 0),

    UNIQUE (from_metric_definition_id, to_metric_definition_id),

    CONSTRAINT metric_comparability_not_self CHECK (
      from_metric_definition_id <> to_metric_definition_id
    ),
    CONSTRAINT metric_comparability_normalizable_has_rule CHECK (
      comparability_state <> 'NORMALIZABLE' OR length(btrim(coalesce(normalization_rule, ''))) > 0
    ),
    CONSTRAINT metric_comparability_partial_has_scope CHECK (
      comparability_state <> 'PARTIALLY_COMPARABLE'
      OR length(btrim(coalesce(partial_scope, ''))) > 0
    )
);

CREATE INDEX IF NOT EXISTS metric_comparability_from_idx
  ON governance.metric_comparability (from_metric_definition_id, comparability_state);

-- COMPARABLE across different comparability groups is a contradiction: the group
-- is the claim that two definitions measure the same kind of thing, and calling
-- them directly comparable while denying that is how an incomparable pair reaches
-- a peer table. Enforced by trigger because it spans rows.
CREATE OR REPLACE FUNCTION governance.guard_metric_comparability_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  from_group TEXT;
  to_group   TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.metric_comparability is append-only (delete rejected for %)',
      OLD.metric_comparability_id;
  END IF;

  SELECT comparability_group_key INTO from_group
    FROM governance.metric_definition WHERE metric_definition_id = NEW.from_metric_definition_id;
  SELECT comparability_group_key INTO to_group
    FROM governance.metric_definition WHERE metric_definition_id = NEW.to_metric_definition_id;

  IF NEW.comparability_state = 'COMPARABLE' AND from_group IS DISTINCT FROM to_group THEN
    RAISE EXCEPTION
      'COMPARABLE across different comparability groups (% vs %); use NORMALIZABLE with a rule',
      from_group, to_group;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metric_comparability_write_guard ON governance.metric_comparability;
CREATE TRIGGER metric_comparability_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON governance.metric_comparability
  FOR EACH ROW EXECUTE FUNCTION governance.guard_metric_comparability_write();

-- The call-site answer for REQ-PROD-021.
--
-- Resolution order, and why:
--   1. an explicit assessment in the asked direction — the only one that can carry
--      a one-way normalization rule
--   2. an explicit assessment in the reverse direction, but only for the states
--      that are genuinely symmetric. NORMALIZABLE is deliberately not mirrored:
--      "B can be converted to A" does not make A convertible to B
--   3. same comparability group and version -> COMPARABLE
--   4. otherwise UNKNOWN
--
-- Step 4 is the important one. A caller that gets UNKNOWN must render
-- "not established", not a comparison — the default is never COMPARABLE.
CREATE OR REPLACE FUNCTION governance.metric_comparability_state(
  from_definition_id BIGINT,
  to_definition_id BIGINT
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(
    (SELECT comparability_state FROM governance.metric_comparability
      WHERE from_metric_definition_id = from_definition_id
        AND to_metric_definition_id = to_definition_id),
    (SELECT comparability_state FROM governance.metric_comparability
      WHERE from_metric_definition_id = to_definition_id
        AND to_metric_definition_id = from_definition_id
        AND comparability_state IN ('COMPARABLE', 'NOT_COMPARABLE', 'UNKNOWN')),
    (SELECT 'COMPARABLE'
       FROM governance.metric_definition a, governance.metric_definition b
      WHERE a.metric_definition_id = from_definition_id
        AND b.metric_definition_id = to_definition_id
        AND a.comparability_group_key = b.comparability_group_key
        AND a.comparability_group_version = b.comparability_group_version),
    'UNKNOWN'
  );
$fn$;

-- Latest active revision per definition key.
CREATE OR REPLACE VIEW governance.metric_definition_current_v1 AS
SELECT DISTINCT ON (definition_key)
       metric_definition_id,
       definition_key,
       revision_no,
       concept_namespace,
       concept_key,
       canonical_concept,
       display_name,
       definition_scope,
       accounting_basis,
       period_basis,
       unit,
       currency,
       scale_power,
       comparability_group_key,
       comparability_group_version,
       effective_from,
       effective_to
  FROM governance.metric_definition
 WHERE definition_state = 'active'
 ORDER BY definition_key, revision_no DESC;

GRANT SELECT, INSERT ON governance.metric_definition, governance.metric_comparability
  TO si_knowledge, si_analytics, si_publisher;
GRANT UPDATE (definition_state, effective_to, notes)
  ON governance.metric_definition TO si_analytics, si_publisher;
GRANT SELECT ON governance.metric_definition, governance.metric_comparability,
  governance.metric_definition_current_v1 TO si_readapi;
GRANT SELECT ON governance.metric_definition_current_v1
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
`;
