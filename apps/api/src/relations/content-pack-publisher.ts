// Shared content-pack publishing: draft -> lineage -> items -> published.
//
// Extracted from run-v2-graph-publish.ts so a second publisher can emit a
// different pack kind without duplicating the provenance machinery. Content packs
// are digest-sealed and immutable once published (migration 026's
// guard_content_pack_write), so a pack cannot be reopened later to append items —
// a publisher that runs after another must publish its own packs, not extend
// theirs. That is why `impact_brief` exists alongside `entity_relation_graph`.
//
// packKind is a REQUIRED parameter rather than a module constant. The supersede
// step at the end retires previously published packs, and if it ran against a
// hardcoded kind, one publisher would retire the other publisher's packs on every
// run.

import type { Client, PoolClient, QueryResultRow } from 'pg';

import {
  buildContentPack,
  type ContentPackDraft,
  type ContentPackKind,
  type ContentPackSourceItem,
} from './content-pack-builder.ts';

/**
 * Per-pack item ceiling. AN APPLICATION CHOICE, NOT A DATABASE CONSTRAINT.
 *
 * The previous comment said "Matches migration 026's per-pack item ceiling" and
 * that is false — `512` appears nowhere in packages/db-schema/src/migrations
 * (measured 2026-08-07, zero hits across every migration). What 026 actually
 * enforces is different and looser: `guard_content_pack_write` checks that
 * `item_no` runs 1..item_count with no gaps and that the stored digest matches a
 * server-side recomputation. It never counts items against a maximum.
 *
 * The distinction matters for anyone adding a per-security budget. Truncating a
 * pack is safe at the database level — the builder renumbers to 1..N and
 * recomputes the digest, so both of 026's checks still pass. The only thing
 * standing in the way of truncation is `publishContentPacks` below, which treats
 * any shortfall as lost lineage.
 */
export const CONTENT_PACK_MAX_ITEMS = 512;

/** Rows are inserted in batches so one pack's lineage never builds a single huge statement. */
const LINEAGE_BATCH_SIZE = 300;

export type ContentPackPublishInput = {
  entityId: number;
  /** Only used to name the entity in failure messages. */
  label: string;
  sourceItems: readonly ContentPackSourceItem[];
};

export type ContentPackPublishOptions = {
  packKind: ContentPackKind;
  graphSnapshotId: number;
  builderVersion: string;
  builtAt: Date;
  freshnessHours: number;
  /** knowledge.derivation.created_by — says which publisher authored the lineage. */
  createdBy: string;
  /** Recorded on both the pack metadata and each derivation. */
  metadataSource: string;
  releaseCommit: string;
  /**
   * Retire sealed snapshots that no published pack still references. Only the
   * publisher that creates snapshots should do this; a publisher that merely adds
   * packs to someone else's snapshot must leave snapshot lifecycle alone.
   */
  supersedeOrphanSnapshots: boolean;
};

type QueryClient = Client | PoolClient;

function numeric(value: string | number, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

export async function publishContentPacks(
  client: QueryClient,
  packs: readonly ContentPackPublishInput[],
  options: ContentPackPublishOptions,
): Promise<{ packIds: number[]; itemCount: number }> {
  const drafts: Array<{ packId: number; draft: ContentPackDraft }> = [];
  let itemCount = 0;

  for (const pack of packs) {
    if (pack.sourceItems.length > CONTENT_PACK_MAX_ITEMS) {
      throw new Error(`pack ${pack.label} exceeds lineage item cap: ${pack.sourceItems.length}`);
    }
    const draft = buildContentPack(pack.sourceItems, {
      packKind: options.packKind,
      entityId: pack.entityId,
      graphSnapshotId: options.graphSnapshotId,
      snapshotStatus: 'sealed',
      builderVersion: options.builderVersion,
      freshnessHours: options.freshnessHours,
      maxItems: CONTENT_PACK_MAX_ITEMS,
      now: options.builtAt,
    });
    // The builder drops items it cannot anchor. Silently publishing a shorter pack
    // would mean serving a claim whose lineage was quietly discarded.
    if (draft.itemCount !== pack.sourceItems.length) {
      throw new Error(`pack ${pack.label} lost typed lineage anchors`);
    }
    const inserted = await client.query<QueryResultRow & { content_pack_id: string | number }>(
      `INSERT INTO serving.content_pack (
         pack_kind,entity_id,graph_snapshot_id,builder_version,status,pack_digest,
         item_count,built_at,fresh_until,metadata
       ) VALUES ($1,$2,$3,$4,'building',$5,$6,$7,$8,$9::jsonb)
       RETURNING content_pack_id`,
      [
        draft.packKind,
        draft.entityId,
        draft.graphSnapshotId,
        draft.builderVersion,
        draft.packDigest,
        draft.itemCount,
        draft.builtAt,
        draft.freshUntil,
        JSON.stringify({ source: options.metadataSource, release_commit: options.releaseCommit }),
      ],
    );
    drafts.push({ packId: numeric(inserted.rows[0]!.content_pack_id, 'contentPackId'), draft });
    itemCount += draft.itemCount;
  }

  const itemRows = drafts.flatMap(({ packId, draft }) =>
    draft.items.map((item) => ({ packId, item })),
  );

  for (let offset = 0; offset < itemRows.length; offset += LINEAGE_BATCH_SIZE) {
    const rows = itemRows.slice(offset, offset + LINEAGE_BATCH_SIZE);
    const derivationValues: unknown[] = [];
    const derivationKeys = rows.map(({ packId, item }, index) => {
      const derivationKey = `content-pack:${packId}:item:${item.itemNo}:direct-v1`;
      const start = index * 5;
      derivationValues.push(
        derivationKey,
        options.metadataSource,
        options.builderVersion,
        options.createdBy,
        JSON.stringify({
          source: options.metadataSource,
          content_pack_id: packId,
          item_no: item.itemNo,
        }),
      );
      return {
        derivationKey,
        tuple: `($${start + 1},'direct_projection',$${start + 2},$${start + 3},$${start + 4},$${start + 5}::jsonb)`,
      };
    });
    const derivations = await client.query<
      QueryResultRow & { derivation_id: string | number; derivation_key: string }
    >(
      `INSERT INTO knowledge.derivation (
         derivation_key,derivation_kind,method,method_version,created_by,metadata
       ) VALUES ${derivationKeys.map((row) => row.tuple).join(',')}
       RETURNING derivation_id,derivation_key`,
      derivationValues,
    );
    const derivationIdByKey = new Map(
      derivations.rows.map((row) => [
        row.derivation_key,
        numeric(row.derivation_id, 'derivationId'),
      ]),
    );

    const stepValues: unknown[] = [];
    const rowsWithDerivations = rows.map(({ packId, item }, index) => {
      const derivationKey = derivationKeys[index]!.derivationKey;
      const derivationId = derivationIdByKey.get(derivationKey);
      if (derivationId === undefined) throw new Error(`missing derivation ${derivationKey}`);
      stepValues.push(
        derivationId,
        options.builderVersion,
        JSON.stringify({ content_pack_id: packId, item_no: item.itemNo }),
      );
      return { packId, item, derivationId };
    });
    const steps = await client.query<
      QueryResultRow & { derivation_step_id: string | number; derivation_id: string | number }
    >(
      `INSERT INTO knowledge.derivation_step (
         derivation_id,step_no,activity_type,activity_version,
         output_type,output_locator,parameters
       ) VALUES ${rowsWithDerivations
         .map((_, index) => {
           const start = index * 3;
           return `($${start + 1},1,'direct_projection',$${start + 2},'serving.content_pack_item',$${start + 3}::jsonb,'{}'::jsonb)`;
         })
         .join(',')}
       RETURNING derivation_step_id,derivation_id`,
      stepValues,
    );
    const stepIdByDerivationId = new Map(
      steps.rows.map((row) => [
        numeric(row.derivation_id, 'derivationId'),
        numeric(row.derivation_step_id, 'derivationStepId'),
      ]),
    );

    const inputValues: unknown[] = [];
    const inputTuples = rowsWithDerivations.map(({ item, derivationId }, index) => {
      const derivationStepId = stepIdByDerivationId.get(derivationId);
      if (derivationStepId === undefined)
        throw new Error(`missing derivation step ${derivationId}`);
      const anchors = [
        { kind: 'relation_revision', id: item.relationRevisionId },
        { kind: 'relation_evidence', id: item.relationEvidenceLedgerId },
        { kind: 'impact_path', id: item.impactPathV2Id },
        { kind: 'relation_measurement', id: item.relationMeasurementId },
      ].filter((anchor): anchor is { kind: string; id: number } => anchor.id !== null);
      if (anchors.length !== 1) throw new Error(`item ${item.itemNo} needs one typed anchor`);
      const anchor = anchors[0]!;
      const start = index * 7;
      inputValues.push(
        derivationStepId,
        anchor.kind,
        anchor.kind === 'relation_revision' ? anchor.id : null,
        anchor.kind === 'relation_evidence' ? anchor.id : null,
        anchor.kind === 'impact_path' ? anchor.id : null,
        anchor.kind === 'relation_measurement' ? anchor.id : null,
        JSON.stringify({ policy: 'p1-w1-direct-v1' }),
      );
      return `($${start + 1},1,$${start + 2},$${start + 3},$${start + 4},$${start + 5},$${start + 6},'evidence',$${start + 7}::jsonb)`;
    });
    await client.query(
      `INSERT INTO knowledge.derivation_input (
         derivation_step_id,input_no,input_kind,relation_revision_id,
         relation_evidence_ledger_id,impact_path_v2_id,relation_measurement_id,
         input_role,metadata
       ) VALUES ${inputTuples.join(',')}`,
      inputValues,
    );

    const derivationIds = rowsWithDerivations.map((row) => row.derivationId);
    const sealed = await client.query(
      `UPDATE knowledge.derivation AS derivation
       SET status='sealed',step_count=1,input_count=1,
           derivation_digest=knowledge.compute_derivation_digest(derivation.derivation_id),
           sealed_at=clock_timestamp()
       WHERE derivation.derivation_id = ANY($1::bigint[]) AND derivation.status='building'`,
      [derivationIds],
    );
    if (sealed.rowCount !== derivationIds.length) {
      throw new Error('derivation sealing was incomplete');
    }

    const values: unknown[] = [];
    const tuples = rowsWithDerivations.map(({ packId, item, derivationId }, index) => {
      const start = index * 9;
      values.push(
        packId,
        item.itemNo,
        item.itemKind,
        derivationId,
        item.relationRevisionId,
        item.relationEvidenceLedgerId,
        item.impactPathV2Id,
        item.relationMeasurementId,
        JSON.stringify(item.displayPayload),
      );
      return `(${Array.from({ length: 9 }, (_, column) => `$${start + column + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO serving.content_pack_item (
         content_pack_id,item_no,item_kind,derivation_id,relation_revision_id,
         relation_evidence_ledger_id,impact_path_v2_id,relation_measurement_id,display_payload
       ) VALUES ${tuples.join(',')}`,
      values,
    );
  }

  for (const { packId } of drafts) {
    const published = await client.query(
      `UPDATE serving.content_pack
       SET status='published',published_at=clock_timestamp()
       WHERE content_pack_id=$1 AND status='building'`,
      [packId],
    );
    if (published.rowCount !== 1) throw new Error(`content pack ${packId} publish failed`);
  }

  // Scoped to this publisher's own kind AND to other snapshots: retiring by kind
  // alone would take out the packs this run just published, and omitting the kind
  // would take out the other publisher's.
  await client.query(
    `UPDATE serving.content_pack
     SET status='superseded'
     WHERE pack_kind=$1 AND status='published' AND graph_snapshot_id<>$2`,
    [options.packKind, options.graphSnapshotId],
  );

  if (options.supersedeOrphanSnapshots) {
    await client.query(
      `UPDATE analytics.graph_snapshot snapshot
       SET status='superseded'
       WHERE snapshot.status='sealed' AND snapshot.graph_snapshot_id<>$1
         AND NOT EXISTS (
           SELECT 1 FROM serving.content_pack pack
           WHERE pack.graph_snapshot_id=snapshot.graph_snapshot_id AND pack.status='published'
         )`,
      [options.graphSnapshotId],
    );
  }

  return { packIds: drafts.map((row) => row.packId), itemCount };
}
