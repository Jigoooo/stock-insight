// P0-5 — entity relation adapter, V2-only (roadmap §4 P0-5 / V2-1·V2-2·V2-7).
// The UI contract (EntityRelationGraph) stays IDENTICAL; the V1 fallback path
// is REMOVED. Order of resolution:
//   1. servable v2 content pack (pack_kind='entity_relation_graph') with a
//      zod-valid graph in any item's display_payload.graph  → source 'v2_content_pack'
//   2. entity resolvable but no servable pack/graph         → source 'v2_no_data'
//      (an explicit V2 empty envelope built from the latest sealed snapshot —
//       "no confirmed relations in the V2 ledger", never silent legacy reads)
//   3. entity unresolvable or no sealed snapshot exists     → null graph
// Parity basis (2026-07-20 실측): every legacy fallback call across 257 roots
// returned an EMPTY graph, so the no-data envelope is behavior-identical.

import { getServableContentPack } from './graph-read-model-v2.ts';
import {
  entityRelationGraphSchema,
  type EntityRelationGraph,
} from '@stock-insight/contracts/research-workspace';

export type EntityRelationSourceExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

const ENTITY_BY_INTERNAL_KEY_SQL = `
SELECT identifier.entity_id, entity.canonical_name
FROM core.entity_identifier identifier
JOIN core.entity entity ON entity.entity_id = identifier.entity_id
WHERE identifier.identifier_type = 'INTERNAL_KEY'
  AND identifier.identifier_value = $1
LIMIT 1
`;

const LATEST_SERVABLE_HEADER_SQL = `
SELECT builder_version, as_of, known_at, built_at, fresh_until
FROM serving.v_relation_graph_freshness
WHERE pack_kind = 'entity_relation_graph'
  AND servable = true
ORDER BY built_at DESC
LIMIT 1
`;

const V2_SAVEPOINT = 'entity_relation_v2_preference';

const USER_RELATION_STATE_SQL = `
WITH requested AS (
  SELECT DISTINCT unnest($1::text[]) AS entity_key
)
SELECT
  requested.entity_key,
  EXISTS (
    SELECT 1 FROM public.user_watchlist watchlist
    WHERE watchlist.user_id = $2::uuid
      AND watchlist.entity_key = requested.entity_key
      AND watchlist.active = true
  ) AS watched,
  EXISTS (
    SELECT 1 FROM public.user_positions position
    WHERE position.user_id = $2::uuid
      AND position.entity_key = requested.entity_key
      AND position.closed_at IS NULL
  ) AS holding
FROM requested
ORDER BY requested.entity_key
`;

type UserRelationStateRow = {
  entity_key: string;
  watched: boolean;
  holding: boolean;
};

async function overlayUserRelationState(
  executor: EntityRelationSourceExecutor,
  graph: EntityRelationGraph,
  userId: string,
): Promise<EntityRelationGraph> {
  const entityKeys = [...new Set(graph.nodes.map((node) => node.entityKey))];
  const rows = await executor.queryRows<UserRelationStateRow>(USER_RELATION_STATE_SQL, [
    entityKeys,
    userId,
  ]);
  if (rows.length !== entityKeys.length) {
    throw new Error('user relation state coverage mismatch');
  }
  const expected = new Set(entityKeys);
  const byEntityKey = new Map<string, { watched: boolean; holding: boolean }>();
  for (const row of rows) {
    if (
      !expected.has(row.entity_key) ||
      typeof row.watched !== 'boolean' ||
      typeof row.holding !== 'boolean' ||
      byEntityKey.has(row.entity_key)
    ) {
      throw new Error('invalid user relation state row');
    }
    byEntityKey.set(row.entity_key, { watched: row.watched, holding: row.holding });
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, ...byEntityKey.get(node.entityKey)! })),
  };
}

export type EntityRelationAdapterResult<TGraph> =
  | { source: 'v2_content_pack'; graph: TGraph; packDigest: string }
  | { source: 'v2_no_data'; graph: TGraph }
  | { source: 'v2_unresolved'; graph: null };

export type GetEntityRelationsWithV2Options = {
  entityKey: string;
  depth: number;
  userId: string;
  now: Date;
};

const toIso = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('invalid timestamp for no-data envelope');
  return date.toISOString();
};

async function buildNoDataEnvelope(
  executor: EntityRelationSourceExecutor,
  options: GetEntityRelationsWithV2Options,
  entity: { canonicalName: string },
): Promise<EntityRelationGraph | null> {
  const headers = await executor.queryRows(LATEST_SERVABLE_HEADER_SQL);
  const header = headers[0];
  if (header === undefined) return null; // no sealed serving state at all
  const graph = entityRelationGraphSchema.parse({
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt: options.now.toISOString(),
      freshness: 'available',
      contentSnapshot: {
        analysisRunId: String(header['builder_version']),
        analysisRevision: 1,
        analysisCutoffAt: toIso(header['as_of']),
        sourceWatermarkAt: toIso(header['known_at']),
        freshUntil: toIso(header['fresh_until']),
      },
      graphSnapshot: {
        requestedAsOf: toIso(header['as_of']),
        knownThroughAt: toIso(header['known_at']),
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: { marketDataAsOf: null },
      sourceCoverage: { linked: 0, clickable: 0, total: 0 },
      qualityFlags: [],
    },
    rootEntityKey: options.entityKey,
    depth: options.depth,
    nodes: [
      {
        entityKey: options.entityKey,
        label: entity.canonicalName,
        market: options.entityKey.startsWith('KR:') ? 'KR' : 'US',
        watched: false,
        holding: false,
      },
    ],
    edges: [],
    evidenceSummary: {
      evidenceCount: 0,
      clickableSourceCount: 0,
      limitation: 'V2 관계 원장에서 이 종목과 확인된 관계가 없습니다',
    },
  });
  return overlayUserRelationState(executor, graph, options.userId);
}

export async function getEntityRelationsWithV2Preference(
  executor: EntityRelationSourceExecutor,
  options: GetEntityRelationsWithV2Options,
): Promise<EntityRelationAdapterResult<EntityRelationGraph>> {
  let packResultGraph: { graph: EntityRelationGraph; packDigest: string } | null = null;
  let resolvedEntity: { entityId: number; canonicalName: string } | null = null;

  await executor.queryRows(`SAVEPOINT ${V2_SAVEPOINT}`);
  try {
    const entityRows = await executor.queryRows(ENTITY_BY_INTERNAL_KEY_SQL, [options.entityKey]);
    const entityRow = entityRows[0];
    if (entityRow !== undefined) {
      const entityId = Number(entityRow['entity_id']);
      if (Number.isSafeInteger(entityId) && entityId > 0) {
        resolvedEntity = {
          entityId,
          canonicalName: String(entityRow['canonical_name'] ?? options.entityKey),
        };
        const packResult = await getServableContentPack(executor, {
          packKind: 'entity_relation_graph',
          entityId,
          now: options.now,
        });
        if (packResult.status === 'served') {
          for (const item of packResult.pack.items) {
            const parsed = entityRelationGraphSchema.safeParse(item.displayPayload['graph']);
            if (!parsed.success) continue;
            const graphFreshUntilMs = new Date(
              parsed.data.meta.contentSnapshot.freshUntil,
            ).getTime();
            if (
              parsed.data.rootEntityKey !== options.entityKey ||
              parsed.data.depth !== options.depth ||
              parsed.data.meta.freshness !== 'available' ||
              !Number.isFinite(graphFreshUntilMs) ||
              graphFreshUntilMs <= options.now.getTime()
            ) {
              continue;
            }
            const personalizedGraph = await overlayUserRelationState(
              executor,
              parsed.data,
              options.userId,
            );
            packResultGraph = {
              graph: personalizedGraph,
              packDigest: packResult.pack.packDigest,
            };
            break;
          }
        }
      }
    }
  } catch {
    // PostgreSQL keeps the transaction aborted after a failed statement — roll
    // back the v2 read attempt so the same snapshot executor can continue.
    await executor.queryRows(`ROLLBACK TO SAVEPOINT ${V2_SAVEPOINT}`);
    packResultGraph = null;
  } finally {
    await executor.queryRows(`RELEASE SAVEPOINT ${V2_SAVEPOINT}`);
  }

  if (packResultGraph !== null) {
    return { source: 'v2_content_pack', ...packResultGraph };
  }
  if (resolvedEntity !== null) {
    const envelope = await buildNoDataEnvelope(executor, options, {
      canonicalName: resolvedEntity.canonicalName,
    });
    if (envelope !== null) return { source: 'v2_no_data', graph: envelope };
  }
  return { source: 'v2_unresolved', graph: null };
}
