export const releaseManifestMigrationSql = `
-- Release manifest: which projections a user surface is allowed to mix.
--
-- v2-final canonical/09 §3 and REQ-REL-001. Surfaces shown side by side must use
-- compatible snapshots. The as-built system already has the failure this prevents,
-- measured and written down: content pack supersession is atomic within a
-- pack_kind but not across kinds, so between two COMMITs entity_relation_graph
-- serves snapshot N while impact_brief still serves N-1. Nothing errors. The two
-- panels simply disagree, and a reader has no way to tell.
--
-- A manifest names the set and the release pointer moves once, so the window
-- closes instead of being narrowed.
--
-- WHY COMPONENTS ARE ROWS, NOT JSONB. The frozen schema models components as an
-- array, which is the right shape on the wire. In the database they are rows
-- because the question asked of them is relational — "which release last carried
-- this pack kind", "is any component stale" — and answering that against JSONB
-- means either a lateral unnest in every query or a GIN index defending a shape
-- no constraint enforces. The wire shape is rebuilt on read.
--
-- WHY safety_state IS A PLAIN COLUMN AND NOT A FOREIGN KEY. It records the state
-- the release was built under. That is a historical fact about the release, not a
-- pointer that should follow the current state as it changes — a manifest built
-- under CAUTION must keep saying CAUTION after the system returns to NORMAL, or
-- the audit trail rewrites itself.
--
-- GRANTS: pipeline roles only. See migration 078 on why the app roles get nothing
-- and why that means no boot-digest re-pin. K6/K7 grant and re-pin together when
-- a read path actually consumes the release pointer.

CREATE TABLE IF NOT EXISTS governance.release_manifest (
    release_id TEXT PRIMARY KEY
      CHECK (release_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),

    semantic_snapshot_id TEXT NOT NULL
      REFERENCES governance.semantic_snapshot(semantic_snapshot_id),

    built_at TIMESTAMPTZ NOT NULL,

    -- The product state this release was built under (canonical/00 §8).
    safety_state TEXT NOT NULL
      CHECK (safety_state IN ('NORMAL','CAUTION','INFORMATION_ONLY','HALTED')),

    release_state TEXT NOT NULL DEFAULT 'building'
      CHECK (release_state IN ('building','published','superseded','failed')),

    supersedes_release_id TEXT REFERENCES governance.release_manifest(release_id),

    component_count INTEGER NOT NULL DEFAULT 0 CHECK (component_count >= 0),
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),
    notes        TEXT,

    -- Same pairing rule migration 026 enforces for content packs: the state
    -- column and its timestamp cannot disagree, or neither is trustworthy.
    CHECK ((release_state = 'published') = (published_at IS NOT NULL)),
    CHECK (supersedes_release_id IS NULL OR supersedes_release_id <> release_id)
);

CREATE INDEX IF NOT EXISTS release_manifest_state_idx
  ON governance.release_manifest (release_state, built_at DESC);

CREATE INDEX IF NOT EXISTS release_manifest_snapshot_idx
  ON governance.release_manifest (semantic_snapshot_id, built_at DESC);

CREATE TABLE IF NOT EXISTS governance.release_component (
    release_component_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id TEXT NOT NULL REFERENCES governance.release_manifest(release_id),

    -- Free text rather than an enum: pack kinds are added by product work, and a
    -- CHECK list here would make every new surface a schema migration. The
    -- release is the thing being constrained, not the vocabulary of its parts.
    kind TEXT NOT NULL CHECK (length(btrim(kind)) > 0),

    snapshot_id TEXT NOT NULL CHECK (length(btrim(snapshot_id)) > 0),
    digest      TEXT NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    fresh_until TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One component per kind per release. Two rows for the same kind would make
    -- "which snapshot is this release serving for impact_brief" ambiguous, which
    -- is the exact question the manifest exists to answer.
    UNIQUE (release_id, kind)
);

CREATE INDEX IF NOT EXISTS release_component_kind_idx
  ON governance.release_component (kind, fresh_until DESC);

-- Append-only, with the same narrow state machine content packs use (026):
-- building -> published | failed, published -> superseded. Everything describing
-- what the release *is* freezes at insert.
CREATE OR REPLACE FUNCTION governance.reject_release_manifest_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.release_manifest is append-only (delete rejected for %)',
      OLD.release_id;
  END IF;

  IF NEW.release_id IS DISTINCT FROM OLD.release_id
     OR NEW.semantic_snapshot_id IS DISTINCT FROM OLD.semantic_snapshot_id
     OR NEW.built_at IS DISTINCT FROM OLD.built_at
     OR NEW.safety_state IS DISTINCT FROM OLD.safety_state
     OR NEW.supersedes_release_id IS DISTINCT FROM OLD.supersedes_release_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'governance.release_manifest identity is immutable (%)', OLD.release_id;
  END IF;

  IF NOT (
    (OLD.release_state = 'building' AND NEW.release_state IN ('building','published','failed'))
    OR (OLD.release_state = 'published' AND NEW.release_state IN ('published','superseded'))
    OR (OLD.release_state = NEW.release_state)
  ) THEN
    RAISE EXCEPTION 'governance.release_manifest illegal transition % -> % (%)',
      OLD.release_state, NEW.release_state, OLD.release_id;
  END IF;

  IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'governance.release_manifest published_at is immutable (%)', OLD.release_id;
  END IF;

  -- A published release is a claim about a fixed set of components. Letting the
  -- count move afterwards would let a release grow parts it never published.
  IF OLD.release_state <> 'building' AND NEW.component_count IS DISTINCT FROM OLD.component_count
  THEN
    RAISE EXCEPTION 'governance.release_manifest component_count is frozen once built (%)',
      OLD.release_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS release_manifest_append_only ON governance.release_manifest;
CREATE TRIGGER release_manifest_append_only
  BEFORE DELETE OR UPDATE ON governance.release_manifest
  FOR EACH ROW EXECUTE FUNCTION governance.reject_release_manifest_mutation();

-- Components may only be added while the release is still building. Adding one to
-- a published release would change what that release means after the fact, which
-- is the same defect the content pack guard closes for pack items.
CREATE OR REPLACE FUNCTION governance.guard_release_component_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_state TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'governance.release_component is append-only (% rejected)', TG_OP;
  END IF;

  SELECT release_state INTO parent_state
    FROM governance.release_manifest
   WHERE release_id = NEW.release_id
   FOR SHARE;

  IF parent_state IS NULL THEN
    RAISE EXCEPTION 'governance.release_component references an unknown release (%)',
      NEW.release_id;
  END IF;
  IF parent_state <> 'building' THEN
    RAISE EXCEPTION 'governance.release_component cannot be added to a % release (%)',
      parent_state, NEW.release_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS release_component_write_guard ON governance.release_component;
CREATE TRIGGER release_component_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON governance.release_component
  FOR EACH ROW EXECUTE FUNCTION governance.guard_release_component_write();

-- The current release per component kind. This is the read pointer REQ-REL-001
-- needs: every surface resolves its pack through one published release rather
-- than each computing its own latest, which is how the two panels drifted apart.
CREATE OR REPLACE VIEW governance.release_current_v1 AS
SELECT DISTINCT ON (component.kind)
       component.kind,
       manifest.release_id,
       manifest.semantic_snapshot_id,
       manifest.safety_state,
       component.snapshot_id,
       component.digest,
       component.fresh_until,
       manifest.built_at,
       component.fresh_until > now() AS fresh
  FROM governance.release_manifest manifest
  JOIN governance.release_component component ON component.release_id = manifest.release_id
 WHERE manifest.release_state = 'published'
 ORDER BY component.kind, manifest.built_at DESC, manifest.release_id DESC;

GRANT SELECT, INSERT ON governance.release_manifest, governance.release_component
  TO si_knowledge, si_analytics, si_publisher;
GRANT UPDATE (release_state, published_at, component_count, notes)
  ON governance.release_manifest TO si_analytics, si_publisher;
GRANT SELECT ON governance.release_manifest, governance.release_component,
  governance.release_current_v1 TO si_readapi;
GRANT SELECT ON governance.release_current_v1
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
`;
