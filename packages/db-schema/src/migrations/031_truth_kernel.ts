export const truthKernelMigrationSql = `
-- P1-W1 — Truth kernel: assertion, numeric fact, derivation DAG, coverage,
-- conflict/supersession (enhancement plan §8.1, §8.3-§8.6).
-- Additive migration 031. Existing content-pack items receive a one-to-one
-- direct-projection derivation; no legacy typed anchor or published digest is
-- rewritten. New pack items must point to one sealed derivation.

CREATE SCHEMA IF NOT EXISTS world;
CREATE SCHEMA IF NOT EXISTS governance;

-- ── assertion: the minimum source-backed statement unit ─────────────────────
CREATE TABLE IF NOT EXISTS knowledge.assertion (
    assertion_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    assertion_key       TEXT NOT NULL,
    revision_no         INTEGER NOT NULL CHECK (revision_no > 0),
    source_revision_id  BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    subject_entity_id   BIGINT NOT NULL REFERENCES core.entity(entity_id),
    predicate_key       TEXT NOT NULL CHECK (length(btrim(predicate_key)) > 0),
    predicate_ontology_revision_id BIGINT
      REFERENCES knowledge.predicate_ontology_revision(predicate_ontology_revision_id),
    object_entity_id    BIGINT REFERENCES core.entity(entity_id),
    literal_value       JSONB,
    polarity            TEXT NOT NULL
      CHECK (polarity IN ('affirmed','negated')),
    modality            TEXT NOT NULL
      CHECK (modality IN ('factual','planned','possible','alleged','forecast')),
    attribution_entity_id BIGINT REFERENCES core.entity(entity_id),
    quotation_scope     TEXT NOT NULL
      CHECK (quotation_scope IN ('direct','indirect','summary','table_cell','xbrl_fact')),
    valid_time_start    TIMESTAMPTZ,
    valid_time_end      TIMESTAMPTZ,
    published_at        TIMESTAMPTZ,
    available_at        TIMESTAMPTZ NOT NULL,
    known_at            TIMESTAMPTZ NOT NULL,
    source_span_locator JSONB NOT NULL,
    parser_version      TEXT NOT NULL CHECK (length(btrim(parser_version)) > 0),
    extraction_run_id   TEXT NOT NULL CHECK (length(btrim(extraction_run_id)) > 0),
    verification_state  TEXT NOT NULL DEFAULT 'extracted'
      CHECK (verification_state IN (
        'extracted','verified_span','verified_semantics','accepted',
        'contradicted','superseded','retracted','quarantined'
      )),
    supersedes_assertion_id BIGINT REFERENCES knowledge.assertion(assertion_id),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (assertion_key, revision_no),
    CHECK (length(btrim(assertion_key)) > 0),
    CHECK (num_nonnulls(object_entity_id, literal_value) = 1),
    CHECK (jsonb_typeof(source_span_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (valid_time_end IS NULL OR valid_time_start IS NULL OR valid_time_end > valid_time_start),
    CHECK (known_at >= available_at),
    CHECK (
      (revision_no = 1 AND supersedes_assertion_id IS NULL) OR
      (revision_no > 1 AND supersedes_assertion_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_assertion_subject_pit
  ON knowledge.assertion (subject_entity_id, predicate_key, valid_time_start, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_assertion_source_revision
  ON knowledge.assertion (source_revision_id, verification_state);

-- ── normalized numeric facts: unit, period, dimension, locator, restatement ──
CREATE TABLE IF NOT EXISTS world.numeric_fact (
    numeric_fact_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fact_key            TEXT NOT NULL,
    revision_no         INTEGER NOT NULL CHECK (revision_no > 0),
    entity_id           BIGINT NOT NULL REFERENCES core.entity(entity_id),
    concept_namespace   TEXT NOT NULL CHECK (length(btrim(concept_namespace)) > 0),
    concept_key         TEXT NOT NULL CHECK (length(btrim(concept_key)) > 0),
    value               NUMERIC NOT NULL,
    unit                TEXT NOT NULL CHECK (length(btrim(unit)) > 0),
    currency            TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    scale_power         INTEGER NOT NULL DEFAULT 0 CHECK (scale_power BETWEEN -18 AND 18),
    period_start        DATE,
    period_end          DATE,
    instant_at          TIMESTAMPTZ,
    fiscal_year         INTEGER CHECK (fiscal_year IS NULL OR fiscal_year BETWEEN 1800 AND 3000),
    fiscal_quarter      INTEGER CHECK (fiscal_quarter IS NULL OR fiscal_quarter BETWEEN 1 AND 4),
    dimensions_json     JSONB NOT NULL DEFAULT '{}',
    restatement_group_key TEXT NOT NULL,
    original_cell_or_xbrl_locator JSONB NOT NULL,
    source_revision_id  BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
    available_at        TIMESTAMPTZ NOT NULL,
    known_at            TIMESTAMPTZ NOT NULL,
    supersedes_numeric_fact_id BIGINT REFERENCES world.numeric_fact(numeric_fact_id),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fact_key, revision_no),
    UNIQUE (restatement_group_key, revision_no),
    CHECK (length(btrim(fact_key)) > 0),
    CHECK (length(btrim(restatement_group_key)) > 0),
    CHECK (jsonb_typeof(dimensions_json) = 'object'),
    CHECK (jsonb_typeof(original_cell_or_xbrl_locator) = 'object'),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (instant_at IS NOT NULL AND period_start IS NULL AND period_end IS NULL) OR
      (instant_at IS NULL AND period_end IS NOT NULL AND (period_start IS NULL OR period_end >= period_start))
    ),
    CHECK (known_at >= available_at),
    CHECK (
      (revision_no = 1 AND supersedes_numeric_fact_id IS NULL) OR
      (revision_no > 1 AND supersedes_numeric_fact_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_numeric_fact_entity_concept_pit
  ON world.numeric_fact (entity_id, concept_namespace, concept_key, period_end, instant_at, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_numeric_fact_source_revision
  ON world.numeric_fact (source_revision_id);

-- ── derivation DAG: one sealed header, ordered steps, typed multi-inputs ──────
CREATE TABLE IF NOT EXISTS knowledge.derivation (
    derivation_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    derivation_key      TEXT NOT NULL UNIQUE,
    derivation_kind     TEXT NOT NULL
      CHECK (derivation_kind IN ('direct_projection','normalization','calculation','inference','report_statement')),
    method              TEXT NOT NULL CHECK (length(btrim(method)) > 0),
    method_version      TEXT NOT NULL CHECK (length(btrim(method_version)) > 0),
    status              TEXT NOT NULL DEFAULT 'building'
      CHECK (status IN ('building','sealed','superseded','failed')),
    step_count          INTEGER NOT NULL DEFAULT 0 CHECK (step_count >= 0),
    input_count         INTEGER NOT NULL DEFAULT 0 CHECK (input_count >= 0),
    derivation_digest   TEXT CHECK (derivation_digest IS NULL OR derivation_digest ~ '^[a-f0-9]{64}$'),
    created_by          TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sealed_at           TIMESTAMPTZ,
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (status = 'sealed' AND sealed_at IS NOT NULL AND derivation_digest IS NOT NULL) OR
      (status = 'superseded' AND sealed_at IS NOT NULL AND derivation_digest IS NOT NULL) OR
      (status IN ('building','failed') AND sealed_at IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS knowledge.derivation_step (
    derivation_step_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    derivation_id       BIGINT NOT NULL REFERENCES knowledge.derivation(derivation_id),
    step_no             INTEGER NOT NULL CHECK (step_no >= 1),
    activity_type       TEXT NOT NULL
      CHECK (activity_type IN ('direct_projection','normalization','calculation','aggregation','inference','render')),
    activity_version    TEXT NOT NULL CHECK (length(btrim(activity_version)) > 0),
    output_type         TEXT NOT NULL CHECK (length(btrim(output_type)) > 0),
    output_locator      JSONB NOT NULL,
    parameters          JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (derivation_id, step_no),
    CHECK (jsonb_typeof(output_locator) = 'object'),
    CHECK (jsonb_typeof(parameters) = 'object')
);

CREATE TABLE IF NOT EXISTS knowledge.derivation_input (
    derivation_input_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    derivation_step_id  BIGINT NOT NULL REFERENCES knowledge.derivation_step(derivation_step_id),
    input_no            INTEGER NOT NULL CHECK (input_no >= 1),
    input_kind          TEXT NOT NULL CHECK (input_kind IN (
      'source_revision','assertion','numeric_fact','relation_revision',
      'relation_evidence','impact_path','relation_measurement','derivation_step'
    )),
    source_revision_id  BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    assertion_id        BIGINT REFERENCES knowledge.assertion(assertion_id),
    numeric_fact_id     BIGINT REFERENCES world.numeric_fact(numeric_fact_id),
    relation_revision_id BIGINT REFERENCES knowledge.relation_revision(relation_revision_id),
    relation_evidence_ledger_id BIGINT
      REFERENCES knowledge.relation_evidence_ledger(relation_evidence_ledger_id),
    impact_path_v2_id   BIGINT REFERENCES analytics.impact_path_v2(impact_path_v2_id),
    relation_measurement_id BIGINT
      REFERENCES analytics.relation_measurement(relation_measurement_id),
    source_derivation_step_id BIGINT REFERENCES knowledge.derivation_step(derivation_step_id),
    input_role          TEXT NOT NULL DEFAULT 'evidence' CHECK (length(btrim(input_role)) > 0),
    input_digest        TEXT CHECK (input_digest IS NULL OR input_digest ~ '^[a-f0-9]{64}$'),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (derivation_step_id, input_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (num_nonnulls(
      source_revision_id,
      assertion_id,
      numeric_fact_id,
      relation_revision_id,
      relation_evidence_ledger_id,
      impact_path_v2_id,
      relation_measurement_id,
      source_derivation_step_id
    ) = 1),
    CHECK (
      (input_kind = 'source_revision' AND source_revision_id IS NOT NULL) OR
      (input_kind = 'assertion' AND assertion_id IS NOT NULL) OR
      (input_kind = 'numeric_fact' AND numeric_fact_id IS NOT NULL) OR
      (input_kind = 'relation_revision' AND relation_revision_id IS NOT NULL) OR
      (input_kind = 'relation_evidence' AND relation_evidence_ledger_id IS NOT NULL) OR
      (input_kind = 'impact_path' AND impact_path_v2_id IS NOT NULL) OR
      (input_kind = 'relation_measurement' AND relation_measurement_id IS NOT NULL) OR
      (input_kind = 'derivation_step' AND source_derivation_step_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_derivation_input_assertion
  ON knowledge.derivation_input (assertion_id) WHERE assertion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_derivation_input_numeric_fact
  ON knowledge.derivation_input (numeric_fact_id) WHERE numeric_fact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION knowledge.compute_derivation_digest(p_derivation_id BIGINT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(
    coalesce((
      SELECT jsonb_build_object(
        'derivationKey', derivation.derivation_key,
        'derivationKind', derivation.derivation_kind,
        'method', derivation.method,
        'methodVersion', derivation.method_version
      )::text
      FROM knowledge.derivation derivation
      WHERE derivation.derivation_id = p_derivation_id
    ), '') || E'\\n' || coalesce((
      SELECT string_agg(
        jsonb_build_object(
          'stepNo', step.step_no,
          'activityType', step.activity_type,
          'activityVersion', step.activity_version,
          'outputType', step.output_type,
          'outputLocator', step.output_locator,
          'parameters', step.parameters,
          'inputNo', input.input_no,
          'inputKind', input.input_kind,
          'inputRole', input.input_role,
          'inputDigest', input.input_digest,
          'anchorId', CASE input.input_kind
            WHEN 'source_revision' THEN input.source_revision_id::text
            WHEN 'assertion' THEN input.assertion_id::text
            WHEN 'numeric_fact' THEN input.numeric_fact_id::text
            WHEN 'relation_revision' THEN input.relation_revision_id::text
            WHEN 'relation_evidence' THEN input.relation_evidence_ledger_id::text
            WHEN 'impact_path' THEN input.impact_path_v2_id::text
            WHEN 'relation_measurement' THEN input.relation_measurement_id::text
            WHEN 'derivation_step' THEN source_step.step_no::text
          END
        )::text,
        E'\\n' ORDER BY step.step_no, input.input_no
      )
      FROM knowledge.derivation_step step
      JOIN knowledge.derivation_input input USING (derivation_step_id)
      LEFT JOIN knowledge.derivation_step source_step
        ON source_step.derivation_step_id = input.source_derivation_step_id
      WHERE step.derivation_id = p_derivation_id
    ), ''),
    'UTF8'
  )), 'hex')
$$;

CREATE OR REPLACE FUNCTION knowledge.guard_derivation_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_step_count BIGINT;
  v_input_count BIGINT;
  v_steps_without_input BIGINT;
  v_actual_digest TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'building' OR NEW.sealed_at IS NOT NULL
       OR NEW.derivation_digest IS NOT NULL OR NEW.step_count <> 0 OR NEW.input_count <> 0 THEN
      RAISE EXCEPTION 'derivation must start in empty building state';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'knowledge.derivation is append-only' USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW.derivation_id, NEW.derivation_key, NEW.derivation_kind, NEW.method,
    NEW.method_version, NEW.created_by, NEW.metadata, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.derivation_id, OLD.derivation_key, OLD.derivation_kind, OLD.method,
    OLD.method_version, OLD.created_by, OLD.metadata, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'derivation immutable fields cannot change' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'sealed' THEN
    IF NEW.sealed_at IS NULL OR NEW.derivation_digest IS NULL THEN
      RAISE EXCEPTION 'sealed derivation requires sealed_at and derivation_digest';
    END IF;
    SELECT count(*) INTO v_step_count
    FROM knowledge.derivation_step step
    WHERE step.derivation_id = OLD.derivation_id;
    SELECT count(*) INTO v_input_count
    FROM knowledge.derivation_input input
    JOIN knowledge.derivation_step step USING (derivation_step_id)
    WHERE step.derivation_id = OLD.derivation_id;
    SELECT count(*) INTO v_steps_without_input
    FROM knowledge.derivation_step step
    WHERE step.derivation_id = OLD.derivation_id
      AND NOT EXISTS (
        SELECT 1 FROM knowledge.derivation_input input
        WHERE input.derivation_step_id = step.derivation_step_id
      );
    IF v_step_count = 0 OR v_step_count <> NEW.step_count OR v_steps_without_input <> 0 THEN
      RAISE EXCEPTION 'derivation step count mismatch';
    END IF;
    IF v_input_count = 0 OR v_input_count <> NEW.input_count THEN
      RAISE EXCEPTION 'derivation input count mismatch';
    END IF;
    v_actual_digest := knowledge.compute_derivation_digest(OLD.derivation_id);
    IF v_actual_digest IS DISTINCT FROM NEW.derivation_digest THEN
      RAISE EXCEPTION 'derivation digest mismatch';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'failed'
     AND NEW.sealed_at IS NULL AND NEW.derivation_digest IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'sealed' AND NEW.status = 'superseded'
     AND NEW.sealed_at IS NOT DISTINCT FROM OLD.sealed_at
     AND NEW.derivation_digest IS NOT DISTINCT FROM OLD.derivation_digest
     AND NEW.step_count = OLD.step_count AND NEW.input_count = OLD.input_count THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid derivation status transition % -> %', OLD.status, NEW.status;
END $$;

CREATE OR REPLACE FUNCTION knowledge.guard_derivation_child_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_derivation_id BIGINT;
  v_derivation_status TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'derivation_step' THEN
    v_derivation_id := NEW.derivation_id;
  ELSE
    SELECT target_step.derivation_id INTO v_derivation_id
    FROM knowledge.derivation_step target_step
    WHERE target_step.derivation_step_id = NEW.derivation_step_id;
  END IF;
  SELECT derivation.status INTO v_derivation_status
  FROM knowledge.derivation derivation
  WHERE derivation.derivation_id = v_derivation_id
  FOR SHARE;
  IF v_derivation_status IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'derivation children may only be added while building';
  END IF;
  -- Nest the field access so PL/pgSQL only resolves NEW.source_derivation_step_id
  -- for derivation_input rows. derivation_step's NEW record has no such column,
  -- and a bare reference in a shared IF condition fails at runtime even when the
  -- TG_TABLE_NAME guard is false.
  IF TG_TABLE_NAME = 'derivation_input' THEN
    IF NEW.source_derivation_step_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM knowledge.derivation_step target_step
         JOIN knowledge.derivation_step source_step
           ON source_step.derivation_step_id = NEW.source_derivation_step_id
         WHERE target_step.derivation_step_id = NEW.derivation_step_id
           AND (
             source_step.derivation_id IS DISTINCT FROM target_step.derivation_id OR
             source_step.step_no >= target_step.step_no
           )
       ) THEN
      RAISE EXCEPTION 'derivation step input must reference an earlier step in the same derivation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── coverage: absence, partial collection, unknown, unavailable, N/A ─────────
CREATE TABLE IF NOT EXISTS governance.coverage_ledger (
    coverage_ledger_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coverage_key        TEXT NOT NULL,
    revision_no         INTEGER NOT NULL CHECK (revision_no > 0),
    entity_id           BIGINT NOT NULL REFERENCES core.entity(entity_id),
    predicate_or_fact_family TEXT NOT NULL CHECK (length(btrim(predicate_or_fact_family)) > 0),
    source_contract_revision_id BIGINT NOT NULL
      REFERENCES ingestion.source_contract_revision(source_contract_revision_id),
    coverage_period_start TIMESTAMPTZ NOT NULL,
    coverage_period_end TIMESTAMPTZ NOT NULL,
    expected_artifact_count BIGINT CHECK (expected_artifact_count IS NULL OR expected_artifact_count >= 0),
    observed_artifact_count BIGINT NOT NULL CHECK (observed_artifact_count >= 0),
    completeness_state  TEXT NOT NULL CHECK (completeness_state IN (
      'complete','partial','not_collected','source_unavailable','not_applicable'
    )),
    last_checked_at     TIMESTAMPTZ NOT NULL,
    gap_reason          TEXT,
    next_action         TEXT,
    supersedes_coverage_ledger_id BIGINT
      REFERENCES governance.coverage_ledger(coverage_ledger_id),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coverage_key, revision_no),
    CHECK (length(btrim(coverage_key)) > 0),
    CHECK (coverage_period_end > coverage_period_start),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      completeness_state IN ('complete','not_applicable') OR
      nullif(btrim(gap_reason), '') IS NOT NULL
    ),
    CHECK (
      (revision_no = 1 AND supersedes_coverage_ledger_id IS NULL) OR
      (revision_no > 1 AND supersedes_coverage_ledger_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_coverage_ledger_scope_pit
  ON governance.coverage_ledger (
    entity_id, predicate_or_fact_family, coverage_period_start, coverage_period_end,
    last_checked_at, revision_no DESC
  );

-- ── conflict/supersession: revisions replace deletion or history rewrite ────
CREATE TABLE IF NOT EXISTS knowledge.conflict_set (
    conflict_set_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conflict_key        TEXT NOT NULL,
    revision_no         INTEGER NOT NULL CHECK (revision_no > 0),
    record_status       TEXT NOT NULL DEFAULT 'building'
      CHECK (record_status IN ('building','sealed','failed')),
    resolution_state    TEXT NOT NULL DEFAULT 'unresolved'
      CHECK (resolution_state IN (
        'unresolved','resolved_by_later_official_source','resolved_by_manual_review','unresolvable'
      )),
    resolved_by_assertion_id BIGINT REFERENCES knowledge.assertion(assertion_id),
    resolution_reason   TEXT,
    member_count        INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
    known_from          TIMESTAMPTZ NOT NULL,
    supersedes_conflict_set_id BIGINT REFERENCES knowledge.conflict_set(conflict_set_id),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sealed_at           TIMESTAMPTZ,
    UNIQUE (conflict_key, revision_no),
    CHECK (length(btrim(conflict_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (
      (resolution_state = 'unresolved' AND resolved_by_assertion_id IS NULL) OR
      (resolution_state <> 'unresolved' AND resolved_by_assertion_id IS NOT NULL
        AND nullif(btrim(resolution_reason), '') IS NOT NULL)
    ),
    CHECK (
      (revision_no = 1 AND supersedes_conflict_set_id IS NULL) OR
      (revision_no > 1 AND supersedes_conflict_set_id IS NOT NULL)
    ),
    CHECK (
      (record_status = 'sealed' AND sealed_at IS NOT NULL) OR
      (record_status IN ('building','failed') AND sealed_at IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS knowledge.conflict_set_member (
    conflict_set_member_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conflict_set_id     BIGINT NOT NULL REFERENCES knowledge.conflict_set(conflict_set_id),
    assertion_id        BIGINT NOT NULL REFERENCES knowledge.assertion(assertion_id),
    related_assertion_id BIGINT NOT NULL REFERENCES knowledge.assertion(assertion_id),
    relation_type       TEXT NOT NULL
      CHECK (relation_type IN ('contradicts','supersedes','narrows','corrects')),
    rationale           TEXT NOT NULL CHECK (length(btrim(rationale)) > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conflict_set_id, assertion_id, related_assertion_id, relation_type),
    CHECK (assertion_id <> related_assertion_id)
);

CREATE OR REPLACE FUNCTION knowledge.guard_conflict_set_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_key TEXT;
  v_previous_revision INTEGER;
  v_member_count BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.record_status <> 'building' OR NEW.sealed_at IS NOT NULL OR NEW.member_count <> 0 THEN
      RAISE EXCEPTION 'conflict set must start in empty building state';
    END IF;
    IF NEW.revision_no > 1 THEN
      SELECT previous.conflict_key, previous.revision_no
      INTO v_previous_key, v_previous_revision
      FROM knowledge.conflict_set previous
      WHERE previous.conflict_set_id = NEW.supersedes_conflict_set_id;
      IF v_previous_key IS DISTINCT FROM NEW.conflict_key
         OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
        RAISE EXCEPTION 'conflict-set supersession must reference the previous revision of the same key';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'knowledge.conflict_set is append-only' USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW.conflict_set_id, NEW.conflict_key, NEW.revision_no, NEW.resolution_state,
    NEW.resolved_by_assertion_id, NEW.resolution_reason, NEW.known_from,
    NEW.supersedes_conflict_set_id, NEW.metadata, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.conflict_set_id, OLD.conflict_key, OLD.revision_no, OLD.resolution_state,
    OLD.resolved_by_assertion_id, OLD.resolution_reason, OLD.known_from,
    OLD.supersedes_conflict_set_id, OLD.metadata, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'conflict set immutable fields cannot change' USING ERRCODE = '55000';
  END IF;
  IF OLD.record_status = 'building' AND NEW.record_status = 'sealed' THEN
    SELECT count(*) INTO v_member_count
    FROM knowledge.conflict_set_member member
    WHERE member.conflict_set_id = OLD.conflict_set_id;
    IF NEW.sealed_at IS NULL OR v_member_count = 0 OR v_member_count <> NEW.member_count THEN
      RAISE EXCEPTION 'conflict set member_count mismatch';
    END IF;
    IF NEW.resolved_by_assertion_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM knowledge.conflict_set_member member
      WHERE member.conflict_set_id = OLD.conflict_set_id
        AND NEW.resolved_by_assertion_id IN (member.assertion_id, member.related_assertion_id)
    ) THEN
      RAISE EXCEPTION 'conflict resolution assertion must belong to the sealed set';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.record_status = 'building' AND NEW.record_status = 'failed'
     AND NEW.sealed_at IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid conflict-set status transition % -> %', OLD.record_status, NEW.record_status;
END $$;

CREATE OR REPLACE FUNCTION knowledge.guard_conflict_set_member_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_parent_status TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'knowledge.conflict_set_member is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT conflict.record_status INTO v_parent_status
  FROM knowledge.conflict_set conflict
  WHERE conflict.conflict_set_id = NEW.conflict_set_id
  FOR SHARE;
  IF v_parent_status IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'conflict members may only be added while building';
  END IF;
  RETURN NEW;
END $$;

-- Revision-chain guard shared by immutable assertion, numeric, and coverage rows.
CREATE OR REPLACE FUNCTION knowledge.guard_truth_revision_chain()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_previous_key TEXT;
  v_previous_revision INTEGER;
BEGIN
  IF TG_TABLE_SCHEMA = 'knowledge' AND TG_TABLE_NAME = 'assertion' THEN
    IF NEW.revision_no > 1 THEN
      SELECT previous.assertion_key, previous.revision_no
      INTO v_previous_key, v_previous_revision
      FROM knowledge.assertion previous
      WHERE previous.assertion_id = NEW.supersedes_assertion_id;
      IF v_previous_key IS DISTINCT FROM NEW.assertion_key
         OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
        RAISE EXCEPTION 'assertion supersession must reference the previous revision of the same key';
      END IF;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'world' AND TG_TABLE_NAME = 'numeric_fact' THEN
    IF NEW.revision_no > 1 THEN
      SELECT previous.fact_key, previous.revision_no
      INTO v_previous_key, v_previous_revision
      FROM world.numeric_fact previous
      WHERE previous.numeric_fact_id = NEW.supersedes_numeric_fact_id;
      IF v_previous_key IS DISTINCT FROM NEW.fact_key
         OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
        RAISE EXCEPTION 'numeric-fact supersession must reference the previous revision of the same key';
      END IF;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'governance' AND TG_TABLE_NAME = 'coverage_ledger' THEN
    IF NEW.revision_no > 1 THEN
      SELECT previous.coverage_key, previous.revision_no
      INTO v_previous_key, v_previous_revision
      FROM governance.coverage_ledger previous
      WHERE previous.coverage_ledger_id = NEW.supersedes_coverage_ledger_id;
      IF v_previous_key IS DISTINCT FROM NEW.coverage_key
         OR v_previous_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
        RAISE EXCEPTION 'coverage supersession must reference the previous revision of the same key';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION knowledge.reject_truth_kernel_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- ── one-to-one direct-projection backfill for every legacy content-pack item ─
ALTER TABLE serving.content_pack_item
  ADD COLUMN IF NOT EXISTS derivation_id BIGINT;

INSERT INTO knowledge.derivation (
  derivation_key, derivation_kind, method, method_version, created_by, metadata
)
SELECT 'content-pack-item:'||item.content_pack_item_id::text||':direct-v1',
       'direct_projection',
       'typed-anchor-direct-projection',
       'p1-w1-v1',
       'migration-031',
       jsonb_build_object(
         'backfill_policy','p1-w1-direct-v1',
         'content_pack_item_id',item.content_pack_item_id,
         'legacy_item_kind',item.item_kind
       )
FROM serving.content_pack_item item
WHERE item.derivation_id IS NULL
ON CONFLICT (derivation_key) DO NOTHING;

INSERT INTO knowledge.derivation_step (
  derivation_id, step_no, activity_type, activity_version,
  output_type, output_locator, parameters
)
SELECT derivation.derivation_id,
       1,
       'direct_projection',
       'p1-w1-v1',
       'content_pack_item',
       jsonb_build_object(
         'content_pack_item_id',item.content_pack_item_id,
         'content_pack_id',item.content_pack_id,
         'item_no',item.item_no
       ),
       jsonb_build_object('policy','preserve-existing-typed-anchor')
FROM serving.content_pack_item item
JOIN knowledge.derivation derivation
  ON derivation.derivation_key = 'content-pack-item:'||item.content_pack_item_id::text||':direct-v1'
WHERE derivation.status = 'building'
ON CONFLICT (derivation_id, step_no) DO NOTHING;

INSERT INTO knowledge.derivation_input (
  derivation_step_id, input_no, input_kind,
  relation_revision_id, relation_evidence_ledger_id,
  impact_path_v2_id, relation_measurement_id,
  input_role, metadata
)
SELECT step.derivation_step_id,
       1,
       CASE item.item_kind
         WHEN 'relation' THEN 'relation_revision'
         WHEN 'evidence' THEN 'relation_evidence'
         WHEN 'impact_path' THEN 'impact_path'
         WHEN 'measurement' THEN 'relation_measurement'
       END,
       item.relation_revision_id,
       item.relation_evidence_ledger_id,
       item.impact_path_v2_id,
       item.relation_measurement_id,
       'direct_source',
       jsonb_build_object('policy','p1-w1-direct-v1')
FROM serving.content_pack_item item
JOIN knowledge.derivation derivation
  ON derivation.derivation_key = 'content-pack-item:'||item.content_pack_item_id::text||':direct-v1'
JOIN knowledge.derivation_step step
  ON step.derivation_id = derivation.derivation_id AND step.step_no = 1
WHERE derivation.status = 'building'
ON CONFLICT (derivation_step_id, input_no) DO NOTHING;

-- The backfill is transaction-local and validated below. Install state-machine
-- triggers only after these pre-existing artifacts have been materialized.
UPDATE knowledge.derivation derivation
SET step_count = counts.step_count,
    input_count = counts.input_count,
    derivation_digest = knowledge.compute_derivation_digest(derivation.derivation_id),
    status = 'sealed',
    sealed_at = clock_timestamp()
FROM (
  SELECT step.derivation_id,
         count(DISTINCT step.derivation_step_id)::integer AS step_count,
         count(input.derivation_input_id)::integer AS input_count
  FROM knowledge.derivation_step step
  LEFT JOIN knowledge.derivation_input input USING (derivation_step_id)
  GROUP BY step.derivation_id
) counts
WHERE counts.derivation_id = derivation.derivation_id
  AND derivation.status = 'building'
  AND derivation.metadata->>'backfill_policy' = 'p1-w1-direct-v1';

-- Migration 026 intentionally makes item rows append-only. Keep that safety
-- property even if a runner does not wrap the whole migration in one transaction:
-- a temporary fail-closed trigger permits only the exact NULL-to-direct-FK
-- projection, blocks inserts/deletes, and remains installed across a crash.
CREATE OR REPLACE FUNCTION serving.guard_content_pack_derivation_backfill()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_derivation_key TEXT;
  v_derivation_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'content pack item inserts are paused during derivation backfill'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'serving.content_pack_item is append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.derivation_id IS NULL AND NEW.derivation_id IS NOT NULL
     AND ROW(
       NEW.content_pack_item_id, NEW.content_pack_id, NEW.item_no, NEW.item_kind,
       NEW.relation_revision_id, NEW.relation_evidence_ledger_id,
       NEW.impact_path_v2_id, NEW.relation_measurement_id,
       NEW.display_payload
     ) IS NOT DISTINCT FROM ROW(
       OLD.content_pack_item_id, OLD.content_pack_id, OLD.item_no, OLD.item_kind,
       OLD.relation_revision_id, OLD.relation_evidence_ledger_id,
       OLD.impact_path_v2_id, OLD.relation_measurement_id,
       OLD.display_payload
     ) THEN
    SELECT derivation.derivation_key, derivation.status
    INTO v_derivation_key, v_derivation_status
    FROM knowledge.derivation derivation
    WHERE derivation.derivation_id = NEW.derivation_id
    FOR SHARE;
    IF v_derivation_status = 'sealed'
       AND v_derivation_key = 'content-pack-item:'||OLD.content_pack_item_id::text||':direct-v1' THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'serving.content_pack_item is append-only' USING ERRCODE = '55000';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'serving.content_pack_item'::regclass
      AND tgname = 'content_pack_derivation_backfill_guard'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER content_pack_derivation_backfill_guard
    BEFORE INSERT OR UPDATE OR DELETE ON serving.content_pack_item
    FOR EACH ROW EXECUTE FUNCTION serving.guard_content_pack_derivation_backfill();
  END IF;
END $$;
ALTER TABLE serving.content_pack_item
  DISABLE TRIGGER content_pack_item_write_guard;

UPDATE serving.content_pack_item item
SET derivation_id = derivation.derivation_id
FROM knowledge.derivation derivation
WHERE item.derivation_id IS NULL
  AND derivation.derivation_key = 'content-pack-item:'||item.content_pack_item_id::text||':direct-v1';

DO $$
DECLARE
  v_missing BIGINT;
  v_bad_direct BIGINT;
BEGIN
  SELECT count(*) INTO v_missing
  FROM serving.content_pack_item item
  LEFT JOIN knowledge.derivation derivation USING (derivation_id)
  WHERE item.derivation_id IS NULL OR derivation.status IS DISTINCT FROM 'sealed';
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'P1-W1 derivation backfill incomplete: % pack items missing a sealed derivation', v_missing;
  END IF;

  SELECT count(*) INTO v_bad_direct
  FROM serving.content_pack_item item
  JOIN knowledge.derivation derivation USING (derivation_id)
  JOIN knowledge.derivation_step step
    ON step.derivation_id = derivation.derivation_id
  JOIN knowledge.derivation_input input
    ON input.derivation_step_id = step.derivation_step_id
  WHERE derivation.metadata->>'backfill_policy' = 'p1-w1-direct-v1'
    AND (
      derivation.derivation_kind <> 'direct_projection'
      OR derivation.step_count <> 1 OR derivation.input_count <> 1
      OR step.step_no <> 1 OR input.input_no <> 1
      OR input.relation_revision_id IS DISTINCT FROM item.relation_revision_id
      OR input.relation_evidence_ledger_id IS DISTINCT FROM item.relation_evidence_ledger_id
      OR input.impact_path_v2_id IS DISTINCT FROM item.impact_path_v2_id
      OR input.relation_measurement_id IS DISTINCT FROM item.relation_measurement_id
    );
  IF v_bad_direct <> 0 THEN
    RAISE EXCEPTION 'P1-W1 direct-projection mismatch: % pack items', v_bad_direct;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE serving.content_pack_item
    ADD CONSTRAINT content_pack_item_derivation_fkey
    FOREIGN KEY (derivation_id) REFERENCES knowledge.derivation(derivation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE serving.content_pack_item
    ADD CONSTRAINT uq_content_pack_item_derivation UNIQUE (derivation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE serving.content_pack_item
  ALTER COLUMN derivation_id SET NOT NULL;

-- Preserve migration 026 same-snapshot typed-anchor enforcement and add the
-- sealed derivation requirement. The published digest remains byte-compatible:
-- the direct derivation is a DB-enforced immutable projection of the anchor that
-- the digest already covers, not a new display-payload component.
CREATE OR REPLACE FUNCTION serving.guard_content_pack_item_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_pack_status TEXT;
  v_pack_snapshot_id BIGINT;
  v_anchor_matches BOOLEAN := false;
  v_derivation_status TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'serving.content_pack_item is append-only' USING ERRCODE='55000';
  END IF;
  SELECT derivation.status INTO v_derivation_status
  FROM knowledge.derivation derivation
  WHERE derivation.derivation_id = NEW.derivation_id
  FOR SHARE;
  IF v_derivation_status IS DISTINCT FROM 'sealed' THEN
    RAISE EXCEPTION 'content pack item requires one sealed derivation';
  END IF;
  SELECT pack.status, pack.graph_snapshot_id
  INTO v_pack_status, v_pack_snapshot_id
  FROM serving.content_pack pack
  WHERE pack.content_pack_id = NEW.content_pack_id
  FOR SHARE;
  IF v_pack_status IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'content pack items may only be added while building';
  END IF;
  IF NEW.relation_revision_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM analytics.graph_snapshot_edge edge
      WHERE edge.graph_snapshot_id = v_pack_snapshot_id
        AND edge.relation_revision_id = NEW.relation_revision_id
    ) INTO v_anchor_matches;
  ELSIF NEW.relation_evidence_ledger_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM knowledge.relation_evidence_ledger evidence
      JOIN knowledge.relation_revision revision
        ON revision.relation_identity_id = evidence.relation_identity_id
       AND revision.payload_hash = evidence.relation_payload_hash
      JOIN analytics.graph_snapshot_edge edge
        ON edge.relation_revision_id = revision.relation_revision_id
      WHERE evidence.relation_evidence_ledger_id = NEW.relation_evidence_ledger_id
        AND edge.graph_snapshot_id = v_pack_snapshot_id
    ) INTO v_anchor_matches;
  ELSIF NEW.impact_path_v2_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM analytics.impact_path_v2 path
      WHERE path.impact_path_v2_id = NEW.impact_path_v2_id
        AND path.graph_snapshot_id = v_pack_snapshot_id
        AND path.status = 'sealed'
    ) INTO v_anchor_matches;
  ELSIF NEW.relation_measurement_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM analytics.relation_measurement measurement
      WHERE measurement.relation_measurement_id = NEW.relation_measurement_id
        AND measurement.graph_snapshot_id = v_pack_snapshot_id
    ) INTO v_anchor_matches;
  END IF;
  IF NOT v_anchor_matches THEN
    RAISE EXCEPTION 'content pack item anchor must belong to the pack graph snapshot';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS content_pack_item_write_guard ON serving.content_pack_item;
CREATE TRIGGER content_pack_item_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON serving.content_pack_item
FOR EACH ROW EXECUTE FUNCTION serving.guard_content_pack_item_write();

DROP TRIGGER IF EXISTS content_pack_derivation_backfill_guard ON serving.content_pack_item;

-- Install mutation and state-machine guards after the validated backfill.
DROP TRIGGER IF EXISTS assertion_revision_guard ON knowledge.assertion;
CREATE TRIGGER assertion_revision_guard BEFORE INSERT ON knowledge.assertion
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_truth_revision_chain();
DROP TRIGGER IF EXISTS assertion_immutable ON knowledge.assertion;
CREATE TRIGGER assertion_immutable BEFORE UPDATE OR DELETE ON knowledge.assertion
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_truth_kernel_mutation();

DROP TRIGGER IF EXISTS numeric_fact_revision_guard ON world.numeric_fact;
CREATE TRIGGER numeric_fact_revision_guard BEFORE INSERT ON world.numeric_fact
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_truth_revision_chain();
DROP TRIGGER IF EXISTS numeric_fact_immutable ON world.numeric_fact;
CREATE TRIGGER numeric_fact_immutable BEFORE UPDATE OR DELETE ON world.numeric_fact
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_truth_kernel_mutation();

DROP TRIGGER IF EXISTS coverage_ledger_revision_guard ON governance.coverage_ledger;
CREATE TRIGGER coverage_ledger_revision_guard BEFORE INSERT ON governance.coverage_ledger
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_truth_revision_chain();
DROP TRIGGER IF EXISTS coverage_ledger_immutable ON governance.coverage_ledger;
CREATE TRIGGER coverage_ledger_immutable BEFORE UPDATE OR DELETE ON governance.coverage_ledger
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_truth_kernel_mutation();

DROP TRIGGER IF EXISTS derivation_write_guard ON knowledge.derivation;
CREATE TRIGGER derivation_write_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge.derivation
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_derivation_write();
DROP TRIGGER IF EXISTS derivation_step_write_guard ON knowledge.derivation_step;
CREATE TRIGGER derivation_step_write_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge.derivation_step
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_derivation_child_write();
DROP TRIGGER IF EXISTS derivation_input_write_guard ON knowledge.derivation_input;
CREATE TRIGGER derivation_input_write_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge.derivation_input
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_derivation_child_write();

DROP TRIGGER IF EXISTS conflict_set_write_guard ON knowledge.conflict_set;
CREATE TRIGGER conflict_set_write_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge.conflict_set
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_conflict_set_write();
DROP TRIGGER IF EXISTS conflict_set_member_write_guard ON knowledge.conflict_set_member;
CREATE TRIGGER conflict_set_member_write_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge.conflict_set_member
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_conflict_set_member_write();

-- Objects are created after earlier broad grants, so close capability privileges
-- explicitly. Truth writers can append; status updates are limited to state
-- machine columns; read roles cannot mutate history.
GRANT USAGE ON SCHEMA world, governance TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  knowledge.assertion,
  world.numeric_fact,
  governance.coverage_ledger,
  knowledge.conflict_set,
  knowledge.conflict_set_member
TO si_knowledge;
GRANT UPDATE (record_status, member_count, sealed_at) ON knowledge.conflict_set TO si_knowledge;

GRANT SELECT, INSERT ON
  knowledge.derivation,
  knowledge.derivation_step,
  knowledge.derivation_input
TO si_knowledge, si_analytics, si_publisher;
GRANT UPDATE (status, step_count, input_count, derivation_digest, sealed_at)
ON knowledge.derivation TO si_knowledge, si_analytics, si_publisher;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA knowledge TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA world TO si_knowledge;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance TO si_knowledge;

GRANT SELECT ON
  knowledge.assertion,
  knowledge.derivation,
  knowledge.derivation_step,
  knowledge.derivation_input,
  knowledge.conflict_set,
  knowledge.conflict_set_member,
  world.numeric_fact,
  governance.coverage_ledger
TO si_analytics, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA world, governance TO stock_insight_app_reader;
    GRANT SELECT ON
      knowledge.assertion,
      knowledge.derivation,
      knowledge.derivation_step,
      knowledge.derivation_input,
      knowledge.conflict_set,
      knowledge.conflict_set_member,
      world.numeric_fact,
      governance.coverage_ledger
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
