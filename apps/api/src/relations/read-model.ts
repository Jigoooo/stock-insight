import type { UserScope } from '../shared/user-scope';

import {
  entityRelationGraphSchema,
  type EntityRelationGraph,
} from '@stock-insight/contracts/research-workspace';

export type RelationGraphQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetEntityRelationsOptions = {
  userScope: UserScope;
  entityKey: string;
  depth?: number;
  now?: Date;
};

type LatestRunRow = {
  analysis_run_id: string;
  analysis_revision: number;
  cutoff_at: string | Date;
  source_watermark_at: string | Date;
  fresh_until: string | Date;
  projection_status: string;
};

type RootEntityRow = {
  id: number | string;
  entity_key: string;
  label: string;
  market: string;
  watched: boolean;
  holding: boolean;
};

type RelationRow = {
  edge_id: string;
  relation_type: 'same_industry' | 'news_co_mention' | 'peer' | 'corroborates';
  direction: 'directed' | 'undirected';
  normalized_weight: number | string;
  evidence_quality: string | null;
  evidence_count: number | string;
  clickable_source_count: number | string;
  src_entity_key: string;
  src_label: string;
  src_market: string;
  src_watched: boolean;
  src_holding: boolean;
  dst_entity_key: string;
  dst_label: string;
  dst_market: string;
  dst_watched: boolean;
  dst_holding: boolean;
};

type MarketAsOfRow = { market_data_as_of: string | null };

const LATEST_RUN_SQL = `
  SELECT analysis_run_id, analysis_revision, cutoff_at, source_watermark_at,
         fresh_until, projection_status
  FROM ops.publication_projection_status
  WHERE domain = 'stock'
    AND projection_status IN ('available', 'stale')
  ORDER BY cutoff_at DESC, analysis_revision DESC
  LIMIT 1
`;

const ROOT_ENTITY_SQL = `
  SELECT
    root_entity.id,
    root_entity.entity_key,
    coalesce(nullif(root_entity.name, ''), root_entity.symbol, root_entity.entity_key) AS label,
    root_entity.market,
    EXISTS (
      SELECT 1 FROM public.user_watchlist watchlist
      WHERE watchlist.user_id = $2::uuid
        AND watchlist.entity_key = root_entity.entity_key
        AND watchlist.active = true
    ) AS watched,
    EXISTS (
      SELECT 1 FROM public.user_positions position
      WHERE position.user_id = $2::uuid
        AND position.entity_key = root_entity.entity_key
        AND position.closed_at IS NULL
    ) AS holding
  FROM public.entities root_entity
  WHERE root_entity.entity_key = $1
    AND root_entity.entity_key ~ '^(KR:[0-9]{6}|US:[A-Z][A-Z0-9]{0,7}([.-][A-Z0-9]{1,2})?)$'
  LIMIT 1
`;

const RELATIONS_SQL = `
  WITH RECURSIVE ranked_edges AS (
    SELECT
      edge.*,
      row_number() OVER (
        PARTITION BY edge.relation_key
        ORDER BY edge.revision DESC, edge.known_at DESC, edge.id DESC
      ) AS revision_rank
    FROM ops.temporal_graph_edge edge
    WHERE edge.known_at <= $2::timestamptz
      AND edge.valid_from <= $2::timestamptz
      AND (edge.valid_to IS NULL OR edge.valid_to > $2::timestamptz)
  ), as_of_edges AS (
    SELECT *
    FROM ranked_edges edge
    WHERE edge.revision_rank = 1
      AND edge.approved = true
      AND edge.inferred = false
      AND edge.edge_type IN ('SAME_INDUSTRY', 'NEWS_COMENTION', 'PEER_OF', 'CORROBORATES')
  ), walk(entity_id, depth, path) AS (
    SELECT $1::bigint, 0, ARRAY[$1::bigint]
    UNION ALL
    SELECT
      CASE WHEN edge.src_entity_id = walk.entity_id THEN edge.dst_entity_id ELSE edge.src_entity_id END,
      walk.depth + 1,
      walk.path || CASE
        WHEN edge.src_entity_id = walk.entity_id THEN edge.dst_entity_id
        ELSE edge.src_entity_id
      END
    FROM walk
    JOIN as_of_edges edge
      ON edge.src_entity_id = walk.entity_id OR edge.dst_entity_id = walk.entity_id
    WHERE walk.depth < $3::int
      AND NOT (
        CASE WHEN edge.src_entity_id = walk.entity_id THEN edge.dst_entity_id ELSE edge.src_entity_id END
        = ANY(walk.path)
      )
  ), selected_nodes AS (
    SELECT entity.id
    FROM (
      SELECT entity_id, min(depth) AS depth
      FROM walk
      GROUP BY entity_id
      ORDER BY min(depth) ASC, entity_id ASC
      LIMIT 20
    ) selected
    JOIN public.entities entity ON entity.id = selected.entity_id
    WHERE entity.entity_key ~ '^(KR:[0-9]{6}|US:[A-Z][A-Z0-9]{0,7}([.-][A-Z0-9]{1,2})?)$'
  ), selected_edges AS (
    SELECT edge.*,
           max(edge.weight) OVER (PARTITION BY edge.edge_type) AS max_type_weight
    FROM as_of_edges edge
    WHERE edge.src_entity_id IN (SELECT id FROM selected_nodes)
      AND edge.dst_entity_id IN (SELECT id FROM selected_nodes)
  )
  SELECT
    selected_edges.relation_key || ':' || selected_edges.revision::text AS edge_id,
    CASE selected_edges.edge_type
      WHEN 'SAME_INDUSTRY' THEN 'same_industry'
      WHEN 'NEWS_COMENTION' THEN 'news_co_mention'
      WHEN 'PEER_OF' THEN 'peer'
      ELSE 'corroborates'
    END AS relation_type,
    'undirected' AS direction,
    least(1, greatest(0,
      CASE WHEN selected_edges.max_type_weight > 1
        THEN selected_edges.weight / selected_edges.max_type_weight
        ELSE selected_edges.weight
      END
    )) AS normalized_weight,
    lower(coalesce(selected_edges.evidence_quality, 'medium')) AS evidence_quality,
    count(DISTINCT evidence.id)::int AS evidence_count,
    count(DISTINCT evidence.id) FILTER (WHERE nullif(source.url, '') IS NOT NULL)::int
      AS clickable_source_count,
    src.entity_key AS src_entity_key,
    coalesce(nullif(src.name, ''), src.symbol, src.entity_key) AS src_label,
    src.market AS src_market,
    EXISTS (
      SELECT 1 FROM public.user_watchlist watchlist
      WHERE watchlist.user_id = $4::uuid AND watchlist.entity_key = src.entity_key AND watchlist.active = true
    ) AS src_watched,
    EXISTS (
      SELECT 1 FROM public.user_positions position
      WHERE position.user_id = $4::uuid AND position.entity_key = src.entity_key AND position.closed_at IS NULL
    ) AS src_holding,
    dst.entity_key AS dst_entity_key,
    coalesce(nullif(dst.name, ''), dst.symbol, dst.entity_key) AS dst_label,
    dst.market AS dst_market,
    EXISTS (
      SELECT 1 FROM public.user_watchlist watchlist
      WHERE watchlist.user_id = $4::uuid AND watchlist.entity_key = dst.entity_key AND watchlist.active = true
    ) AS dst_watched,
    EXISTS (
      SELECT 1 FROM public.user_positions position
      WHERE position.user_id = $4::uuid AND position.entity_key = dst.entity_key AND position.closed_at IS NULL
    ) AS dst_holding
  FROM selected_edges
  JOIN public.entities src ON src.id = selected_edges.src_entity_id
  JOIN public.entities dst ON dst.id = selected_edges.dst_entity_id
  LEFT JOIN ops.temporal_graph_edge_evidence association
    ON association.temporal_edge_id = selected_edges.id
  LEFT JOIN ops.graph_evidence evidence ON evidence.id = association.evidence_id
  LEFT JOIN LATERAL (
    SELECT revision.url
    FROM ops.source_document_revision revision
    WHERE revision.source_key = evidence.source_key
      AND revision.known_at <= $2::timestamptz
    ORDER BY revision.known_at DESC, revision.revision_no DESC
    LIMIT 1
  ) source ON true
  GROUP BY selected_edges.relation_key, selected_edges.revision, selected_edges.edge_type,
           selected_edges.weight, selected_edges.max_type_weight, selected_edges.evidence_quality,
           src.id, src.entity_key, src.name, src.symbol, src.market,
           dst.id, dst.entity_key, dst.name, dst.symbol, dst.market
  ORDER BY normalized_weight DESC, edge_id ASC
  LIMIT 80
`;

const MARKET_AS_OF_SQL = `
  SELECT max(coalesce(nullif(collected_at, ''), nullif(snapshot_date, ''))) AS market_data_as_of
  FROM stock.market_snapshots
  WHERE symbol IS NOT NULL
`;

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid timestamp');
  return date.toISOString();
}

function toCount(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('Database returned an invalid count');
  return count;
}

function toWeight(value: number | string): number {
  const weight = Number(value);
  if (!Number.isFinite(weight)) throw new Error('Database returned an invalid relation weight');
  return Math.min(1, Math.max(0, weight));
}

function normalizeQuality(value: string | null): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizeMarket(value: string): 'KR' | 'US' {
  const normalized = value.toUpperCase();
  return ['US', 'NASDAQ', 'NYSE', 'AMEX'].includes(normalized) ? 'US' : 'KR';
}

export async function getEntityRelations(
  executor: RelationGraphQueryExecutor,
  options: GetEntityRelationsOptions,
): Promise<EntityRelationGraph | null> {
  if (!/^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/.test(options.entityKey)) {
    throw new Error('entityKey must be a canonical KR or US stock key');
  }
  const depth = options.depth ?? 1;
  if (!Number.isInteger(depth) || depth < 1 || depth > 2) {
    throw new Error('depth must be 1 or 2');
  }
  const now = options.now ?? new Date();
  const [latestRun] = await executor.queryRows<LatestRunRow>(LATEST_RUN_SQL);
  if (!latestRun) return null;
  const cutoffAt = toIso(latestRun.cutoff_at);
  const [root] = await executor.queryRows<RootEntityRow>(ROOT_ENTITY_SQL, [
    options.entityKey,
    options.userScope.userId,
  ]);
  if (!root) return null;
  const edgeRows = await executor.queryRows<RelationRow>(RELATIONS_SQL, [
    root.id,
    cutoffAt,
    depth,
    options.userScope.userId,
  ]);
  const [marketRow] = await executor.queryRows<MarketAsOfRow>(MARKET_AS_OF_SQL);

  const nodesByKey = new Map<string, EntityRelationGraph['nodes'][number]>();
  nodesByKey.set(root.entity_key, {
    entityKey: root.entity_key,
    label: root.label,
    market: normalizeMarket(root.market),
    watched: root.watched,
    holding: root.holding,
  });
  for (const row of edgeRows) {
    nodesByKey.set(row.src_entity_key, {
      entityKey: row.src_entity_key,
      label: row.src_label,
      market: normalizeMarket(row.src_market),
      watched: row.src_watched,
      holding: row.src_holding,
    });
    nodesByKey.set(row.dst_entity_key, {
      entityKey: row.dst_entity_key,
      label: row.dst_label,
      market: normalizeMarket(row.dst_market),
      watched: row.dst_watched,
      holding: row.dst_holding,
    });
  }
  const evidenceCount = edgeRows.reduce((sum, row) => sum + toCount(row.evidence_count), 0);
  const clickableSourceCount = edgeRows.reduce(
    (sum, row) => sum + toCount(row.clickable_source_count),
    0,
  );
  const freshUntil = toIso(latestRun.fresh_until);
  const limitation =
    evidenceCount === 0
      ? '관계 근거가 아직 연결되지 않음'
      : clickableSourceCount < evidenceCount
        ? '일부 관계 근거는 attribution만 제공되며 원문 링크 준비중'
        : '선택된 분석 시점의 승인된 관계 근거만 표시';

  return entityRelationGraphSchema.parse({
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt: now.toISOString(),
      freshness:
        latestRun.projection_status === 'available' &&
        now.getTime() <= new Date(freshUntil).getTime()
          ? 'available'
          : 'stale',
      contentSnapshot: {
        analysisRunId: latestRun.analysis_run_id,
        analysisRevision: latestRun.analysis_revision,
        analysisCutoffAt: cutoffAt,
        sourceWatermarkAt: toIso(latestRun.source_watermark_at),
        freshUntil,
      },
      graphSnapshot: {
        requestedAsOf: cutoffAt,
        knownThroughAt: cutoffAt,
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: {
        marketDataAsOf: marketRow?.market_data_as_of ? toIso(marketRow.market_data_as_of) : null,
      },
      sourceCoverage: {
        linked: evidenceCount,
        clickable: clickableSourceCount,
        total: evidenceCount,
      },
      qualityFlags: clickableSourceCount < evidenceCount ? ['graph_source_url_partial'] : [],
    },
    rootEntityKey: root.entity_key,
    depth,
    nodes: [...nodesByKey.values()].slice(0, 20),
    edges: edgeRows.map((row) => ({
      edgeId: row.edge_id,
      from: row.src_entity_key,
      to: row.dst_entity_key,
      relationType: row.relation_type,
      direction: row.direction,
      weight: toWeight(row.normalized_weight),
      approved: true,
      inferred: false,
      evidenceQuality: normalizeQuality(row.evidence_quality),
      evidenceCount: toCount(row.evidence_count),
      clickableSourceCount: toCount(row.clickable_source_count),
    })),
    evidenceSummary: { evidenceCount, clickableSourceCount, limitation },
  });
}
