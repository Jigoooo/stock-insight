// 028 — P0-3: allow BOTH orientations for impact-path step endpoints.
//
// The sealed snapshot stores each structural relation once with a canonical
// (subject, object) ordering. Structural predicates in the V2 snapshot
// (SAME_ETF_BASKET, PRODUCT_SIMILARITY, CLASSIFIED_AS pairs, COMMON_OWNER)
// are symmetric, so an impact walk may traverse an edge in either direction.
// The previous guard forced step (from,to) = edge (subject,object) exactly,
// which silently forbade reverse traversal. This migration relaxes ONLY that
// endpoint check to accept either orientation; every other invariant —
// same-snapshot anchoring, building-only step inserts, chain linkage
// (lag(to)=from), hop-count/source/target agreement at seal time, append-only
// — is unchanged.

export const undirectedImpactStepGuardMigrationSql = `
CREATE OR REPLACE FUNCTION analytics.guard_graph_artifact_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_anchor_snapshot_id BIGINT;
  v_required_status TEXT;
  v_actual_status TEXT;
  v_snapshot_as_of TIMESTAMPTZ;
  v_snapshot_known_at TIMESTAMPTZ;
  v_relation_matches BOOLEAN;
  v_parent_status TEXT;
  v_endpoint_matches BOOLEAN;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME USING ERRCODE='55000';
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'graph_snapshot_edge' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'building';
    WHEN 'graph_snapshot_degree' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'building';
    WHEN 'relation_measurement' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'sealed';
    WHEN 'graph_community' THEN
      v_snapshot_id := NEW.graph_snapshot_id;
      v_required_status := 'sealed';
    WHEN 'impact_path_step' THEN
      SELECT path.graph_snapshot_id,
             edge.graph_snapshot_id,
             path.status,
             (edge.subject_entity_id = NEW.from_entity_id
                AND edge.object_entity_id = NEW.to_entity_id)
             OR (edge.subject_entity_id = NEW.to_entity_id
                AND edge.object_entity_id = NEW.from_entity_id)
      INTO v_snapshot_id, v_anchor_snapshot_id, v_parent_status, v_endpoint_matches
      FROM analytics.impact_path_v2 path
      JOIN analytics.graph_snapshot_edge edge
        ON edge.graph_snapshot_edge_id = NEW.graph_snapshot_edge_id
      WHERE path.impact_path_v2_id = NEW.impact_path_v2_id
      FOR SHARE OF path;
      IF v_snapshot_id IS NULL OR v_anchor_snapshot_id IS DISTINCT FROM v_snapshot_id THEN
        RAISE EXCEPTION 'impact path step edge must belong to the same graph snapshot';
      END IF;
      IF v_parent_status IS DISTINCT FROM 'building' THEN
        RAISE EXCEPTION 'impact path steps may only be added while building';
      END IF;
      IF NOT v_endpoint_matches THEN
        RAISE EXCEPTION 'impact path step endpoints must match the referenced edge';
      END IF;
      v_required_status := 'sealed';
    WHEN 'graph_community_member' THEN
      SELECT community.graph_snapshot_id INTO v_snapshot_id
      FROM analytics.graph_community community
      WHERE community.graph_community_id = NEW.graph_community_id;
      v_required_status := 'sealed';
    ELSE
      RAISE EXCEPTION 'unsupported graph artifact table %', TG_TABLE_NAME;
  END CASE;
  SELECT snapshot.status, snapshot.as_of, snapshot.known_at
  INTO v_actual_status, v_snapshot_as_of, v_snapshot_known_at
  FROM analytics.graph_snapshot snapshot
  WHERE snapshot.graph_snapshot_id = v_snapshot_id
  FOR SHARE;
  IF v_actual_status IS DISTINCT FROM v_required_status THEN
    RAISE EXCEPTION '% insert requires graph snapshot status %', TG_TABLE_NAME, v_required_status;
  END IF;
  IF TG_TABLE_NAME = 'graph_snapshot_edge' THEN
    SELECT EXISTS (
      SELECT 1
      FROM knowledge.relation_revision revision
      JOIN knowledge.relation_identity identity_row
        ON identity_row.relation_identity_id = revision.relation_identity_id
      WHERE revision.relation_revision_id = NEW.relation_revision_id
        AND revision.relation_identity_id = NEW.relation_identity_id
        AND revision.revision_status = 'accepted'
        AND revision.valid_from <= v_snapshot_as_of
        AND (revision.valid_to IS NULL OR revision.valid_to > v_snapshot_as_of)
        AND revision.known_from <= v_snapshot_known_at
        AND NOT EXISTS (
          SELECT 1
          FROM knowledge.relation_revision newer
          WHERE newer.relation_identity_id = revision.relation_identity_id
            AND newer.revision_no > revision.revision_no
            AND newer.revision_status = 'accepted'
            AND newer.valid_from <= v_snapshot_as_of
            AND (newer.valid_to IS NULL OR newer.valid_to > v_snapshot_as_of)
            AND newer.known_from <= v_snapshot_known_at
        )
        AND identity_row.subject_entity_id = NEW.subject_entity_id
        AND identity_row.object_entity_id = NEW.object_entity_id
        AND identity_row.predicate = NEW.predicate
        AND revision.relation_kind = NEW.relation_kind
        AND revision.confidence = NEW.confidence
    ) INTO v_relation_matches;
    IF NOT v_relation_matches THEN
      RAISE EXCEPTION 'graph snapshot edge must match one accepted PIT relation revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;
`;
