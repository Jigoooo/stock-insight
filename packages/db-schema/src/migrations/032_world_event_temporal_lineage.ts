export const worldEventTemporalLineageMigrationSql = `
-- P1-W2 — World event, temporal lineage, and source provenance
-- (enhancement plan Task 2/3, P1-2·4·8·9·10·11·13).
-- Additive migration 032. Legacy knowledge.event rows are preserved and only
-- read for a one-to-one direct projection into the new canonical world.event
-- object; no legacy row is rewritten, renamed, or deleted.

CREATE SCHEMA IF NOT EXISTS world;

-- ── canonical event identity (stable key, mutable state lives in revisions) ───
CREATE TABLE IF NOT EXISTS world.event (
    event_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_key           TEXT NOT NULL UNIQUE,
    event_type          TEXT NOT NULL CHECK (length(btrim(event_type)) > 0),
    subject_scope       TEXT NOT NULL DEFAULT 'single_entity'
      CHECK (subject_scope IN ('single_entity','multi_entity','market','macro','sector')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(event_key)) > 0)
);

-- ── append-only bitemporal revision carrying lifecycle state ──────────────────
CREATE TABLE IF NOT EXISTS world.event_revision (
    event_revision_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id            BIGINT NOT NULL REFERENCES world.event(event_id),
    revision_no         INTEGER NOT NULL CHECK (revision_no > 0),
    lifecycle_state     TEXT NOT NULL
      CHECK (lifecycle_state IN (
        'rumored','announced','confirmed','effective','expired','repealed'
      )),
    summary_text        TEXT,
    magnitude           NUMERIC,
    magnitude_unit      TEXT,
    surprise_score      REAL,
    story_id            BIGINT,
    source_revision_id  BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    extraction_run_id   TEXT,
    published_at        TIMESTAMPTZ,
    available_at        TIMESTAMPTZ NOT NULL,
    known_at            TIMESTAMPTZ NOT NULL,
    valid_from          TIMESTAMPTZ,
    valid_until         TIMESTAMPTZ,
    supersedes_event_revision_id BIGINT REFERENCES world.event_revision(event_revision_id),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, revision_no),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (known_at >= available_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (
      (revision_no = 1 AND supersedes_event_revision_id IS NULL) OR
      (revision_no > 1 AND supersedes_event_revision_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_event_revision_pit
  ON world.event_revision (event_id, known_at, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_event_revision_source
  ON world.event_revision (source_revision_id);
CREATE INDEX IF NOT EXISTS ix_event_revision_story
  ON world.event_revision (story_id);

-- ── n-ary participants: entity role + optional geographic role ────────────────
CREATE TABLE IF NOT EXISTS world.event_participant (
    event_participant_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_revision_id   BIGINT NOT NULL REFERENCES world.event_revision(event_revision_id),
    entity_id           BIGINT REFERENCES core.entity(entity_id),
    participant_role    TEXT NOT NULL
      CHECK (participant_role IN (
        'actor','target','affected','counterparty','jurisdiction','issuer','regulator'
      )),
    location_role       TEXT
      CHECK (location_role IS NULL OR location_role IN (
        'source','actual','jurisdiction','target','affected'
      )),
    role_detail         JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(role_detail) = 'object'),
    CHECK (entity_id IS NOT NULL OR location_role IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_event_participant_revision
  ON world.event_participant (event_revision_id, participant_role);
CREATE INDEX IF NOT EXISTS ix_event_participant_entity
  ON world.event_participant (entity_id);

-- ── reified Contract/Regulation obligation anchored to an event revision ──────
CREATE TABLE IF NOT EXISTS world.reified_obligation (
    reified_obligation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_revision_id   BIGINT NOT NULL REFERENCES world.event_revision(event_revision_id),
    obligation_kind     TEXT NOT NULL CHECK (obligation_kind IN ('contract','regulation')),
    counterparty_entity_id BIGINT REFERENCES core.entity(entity_id),
    product             TEXT,
    amount              NUMERIC,
    currency            TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    period_start        DATE,
    period_end          DATE,
    obligation_status   TEXT NOT NULL DEFAULT 'proposed'
      CHECK (obligation_status IN ('proposed','active','fulfilled','breached','terminated','superseded')),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS ix_reified_obligation_revision
  ON world.reified_obligation (event_revision_id, obligation_kind);

-- ── story cluster: syndication, publisher, independent-source grouping ────────
CREATE TABLE IF NOT EXISTS ingestion.story (
    story_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_key           TEXT NOT NULL UNIQUE,
    publisher           TEXT,
    independent_group_id TEXT,
    near_duplicate_of_story_id BIGINT REFERENCES ingestion.story(story_id),
    first_published_at  TIMESTAMPTZ,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(story_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_story_independent_group
  ON ingestion.story (independent_group_id);

-- world.event_revision.story_id references the story cluster (added after story
-- exists so a fresh apply does not order-fail on the FK target).
DO $$ BEGIN
  ALTER TABLE world.event_revision
    ADD CONSTRAINT event_revision_story_fkey
    FOREIGN KEY (story_id) REFERENCES ingestion.story(story_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── content artifact lineage: raw / translation / parsed / OCR provenance ─────
CREATE TABLE IF NOT EXISTS ingestion.content_artifact (
    content_artifact_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    artifact_key        TEXT NOT NULL UNIQUE,
    artifact_kind       TEXT NOT NULL CHECK (artifact_kind IN ('raw','translation','parsed','ocr')),
    source_revision_id  BIGINT REFERENCES ingestion.source_revision(source_revision_id),
    source_record_identity_id BIGINT REFERENCES ingestion.source_record_identity(source_record_identity_id),
    original_artifact_id BIGINT REFERENCES ingestion.content_artifact(content_artifact_id),
    language_code       TEXT CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
    parser_version      TEXT,
    ocr_engine          TEXT,
    cell_or_span_locator JSONB,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(btrim(artifact_key)) > 0),
    CHECK (jsonb_typeof(metadata) = 'object'),
    CHECK (cell_or_span_locator IS NULL OR jsonb_typeof(cell_or_span_locator) = 'object'),
    CHECK (artifact_kind <> 'translation' OR original_artifact_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_content_artifact_source_revision
  ON ingestion.content_artifact (source_revision_id);
CREATE INDEX IF NOT EXISTS ix_content_artifact_original
  ON ingestion.content_artifact (original_artifact_id);

-- ── guards ────────────────────────────────────────────────────────────────────
-- Append-only revision with a forward-only lifecycle state machine. Later
-- lifecycle facts are new revisions; a row is never mutated in place.
CREATE OR REPLACE FUNCTION world.guard_event_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prev_state TEXT;
  v_prev_event BIGINT;
  v_prev_revision INTEGER;
  v_rank_prev INTEGER;
  v_rank_new INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'world.event_revision is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision_no > 1 THEN
    SELECT previous.event_id, previous.revision_no, previous.lifecycle_state
    INTO v_prev_event, v_prev_revision, v_prev_state
    FROM world.event_revision previous
    WHERE previous.event_revision_id = NEW.supersedes_event_revision_id
    FOR SHARE;
    IF v_prev_event IS DISTINCT FROM NEW.event_id
       OR v_prev_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'event supersession must reference the previous revision of the same event';
    END IF;
    -- Forward-only lifecycle: state rank must not decrease, and a terminal state
    -- may only be reached from confirmed/effective (no rumored->effective skip).
    v_rank_prev := CASE v_prev_state
      WHEN 'rumored' THEN 1 WHEN 'announced' THEN 2 WHEN 'confirmed' THEN 3
      WHEN 'effective' THEN 4 WHEN 'expired' THEN 5 WHEN 'repealed' THEN 5 END;
    v_rank_new := CASE NEW.lifecycle_state
      WHEN 'rumored' THEN 1 WHEN 'announced' THEN 2 WHEN 'confirmed' THEN 3
      WHEN 'effective' THEN 4 WHEN 'expired' THEN 5 WHEN 'repealed' THEN 5 END;
    IF v_rank_new < v_rank_prev THEN
      RAISE EXCEPTION 'invalid event lifecycle transition % -> %', v_prev_state, NEW.lifecycle_state;
    END IF;
    IF NEW.lifecycle_state IN ('expired','repealed') AND v_prev_state NOT IN ('confirmed','effective','expired','repealed') THEN
      RAISE EXCEPTION 'invalid event lifecycle transition % -> %', v_prev_state, NEW.lifecycle_state;
    END IF;
    IF NEW.lifecycle_state = 'effective' AND v_prev_state NOT IN ('announced','confirmed','effective') THEN
      RAISE EXCEPTION 'invalid event lifecycle transition % -> %', v_prev_state, NEW.lifecycle_state;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION world.reject_event_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

-- Translation artifacts must descend from an original of the same source record.
CREATE OR REPLACE FUNCTION ingestion.guard_content_artifact_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_original_record BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ingestion.content_artifact is append-only' USING ERRCODE = '55000';
  END IF;
  IF NEW.artifact_kind = 'translation' THEN
    IF NEW.original_artifact_id IS NULL THEN
      RAISE EXCEPTION 'translation artifact must reference an original artifact of the same source record';
    END IF;
    SELECT original.source_record_identity_id INTO v_original_record
    FROM ingestion.content_artifact original
    WHERE original.content_artifact_id = NEW.original_artifact_id
    FOR SHARE;
    IF NEW.source_record_identity_id IS DISTINCT FROM v_original_record THEN
      RAISE EXCEPTION 'translation artifact must reference an original artifact of the same source record';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── one-to-one direct-projection backfill of legacy knowledge.event ───────────
-- Each legacy dedupe_key becomes a story cluster; each legacy event becomes one
-- world.event + one revision 1. unverified legacy state maps to the most
-- conservative 'rumored'. No entity link is invented: a participant row is
-- projected only where a real target entity already exists.
INSERT INTO ingestion.story (story_key, first_published_at, metadata)
SELECT DISTINCT 'legacy-event:'||event.dedupe_key,
       min(event.announced_at) OVER (PARTITION BY event.dedupe_key),
       jsonb_build_object('backfill_policy','p1-w2-legacy-v1')
FROM knowledge.event event
ON CONFLICT (story_key) DO NOTHING;

INSERT INTO world.event (event_key, event_type, subject_scope)
SELECT 'legacy-event:'||event.event_id::text,
       event.event_type,
       'single_entity'
FROM knowledge.event event
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO world.event_revision (
  event_id, revision_no, lifecycle_state, summary_text, magnitude, magnitude_unit,
  surprise_score, story_id, source_revision_id, extraction_run_id,
  published_at, available_at, known_at, valid_from, metadata
)
SELECT world_event.event_id,
       1,
       'rumored',
       event.summary_text,
       event.magnitude,
       event.magnitude_unit,
       event.surprise_score,
       story.story_id,
       NULL,
       event.extraction_run_id,
       event.announced_at,
       event.announced_at,
       greatest(event.announced_at, event.created_at),
       event.occurred_at,
       jsonb_build_object(
         'backfill_policy','p1-w2-legacy-v1',
         'legacy_event_id',event.event_id,
         'legacy_verification_status',event.verification_status
       )
FROM knowledge.event event
JOIN world.event world_event
  ON world_event.event_key = 'legacy-event:'||event.event_id::text
LEFT JOIN ingestion.story story
  ON story.story_key = 'legacy-event:'||event.dedupe_key
WHERE NOT EXISTS (
  SELECT 1 FROM world.event_revision existing
  WHERE existing.event_id = world_event.event_id AND existing.revision_no = 1
);

INSERT INTO world.event_participant (
  event_revision_id, entity_id, participant_role, role_detail
)
SELECT revision.event_revision_id,
       event.target_entity_id,
       'target',
       jsonb_build_object('backfill_policy','p1-w2-legacy-v1')
FROM knowledge.event event
JOIN world.event world_event
  ON world_event.event_key = 'legacy-event:'||event.event_id::text
JOIN world.event_revision revision
  ON revision.event_id = world_event.event_id AND revision.revision_no = 1
WHERE event.target_entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM world.event_participant existing
    WHERE existing.event_revision_id = revision.event_revision_id
      AND existing.participant_role = 'target'
      AND existing.entity_id IS NOT DISTINCT FROM event.target_entity_id
  );

DO $$
DECLARE
  v_legacy BIGINT;
  v_events BIGINT;
  v_revisions BIGINT;
  v_orphan BIGINT;
BEGIN
  SELECT count(*) INTO v_legacy FROM knowledge.event;
  SELECT count(*) INTO v_events
  FROM world.event WHERE event_key LIKE 'legacy-event:%';
  SELECT count(*) INTO v_revisions
  FROM world.event_revision revision
  JOIN world.event world_event USING (event_id)
  WHERE world_event.event_key LIKE 'legacy-event:%' AND revision.revision_no = 1;
  IF v_events <> v_legacy OR v_revisions <> v_legacy THEN
    RAISE EXCEPTION 'P1-W2 world-event backfill parity mismatch: legacy=% events=% revisions=%',
      v_legacy, v_events, v_revisions;
  END IF;
  SELECT count(*) INTO v_orphan
  FROM world.event_participant participant
  LEFT JOIN world.event_revision revision USING (event_revision_id)
  WHERE revision.event_revision_id IS NULL;
  IF v_orphan <> 0 THEN
    RAISE EXCEPTION 'P1-W2 world-event backfill produced % orphan participants', v_orphan;
  END IF;
END $$;

-- ── install guards after the validated backfill ──────────────────────────────
DROP TRIGGER IF EXISTS event_revision_write_guard ON world.event_revision;
CREATE TRIGGER event_revision_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON world.event_revision
FOR EACH ROW EXECUTE FUNCTION world.guard_event_revision_write();

DROP TRIGGER IF EXISTS event_participant_write_guard ON world.event_participant;
CREATE TRIGGER event_participant_write_guard
BEFORE UPDATE OR DELETE ON world.event_participant
FOR EACH ROW EXECUTE FUNCTION world.reject_event_child_mutation();

DROP TRIGGER IF EXISTS reified_obligation_write_guard ON world.reified_obligation;
CREATE TRIGGER reified_obligation_write_guard
BEFORE UPDATE OR DELETE ON world.reified_obligation
FOR EACH ROW EXECUTE FUNCTION world.reject_event_child_mutation();

DROP TRIGGER IF EXISTS content_artifact_write_guard ON ingestion.content_artifact;
CREATE TRIGGER content_artifact_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON ingestion.content_artifact
FOR EACH ROW EXECUTE FUNCTION ingestion.guard_content_artifact_write();

-- ── compatibility read path (legacy event bridge) ────────────────────────────
CREATE OR REPLACE VIEW world.v_event_legacy_bridge_v1 AS
SELECT world_event.event_id,
       world_event.event_key,
       world_event.event_type,
       revision.lifecycle_state,
       revision.summary_text,
       revision.available_at,
       revision.known_at,
       revision.valid_from,
       (revision.metadata->>'legacy_event_id')::bigint AS legacy_event_id
FROM world.event world_event
JOIN world.event_revision revision
  ON revision.event_id = world_event.event_id AND revision.revision_no = 1
WHERE world_event.event_key LIKE 'legacy-event:%';

-- ── least-privilege grants (append + read; no delete) ────────────────────────
GRANT USAGE ON SCHEMA world TO si_knowledge, si_analytics, si_publisher, si_readapi;
GRANT SELECT, INSERT ON
  world.event,
  world.event_revision,
  world.event_participant,
  world.reified_obligation,
  ingestion.story,
  ingestion.content_artifact
TO si_knowledge;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA world TO si_knowledge, si_analytics, si_publisher;

GRANT SELECT ON
  world.event,
  world.event_revision,
  world.event_participant,
  world.reified_obligation,
  ingestion.story,
  ingestion.content_artifact,
  world.v_event_legacy_bridge_v1
TO si_analytics, si_publisher, si_readapi;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA world TO stock_insight_app_reader;
    GRANT SELECT ON
      world.event,
      world.event_revision,
      world.event_participant,
      world.reified_obligation,
      ingestion.story,
      ingestion.content_artifact,
      world.v_event_legacy_bridge_v1
    TO stock_insight_app_reader;
  END IF;
END $$;
`;
