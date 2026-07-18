export const graphAnalyticsFoundationMigrationSql = `
-- SET E / E-1: promote non-ticker entities to core, create knowledge.relation
-- (bitemporal) + relation_evidence, analytics layer (feature snapshots, impact
-- paths, themes), migrate the approved temporal graph, and add adj_close to OHLCV.
-- Additive only; ops.temporal_graph_edge stays as transitional source.

-- 1) Promote remaining legacy entity types into core.
--    theme->Theme, macro->Metric, org->LegalEntity, stage->Industry,
--    index->Metric, crypto->Token. ('source' rows are provenance, not entities.)
WITH type_map(legacy_type, core_type) AS (
  VALUES ('theme','Theme'), ('macro','Metric'), ('org','LegalEntity'),
         ('stage','Industry'), ('index','Metric'), ('crypto','Token')
), inserted AS (
  INSERT INTO core.entity (entity_type, canonical_name, country_code, metadata, created_at)
  SELECT type_map.core_type,
         coalesce(nullif(legacy.name, ''), legacy.symbol, legacy.entity_key),
         nullif(legacy.market, ''),
         jsonb_build_object('legacy_entity_key', legacy.entity_key,
                            'legacy_entity_type', legacy.entity_type,
                            'backfill', 'graph-promotion-v1'),
         coalesce(legacy.first_seen_at, now())
  FROM public.entities legacy
  JOIN type_map ON type_map.legacy_type = legacy.entity_type
  WHERE NOT EXISTS (
    SELECT 1 FROM core.entity_identifier ident
    WHERE ident.identifier_type = 'INTERNAL_KEY'
      AND ident.identifier_value = legacy.entity_key
  )
  RETURNING entity_id, metadata
)
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity_id, 'INTERNAL_KEY', metadata ->> 'legacy_entity_key' FROM inserted
ON CONFLICT DO NOTHING;

-- 2) knowledge.relation — bitemporal edge with provenance (Baseline §6.3).
CREATE TABLE IF NOT EXISTS knowledge.relation (
    relation_id         BIGSERIAL PRIMARY KEY,
    subject_entity_id   BIGINT NOT NULL REFERENCES core.entity(entity_id),
    predicate           TEXT NOT NULL,
    object_entity_id    BIGINT NOT NULL REFERENCES core.entity(entity_id),
    relation_kind       TEXT NOT NULL CHECK (relation_kind IN
                        ('structural','extracted','rule_derived','statistical','llm_hypothesis')),
    confidence          REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    source_quality      REAL,
    corroboration_count INTEGER NOT NULL DEFAULT 0,
    valid_from          TIMESTAMPTZ,
    valid_to            TIMESTAMPTZ,
    recorded_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_to         TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','pending','expired','rejected')),
    inference_run_id    TEXT,
    rule_version        TEXT,
    legacy_relation_key TEXT,             -- ops.temporal_graph_edge.relation_key (idempotency)
    metadata            JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_rel_legacy
  ON knowledge.relation (legacy_relation_key) WHERE legacy_relation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_rel_subject
  ON knowledge.relation (subject_entity_id, predicate)
  WHERE recorded_to IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_rel_object
  ON knowledge.relation (object_entity_id, predicate)
  WHERE recorded_to IS NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS knowledge.relation_evidence (
    relation_evidence_id BIGSERIAL PRIMARY KEY,
    evidence_key        TEXT NOT NULL UNIQUE,
    relation_id         BIGINT NOT NULL REFERENCES knowledge.relation(relation_id),
    document_id         BIGINT REFERENCES knowledge.document(document_id),
    chunk_id            BIGINT REFERENCES knowledge.document_chunk(chunk_id),
    claim_id            BIGINT REFERENCES knowledge.claim(claim_id),
    evidence_role       TEXT NOT NULL CHECK (evidence_role IN ('support','contradict','context')),
    evidence_text       TEXT,
    source_weight       REAL,
    CHECK (document_id IS NOT NULL OR chunk_id IS NOT NULL OR claim_id IS NOT NULL)
);

-- 3) Migrate approved, non-inferred current edges. relation_kind by edge class.
WITH edge_kind(edge_type, relation_kind) AS (
  VALUES ('SAME_INDUSTRY','structural'), ('SUPPLY_CHAIN','structural'), ('OWNS','structural'),
         ('ROLLS_UP','structural'), ('STAGE','structural'), ('SAME_ETF_BASKET','structural'),
         ('EXPOSES','structural'), ('PEER_OF','structural'), ('SAME_THEME','structural'),
         ('AFFECTS','structural'),
         ('COMMON_OWNER','statistical'), ('NEWS_COMENTION','statistical'),
         ('DIVERGENCE','statistical'), ('ACCELERATES','statistical'),
         ('DECELERATES','statistical'), ('CORROBORATES','statistical')
)
INSERT INTO knowledge.relation (
  subject_entity_id, predicate, object_entity_id, relation_kind, confidence,
  source_quality, valid_from, valid_to, recorded_from, status,
  legacy_relation_key, metadata
)
SELECT
  subject_ident.entity_id,
  edge.edge_type,
  object_ident.entity_id,
  edge_kind.relation_kind,
  least(1, greatest(0, coalesce(edge.weight, 0.5))),
  CASE lower(coalesce(edge.evidence_quality, 'medium'))
    WHEN 'high' THEN 0.9 WHEN 'low' THEN 0.3 ELSE 0.6 END,
  edge.valid_from,
  edge.valid_to,
  coalesce(edge.known_at, now()),
  'active',
  edge.relation_key || ':' || edge.revision::text,
  jsonb_build_object('legacy_graph_edge_id', edge.graph_edge_id,
                     'inference_kind', edge.inference_kind,
                     'backfill', 'temporal-graph-v1')
FROM ops.current_temporal_graph_edge edge
JOIN edge_kind ON edge_kind.edge_type = edge.edge_type
JOIN public.entities legacy_subject ON legacy_subject.id = edge.src_entity_id
JOIN core.entity_identifier subject_ident
  ON subject_ident.identifier_type = 'INTERNAL_KEY'
 AND subject_ident.identifier_value = legacy_subject.entity_key
JOIN public.entities legacy_object ON legacy_object.id = edge.dst_entity_id
JOIN core.entity_identifier object_ident
  ON object_ident.identifier_type = 'INTERNAL_KEY'
 AND object_ident.identifier_value = legacy_object.entity_key
WHERE edge.approved AND NOT edge.inferred
ON CONFLICT DO NOTHING;

-- 4) analytics layer.
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.asset_feature_snapshot (
    snapshot_id         BIGSERIAL PRIMARY KEY,
    asset_entity_id     BIGINT NOT NULL REFERENCES core.entity(entity_id),
    as_of               TIMESTAMPTZ NOT NULL,
    feature_set_version TEXT NOT NULL,
    features            JSONB NOT NULL,
    completeness_score  REAL NOT NULL,
    input_watermark     JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (asset_entity_id, as_of, feature_set_version)
);

CREATE TABLE IF NOT EXISTS analytics.impact_path (
    impact_path_id      BIGSERIAL PRIMARY KEY,
    trigger_event_id    BIGINT REFERENCES knowledge.event(event_id),
    target_entity_id    BIGINT NOT NULL REFERENCES core.entity(entity_id),
    path_nodes          BIGINT[] NOT NULL,
    path_edges          BIGINT[] NOT NULL,
    path_score          REAL NOT NULL,
    direction           TEXT NOT NULL CHECK (direction IN ('benefit','harm','mixed','unknown')),
    horizon             TEXT NOT NULL DEFAULT '1q',
    inference_kind      TEXT NOT NULL,
    explanation         JSONB NOT NULL,
    inference_run_id    TEXT NOT NULL,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trigger_event_id, target_entity_id, inference_run_id)
);
CREATE INDEX IF NOT EXISTS idx_analytics_ip_target
  ON analytics.impact_path (target_entity_id, path_score DESC);

CREATE TABLE IF NOT EXISTS analytics.theme (
    theme_id      BIGSERIAL PRIMARY KEY,
    theme_entity_id BIGINT NOT NULL UNIQUE REFERENCES core.entity(entity_id),
    theme_key     TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    definition    JSONB NOT NULL DEFAULT '{}',
    maturity      TEXT NOT NULL DEFAULT 'emerging',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics.theme_membership (
    theme_id      BIGINT NOT NULL REFERENCES analytics.theme(theme_id),
    entity_id     BIGINT NOT NULL REFERENCES core.entity(entity_id),
    tier          TEXT NOT NULL CHECK (tier IN ('core','adjacent','speculative')),
    rationale_relation_ids BIGINT[] NOT NULL DEFAULT '{}',
    valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to      TIMESTAMPTZ,
    PRIMARY KEY (theme_id, entity_id, valid_from)
);

-- 5) Theme objects + membership from migrated SAME_THEME relations.
--    Co-mention-derived membership starts as 'adjacent', never 'core' (Baseline §12.5).
INSERT INTO analytics.theme (theme_entity_id, theme_key, title, definition)
SELECT entity.entity_id,
       ident.identifier_value,
       entity.canonical_name,
       jsonb_build_object('origin', 'legacy_graph', 'inclusion', 'SAME_THEME edges')
FROM core.entity entity
JOIN core.entity_identifier ident
  ON ident.entity_id = entity.entity_id AND ident.identifier_type = 'INTERNAL_KEY'
WHERE entity.entity_type = 'Theme'
ON CONFLICT (theme_entity_id) DO NOTHING;

INSERT INTO analytics.theme_membership (theme_id, entity_id, tier, rationale_relation_ids)
SELECT DISTINCT theme.theme_id,
       CASE WHEN subject.entity_type = 'Theme' THEN relation.object_entity_id
            ELSE relation.subject_entity_id END,
       'adjacent',
       ARRAY[relation.relation_id]
FROM knowledge.relation relation
JOIN core.entity subject ON subject.entity_id = relation.subject_entity_id
JOIN core.entity object ON object.entity_id = relation.object_entity_id
JOIN analytics.theme theme
  ON theme.theme_entity_id = CASE WHEN subject.entity_type = 'Theme'
                                  THEN relation.subject_entity_id
                                  ELSE relation.object_entity_id END
WHERE relation.predicate = 'SAME_THEME'
  AND relation.status = 'active' AND relation.recorded_to IS NULL
  AND (subject.entity_type = 'Theme') <> (object.entity_type = 'Theme')
  AND NOT EXISTS (
    SELECT 1 FROM analytics.theme_membership existing
    WHERE existing.theme_id = theme.theme_id
      AND existing.entity_id = CASE WHEN subject.entity_type = 'Theme'
                                    THEN relation.object_entity_id
                                    ELSE relation.subject_entity_id END
      AND existing.valid_to IS NULL
  )
ON CONFLICT DO NOTHING;

-- 6) OHLCV adjusted-close columns (backfilled by script).
ALTER TABLE market_ts.ohlcv
  ADD COLUMN IF NOT EXISTS adj_close NUMERIC,
  ADD COLUMN IF NOT EXISTS adjustment_version TEXT;

-- 7) Grants.
DO $$
BEGIN
  GRANT USAGE ON SCHEMA analytics TO si_analytics, si_publisher, si_readapi;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA analytics TO si_analytics;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA analytics TO si_analytics;
  GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO si_publisher, si_readapi;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO stock_insight_app_reader;
  END IF;
END $$;
`;
