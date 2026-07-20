// B8/UI — entity relation adapter with v2 preference and v1 fallback.
// The UI contract (EntityRelationGraph) stays IDENTICAL; only the backend
// source switches. Order of precedence:
//   1. servable v2 content pack (pack_kind='entity_relation_graph') with a
//      zod-valid graph in any item's display_payload.graph
//   2. legacy v1 read path (ops.temporal_graph_edge via getEntityRelations)
// Any v2 failure — missing mapping, no pack, invalid payload, storage error —
// falls back to v1. The page never breaks because v2 is not ready; cutover
// completes when packs are published, with zero UI changes.

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
SELECT entity_id
FROM core.entity_identifier
WHERE identifier_type = 'INTERNAL_KEY'
  AND identifier_value = $1
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
  | { source: 'v1_fallback'; graph: TGraph };

export type GetEntityRelationsWithV2Options<TGraph> = {
  entityKey: string;
  depth: number;
  userId: string;
  now: Date;
  snapshot?: { analysisRunId: string; analysisRevision: number };
  /** Legacy loader invoked when no servable v2 pack exists. */
  loadV1: () => Promise<TGraph>;
};

export async function getEntityRelationsWithV2Preference<TGraph = EntityRelationGraph>(
  executor: EntityRelationSourceExecutor,
  options: GetEntityRelationsWithV2Options<TGraph>,
): Promise<EntityRelationAdapterResult<TGraph>> {
  if (options.snapshot !== undefined) {
    return { source: 'v1_fallback', graph: await options.loadV1() };
  }
  let v2Result: Extract<EntityRelationAdapterResult<TGraph>, { source: 'v2_content_pack' }> | null =
    null;

  await executor.queryRows(`SAVEPOINT ${V2_SAVEPOINT}`);
  try {
    const entityRows = await executor.queryRows(ENTITY_BY_INTERNAL_KEY_SQL, [options.entityKey]);
    const entityRow = entityRows[0];
    if (entityRow !== undefined) {
      const entityId = Number(entityRow['entity_id']);
      if (Number.isSafeInteger(entityId) && entityId > 0) {
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
            v2Result = {
              source: 'v2_content_pack',
              // Zod-validated EntityRelationGraph; the caller's TGraph is the
              // same contract shape (possibly | null on the v1 side).
              graph: personalizedGraph as unknown as TGraph,
              packDigest: packResult.pack.packDigest,
            };
            break;
          }
          // Invalid payload: fail-safe to v1 rather than serving a broken graph.
        }
      }
    }
  } catch {
    // PostgreSQL keeps the transaction aborted after a failed statement. Roll
    // back only the v2 attempt before the same snapshot executor loads v1.
    await executor.queryRows(`ROLLBACK TO SAVEPOINT ${V2_SAVEPOINT}`);
  } finally {
    await executor.queryRows(`RELEASE SAVEPOINT ${V2_SAVEPOINT}`);
  }

  if (v2Result !== null) return v2Result;
  const graph = await options.loadV1();
  return { source: 'v1_fallback', graph };
}
