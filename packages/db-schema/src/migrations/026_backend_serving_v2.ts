export const backendServingV2MigrationSql = `
-- B8 — canonical Content Pack + relation/evidence/graph serving contract
-- (master plan §8 B8, migration 026). Purely additive. A content pack is the
-- canonical serving artifact: one entity × one pack kind × one SEALED graph
-- snapshot × one builder version, with a deterministic digest and a freshness
-- envelope. Items carry TYPED evidence FKs (relation revision / evidence
-- ledger / impact path) — never free-floating JSON claims. Legacy read paths
-- (ops.temporal_graph_edge) stay untouched; cutover happens at deploy gate.

CREATE SCHEMA IF NOT EXISTS serving;

CREATE TABLE IF NOT EXISTS serving.content_pack (
    content_pack_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pack_kind        TEXT NOT NULL
      CHECK (pack_kind IN ('entity_relation_graph','entity_evidence_digest','impact_brief')),
    entity_id        BIGINT NOT NULL REFERENCES core.entity(entity_id),
    graph_snapshot_id BIGINT NOT NULL REFERENCES analytics.graph_snapshot(graph_snapshot_id),
    builder_version  TEXT NOT NULL,
    pack_digest      TEXT NOT NULL CHECK (pack_digest ~ '^[a-f0-9]{64}$'),
    item_count       INTEGER NOT NULL CHECK (item_count >= 0),
    built_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    fresh_until      TIMESTAMPTZ NOT NULL,
    status           TEXT NOT NULL DEFAULT 'building'
      CHECK (status IN ('building','published','superseded','failed')),
    published_at     TIMESTAMPTZ,
    metadata         JSONB NOT NULL DEFAULT '{}',
    CHECK (fresh_until > built_at),
    CHECK (status <> 'published' OR published_at IS NOT NULL),
    UNIQUE (pack_kind, entity_id, graph_snapshot_id, builder_version)
);
CREATE INDEX IF NOT EXISTS ix_content_pack_entity_kind
  ON serving.content_pack (entity_id, pack_kind, status);

CREATE TABLE IF NOT EXISTS serving.content_pack_item (
    content_pack_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content_pack_id  BIGINT NOT NULL REFERENCES serving.content_pack(content_pack_id),
    item_no          INTEGER NOT NULL CHECK (item_no >= 1),
    item_kind        TEXT NOT NULL
      CHECK (item_kind IN ('relation','evidence','impact_path','measurement')),
    relation_revision_id BIGINT REFERENCES knowledge.relation_revision(relation_revision_id),
    relation_evidence_ledger_id BIGINT REFERENCES knowledge.relation_evidence_ledger(relation_evidence_ledger_id),
    impact_path_v2_id BIGINT REFERENCES analytics.impact_path_v2(impact_path_v2_id),
    relation_measurement_id BIGINT REFERENCES analytics.relation_measurement(relation_measurement_id),
    display_payload  JSONB NOT NULL DEFAULT '{}',
    UNIQUE (content_pack_id, item_no),
    -- Exactly one typed evidence anchor per item — no free-floating JSON facts.
    CHECK (num_nonnulls(
      relation_revision_id, relation_evidence_ledger_id,
      impact_path_v2_id, relation_measurement_id
    ) = 1),
    CHECK (
      (item_kind = 'relation' AND relation_revision_id IS NOT NULL) OR
      (item_kind = 'evidence' AND relation_evidence_ledger_id IS NOT NULL) OR
      (item_kind = 'impact_path' AND impact_path_v2_id IS NOT NULL) OR
      (item_kind = 'measurement' AND relation_measurement_id IS NOT NULL)
    )
);

CREATE OR REPLACE FUNCTION serving.canonical_jsonb_text(input_value JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_result TEXT;
BEGIN
  CASE jsonb_typeof(input_value)
    WHEN 'object' THEN
      SELECT '{' || coalesce(string_agg(
        to_jsonb(entry.key)::text || ':' || serving.canonical_jsonb_text(entry.value),
        ',' ORDER BY entry.key COLLATE "C"
      ), '') || '}' INTO v_result
      FROM jsonb_each(input_value) entry;
    WHEN 'array' THEN
      SELECT '[' || coalesce(string_agg(
        serving.canonical_jsonb_text(element.value),
        ',' ORDER BY element.ordinality
      ), '') || ']' INTO v_result
      FROM jsonb_array_elements(input_value) WITH ORDINALITY AS element(value, ordinality);
    ELSE
      v_result := input_value::text;
  END CASE;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION serving.compute_content_pack_digest(p_content_pack_id BIGINT)
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_pack serving.content_pack%ROWTYPE;
  v_items TEXT;
  v_payload TEXT;
BEGIN
  SELECT * INTO v_pack
  FROM serving.content_pack pack
  WHERE pack.content_pack_id = p_content_pack_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT '[' || coalesce(string_agg(
    '[' || item.item_no::text || ',' ||
    serving.canonical_jsonb_text(to_jsonb(item.item_kind)) || ',' ||
    coalesce(item.relation_revision_id::text, 'null') || ',' ||
    coalesce(item.relation_evidence_ledger_id::text, 'null') || ',' ||
    coalesce(item.impact_path_v2_id::text, 'null') || ',' ||
    coalesce(item.relation_measurement_id::text, 'null') || ',' ||
    serving.canonical_jsonb_text(item.display_payload) || ']',
    ',' ORDER BY item.item_no
  ), '') || ']' INTO v_items
  FROM serving.content_pack_item item
  WHERE item.content_pack_id = p_content_pack_id;
  v_payload :=
    '{"builderVersion":' || serving.canonical_jsonb_text(to_jsonb(v_pack.builder_version)) ||
    ',"entityId":' || v_pack.entity_id::text ||
    ',"graphSnapshotId":' || v_pack.graph_snapshot_id::text ||
    ',"items":' || v_items ||
    ',"packKind":' || serving.canonical_jsonb_text(to_jsonb(v_pack.pack_kind)) || '}';
  RETURN encode(sha256(convert_to(v_payload, 'UTF8')), 'hex');
END $$;

CREATE OR REPLACE FUNCTION serving.guard_content_pack_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_snapshot_status TEXT;
  v_item_count BIGINT;
  v_first_item INTEGER;
  v_last_item INTEGER;
  v_actual_digest TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT snapshot.status INTO v_snapshot_status
    FROM analytics.graph_snapshot snapshot
    WHERE snapshot.graph_snapshot_id = NEW.graph_snapshot_id
    FOR SHARE;
    IF NEW.status <> 'building'
       OR NEW.published_at IS NOT NULL
       OR v_snapshot_status IS DISTINCT FROM 'sealed' THEN
      RAISE EXCEPTION 'content pack must start building on a sealed graph snapshot';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'serving.content_pack is append-only' USING ERRCODE='55000';
  END IF;
  IF ROW(
    NEW.content_pack_id, NEW.pack_kind, NEW.entity_id, NEW.graph_snapshot_id,
    NEW.builder_version, NEW.pack_digest, NEW.item_count, NEW.built_at,
    NEW.fresh_until, NEW.metadata
  ) IS DISTINCT FROM ROW(
    OLD.content_pack_id, OLD.pack_kind, OLD.entity_id, OLD.graph_snapshot_id,
    OLD.builder_version, OLD.pack_digest, OLD.item_count, OLD.built_at,
    OLD.fresh_until, OLD.metadata
  ) THEN
    RAISE EXCEPTION 'content pack immutable fields cannot change' USING ERRCODE='55000';
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'published' THEN
    IF NEW.published_at IS NULL THEN
      RAISE EXCEPTION 'published content pack requires published_at';
    END IF;
    SELECT snapshot.status INTO v_snapshot_status
    FROM analytics.graph_snapshot snapshot
    WHERE snapshot.graph_snapshot_id = NEW.graph_snapshot_id
    FOR SHARE;
    IF v_snapshot_status IS DISTINCT FROM 'sealed' THEN
      RAISE EXCEPTION 'published content pack requires sealed graph snapshot';
    END IF;
    SELECT count(*), min(item.item_no), max(item.item_no)
    INTO v_item_count, v_first_item, v_last_item
    FROM serving.content_pack_item item
    WHERE item.content_pack_id = OLD.content_pack_id;
    IF v_item_count <> NEW.item_count
       OR (NEW.item_count > 0 AND (v_first_item <> 1 OR v_last_item <> NEW.item_count)) THEN
      RAISE EXCEPTION 'content pack item_count mismatch';
    END IF;
    v_actual_digest := serving.compute_content_pack_digest(OLD.content_pack_id);
    IF v_actual_digest IS DISTINCT FROM NEW.pack_digest THEN
      RAISE EXCEPTION 'content pack digest mismatch';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'building' AND NEW.status = 'failed' AND NEW.published_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'published'
     AND NEW.status = 'superseded'
     AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid content pack status transition % -> %', OLD.status, NEW.status;
END $$;

DROP TRIGGER IF EXISTS content_pack_write_guard ON serving.content_pack;
CREATE TRIGGER content_pack_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON serving.content_pack
FOR EACH ROW EXECUTE FUNCTION serving.guard_content_pack_write();

CREATE OR REPLACE FUNCTION serving.guard_content_pack_item_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_pack_status TEXT;
  v_pack_snapshot_id BIGINT;
  v_anchor_matches BOOLEAN := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'serving.content_pack_item is append-only' USING ERRCODE='55000';
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

-- Freshness view for the new graph read path: a pack is servable only while
-- fresh and only when its snapshot is sealed.
CREATE OR REPLACE VIEW serving.v_relation_graph_freshness AS
SELECT pack.content_pack_id,
       pack.pack_kind,
       pack.entity_id,
       pack.graph_snapshot_id,
       pack.builder_version,
       pack.pack_digest,
       pack.built_at,
       pack.fresh_until,
       pack.status,
       snapshot.as_of,
       snapshot.known_at,
       snapshot.snapshot_digest,
       (pack.status = 'published'
         AND snapshot.status = 'sealed'
         AND pack.fresh_until > now()) AS servable
FROM serving.content_pack pack
JOIN analytics.graph_snapshot snapshot USING (graph_snapshot_id);

-- New serving objects need explicit grants; grants from migration 007 only
-- covered objects that existed at that time.
GRANT USAGE ON SCHEMA serving TO si_publisher, si_readapi;
GRANT SELECT, INSERT ON serving.content_pack TO si_publisher;
GRANT UPDATE (status, published_at) ON serving.content_pack TO si_publisher;
GRANT SELECT, INSERT ON serving.content_pack_item TO si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA serving TO si_publisher;
GRANT SELECT ON serving.content_pack,
                serving.content_pack_item,
                serving.v_relation_graph_freshness
TO si_readapi;

-- Entity relation payloads are shared artifacts; watched/holding must be
-- overlaid from the caller's own rows. Keep this read surface RLS-scoped even
-- when legacy parent-role grants are absent or have drifted.
ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_positions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_watchlist, public.user_positions TO si_readapi;
DROP POLICY IF EXISTS relation_adapter_readapi_scope ON public.user_watchlist;
CREATE POLICY relation_adapter_readapi_scope ON public.user_watchlist
  FOR SELECT TO si_readapi
  USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
DROP POLICY IF EXISTS relation_adapter_readapi_boundary ON public.user_watchlist;
CREATE POLICY relation_adapter_readapi_boundary ON public.user_watchlist
  AS RESTRICTIVE
  FOR SELECT TO si_readapi
  USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
DROP POLICY IF EXISTS relation_adapter_readapi_scope ON public.user_positions;
CREATE POLICY relation_adapter_readapi_scope ON public.user_positions
  FOR SELECT TO si_readapi
  USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
DROP POLICY IF EXISTS relation_adapter_readapi_boundary ON public.user_positions;
CREATE POLICY relation_adapter_readapi_boundary ON public.user_positions
  AS RESTRICTIVE
  FOR SELECT TO si_readapi
  USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA serving TO stock_insight_app_reader;
    GRANT SELECT ON serving.content_pack_item,
                    serving.v_relation_graph_freshness
    TO stock_insight_app_reader;
    GRANT SELECT ON public.user_watchlist, public.user_positions
    TO stock_insight_app_reader;
    DROP POLICY IF EXISTS relation_adapter_app_reader_scope ON public.user_watchlist;
    CREATE POLICY relation_adapter_app_reader_scope ON public.user_watchlist
      FOR SELECT TO stock_insight_app_reader
      USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
    DROP POLICY IF EXISTS relation_adapter_app_reader_boundary ON public.user_watchlist;
    CREATE POLICY relation_adapter_app_reader_boundary ON public.user_watchlist
      AS RESTRICTIVE
      FOR SELECT TO stock_insight_app_reader
      USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
    DROP POLICY IF EXISTS relation_adapter_app_reader_scope ON public.user_positions;
    CREATE POLICY relation_adapter_app_reader_scope ON public.user_positions
      FOR SELECT TO stock_insight_app_reader
      USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
    DROP POLICY IF EXISTS relation_adapter_app_reader_boundary ON public.user_positions;
    CREATE POLICY relation_adapter_app_reader_boundary ON public.user_positions
      AS RESTRICTIVE
      FOR SELECT TO stock_insight_app_reader
      USING (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);
  END IF;
END $$;
`;
