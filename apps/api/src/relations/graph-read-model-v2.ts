// B8 — graph read model v2: content-pack serving path (master plan §8 B8).
// Reads serving.v_relation_graph_freshness + serving.content_pack_item.
// Serving contract: published pack + sealed snapshot + fresh_until > now,
// re-checked IN PROCESS (defense in depth against view/replica lag). When no
// servable pack exists the caller gets an explicit unavailable status — never
// silently stale data. Legacy ops.temporal_graph_edge read path is untouched;
// cutover is a deploy-gate decision.

import type { ContentPackItemKind, ContentPackKind } from './content-pack-builder.ts';

export type ContentPackQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

const SERVABLE_PACK_SQL = `
SELECT content_pack_id, pack_kind, entity_id, graph_snapshot_id, builder_version,
       pack_digest, built_at, fresh_until, status,
       as_of, known_at, snapshot_digest, servable
FROM serving.v_relation_graph_freshness
WHERE pack_kind = $1
  AND entity_id = $2
  AND servable = true
ORDER BY built_at DESC
LIMIT 1
`;

const PACK_ITEMS_SQL = `
SELECT item_no, item_kind, relation_revision_id, relation_evidence_ledger_id,
       impact_path_v2_id, relation_measurement_id, display_payload
FROM serving.content_pack_item
WHERE content_pack_id = $1
ORDER BY item_no
`;

export type ServedContentPackItem = {
  itemNo: number;
  itemKind: ContentPackItemKind;
  relationRevisionId: number | null;
  relationEvidenceLedgerId: number | null;
  impactPathV2Id: number | null;
  relationMeasurementId: number | null;
  displayPayload: Record<string, unknown>;
};

export type ServedContentPack = {
  contentPackId: number;
  packKind: ContentPackKind;
  entityId: number;
  builderVersion: string;
  packDigest: string;
  builtAt: string;
  freshUntil: string;
  snapshot: {
    graphSnapshotId: number;
    asOf: string;
    knownAt: string;
    snapshotDigest: string;
  };
  items: ServedContentPackItem[];
};

export type ContentPackReadResult =
  | { status: 'served'; pack: ServedContentPack }
  | { status: 'unavailable'; reason: 'no_servable_pack' | 'pack_expired' };

export type GetServableContentPackOptions = {
  packKind: ContentPackKind;
  entityId: number;
  now: Date;
};

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

export async function getServableContentPack(
  executor: ContentPackQueryExecutor,
  options: GetServableContentPackOptions,
): Promise<ContentPackReadResult> {
  const packs = await executor.queryRows(SERVABLE_PACK_SQL, [options.packKind, options.entityId]);
  const packRow = packs[0];
  if (packRow === undefined || packRow['servable'] !== true) {
    return { status: 'unavailable', reason: 'no_servable_pack' };
  }

  // Defense in depth: re-check freshness in process. A view computed on a
  // lagging replica (or a long-lived connection) could report stale truth.
  const freshUntilMs = new Date(String(packRow['fresh_until'])).getTime();
  if (!Number.isFinite(freshUntilMs) || freshUntilMs <= options.now.getTime()) {
    return { status: 'unavailable', reason: 'pack_expired' };
  }

  const itemRows = await executor.queryRows(PACK_ITEMS_SQL, [packRow['content_pack_id']]);
  const items: ServedContentPackItem[] = itemRows
    .map((row) => {
      const anchors = [
        row['relation_revision_id'],
        row['relation_evidence_ledger_id'],
        row['impact_path_v2_id'],
        row['relation_measurement_id'],
      ].filter((value) => value !== null && value !== undefined);
      if (anchors.length !== 1) {
        throw new Error(
          `content pack item ${row['item_no']} violates the one-anchor contract (${anchors.length} anchors)`,
        );
      }
      return {
        itemNo: Number(row['item_no']),
        itemKind: row['item_kind'] as ContentPackItemKind,
        relationRevisionId:
          row['relation_revision_id'] === null ? null : Number(row['relation_revision_id']),
        relationEvidenceLedgerId:
          row['relation_evidence_ledger_id'] === null
            ? null
            : Number(row['relation_evidence_ledger_id']),
        impactPathV2Id: row['impact_path_v2_id'] === null ? null : Number(row['impact_path_v2_id']),
        relationMeasurementId:
          row['relation_measurement_id'] === null ? null : Number(row['relation_measurement_id']),
        displayPayload: (row['display_payload'] ?? {}) as Record<string, unknown>,
      };
    })
    .sort((a, b) => a.itemNo - b.itemNo);

  return {
    status: 'served',
    pack: {
      contentPackId: Number(packRow['content_pack_id']),
      packKind: packRow['pack_kind'] as ContentPackKind,
      entityId: Number(packRow['entity_id']),
      builderVersion: String(packRow['builder_version']),
      packDigest: String(packRow['pack_digest']),
      builtAt: toIso(packRow['built_at']),
      freshUntil: toIso(packRow['fresh_until']),
      snapshot: {
        graphSnapshotId: Number(packRow['graph_snapshot_id']),
        asOf: toIso(packRow['as_of']),
        knownAt: toIso(packRow['known_at']),
        snapshotDigest: String(packRow['snapshot_digest']),
      },
      items,
    },
  };
}
