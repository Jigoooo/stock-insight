// K7 — the first reader of serving.common_asset_view.
//
// K6 built 297 packets a day and nothing read them. Migration 099's header called
// itself shadow and said the grant "belongs to K7, in the same commit as the digest
// re-pin". That already happened without anyone writing a GRANT: migration 007 left
// standing ALTER DEFAULT PRIVILEGES on schema `serving`, so all four CAV relations
// carry `stock_insight_app_reader=r/research_app` in pg_class.relacl from CREATE
// time, and live-database-guard.ts was re-pinned for exactly those four relations on
// 2026-08-11. Verified against the live catalog before this file was written — this
// read path needs no new grant and moves no digest.
//
// REQ-REC-001 IS THE SIGNATURE, NOT A COMMENT. Every sibling read model in the
// briefing composer takes a `userScope`. This one does not, and the omission is
// deliberate: the common asset view is the same packet for every user, so a
// parameter that cannot be reached is a stronger gate than a promise not to reach
// it. Nothing below can be personalized without changing the type first.

import { deriveCoverageState } from './common-asset-view-plan.ts';
import type { ReadSnapshotExecutor } from '../server/read-snapshot.ts';

import {
  commonAssetViewBlocksSchema,
  commonAssetViewResponseSchema,
  type CommonAssetViewBlock,
  type CommonAssetViewResponse,
} from '@stock-insight/contracts/common-asset-view';

/**
 * One statement, twelve rows.
 *
 * ENTITY KEY RESOLUTION IS INLINE, DELIBERATELY. The repository already resolves
 * INTERNAL_KEY in a dozen places — `product/read-model.ts` joins it in the query
 * body, `relations/entity-relation-adapter.ts` keeps ENTITY_BY_INTERNAL_KEY_SQL —
 * and adding a thirteenth *exported resolver* would be the second interpreter this
 * work was told not to build. Joining `core.entity_identifier` in the CTE follows
 * the pattern the serving reads already use and adds no new surface.
 *
 * THE PACKET IS PICKED PER SUBJECT, NOT BY GLOBAL max(as_of_date).
 * `common_asset_view_current_v1` is `DISTINCT ON (subject_entity_id, as_of_date)`,
 * so both 2026-08-10 and 2026-08-11 survive for every asset — 594 live rows for 297
 * subjects (measured). Without the ORDER BY / LIMIT below, one asset returns two
 * packets and twenty-four blocks. But the filter has to be *per subject*: a
 * `WHERE as_of_date = (SELECT max(as_of_date) ...)` over the whole table returns
 * nothing for any asset that was not rebuilt on the newest date, turning an honest
 * older packet into a silent absence.
 *
 * `as_of_date::text` because the contract carries a calendar date, and letting the
 * driver hand back a Date would make the wire value depend on the server's timezone.
 */
const COMMON_ASSET_VIEW_SQL = `
WITH subject AS (
  SELECT identifier.entity_id
    FROM core.entity_identifier identifier
   WHERE identifier.identifier_type = 'INTERNAL_KEY'
     AND identifier.identifier_value = $1::text
   LIMIT 1
), packet AS (
  SELECT view.common_asset_view_id,
         view.view_key,
         view.revision_no,
         view.as_of_date,
         view.release_id,
         view.semantic_snapshot_id,
         view.packet_digest
    FROM serving.common_asset_view_current_v1 view
    JOIN subject ON subject.entity_id = view.subject_entity_id
   ORDER BY view.as_of_date DESC, view.revision_no DESC
   LIMIT 1
)
SELECT packet.view_key,
       packet.revision_no,
       packet.as_of_date::text AS as_of_date,
       packet.release_id,
       packet.semantic_snapshot_id,
       packet.packet_digest,
       block.block_no,
       block.block_key,
       block.block_state,
       block.state_reason,
       block.evidence_count,
       block.payload
  FROM packet
  JOIN serving.common_asset_view_block block
    ON block.common_asset_view_id = packet.common_asset_view_id
 ORDER BY block.block_no
`;

type PacketRow = {
  view_key: string;
  revision_no: number;
  as_of_date: string;
  release_id: string;
  semantic_snapshot_id: string;
  packet_digest: string;
  block_no: number;
  block_key: string;
  block_state: string;
  state_reason: string;
  evidence_count: number;
  payload: unknown;
};

function asPayload(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Block 1 carries `economicClaim: { claimKey, statement } | null`, so the contract's
 * `economicClaimId` is readable without a second query. `null` when
 * `core.economic_claim` has no row for the subject — which is a real state the block
 * itself reports as `partial`, not an error.
 */
function readEconomicClaimId(blocks: readonly CommonAssetViewBlock[]): string | null {
  const identity = blocks.find((block) => block.blockKey === 'identity_economic_claim');
  const claim = identity === undefined ? null : asPayload(identity.payload).economicClaim;
  if (typeof claim !== 'object' || claim === null) return null;
  const claimKey = (claim as Record<string, unknown>).claimKey;
  return typeof claimKey === 'string' && claimKey.length > 0 ? claimKey : null;
}

/**
 * The current packet for one asset, or an honest absence.
 *
 * NO STALENESS GATE. Sibling product reads run `resolveProductAvailability` against
 * a `PRODUCT_STALE_THRESHOLD_HOURS` key, and this one deliberately does not — there
 * is no key for the asset view and adding one would hide a real packet behind
 * `stale` whenever the daily build slips. The packet reports its own `asOfDate` and
 * every block reports its own state; a reader that wants to judge age has both.
 * Deciding for it here would be the renderer inventing more than the database has,
 * in the opposite direction.
 *
 * `missing` is not a failure. An asset with no packet yet is the normal case for
 * anything outside the 297-subject build universe, and reporting it as a partial
 * failure would teach the surface to read normality as an incident. Real failures —
 * a dead connection, a schema drift, a packet that does not carry twelve blocks —
 * throw, and the composer catches them.
 */
export async function getCommonAssetView(
  executor: ReadSnapshotExecutor,
  options: Readonly<{ entityKey: string }>,
): Promise<CommonAssetViewResponse> {
  const rows = await executor.queryRows<PacketRow>(COMMON_ASSET_VIEW_SQL, [options.entityKey]);
  const head = rows[0];
  if (head === undefined) {
    return commonAssetViewResponseSchema.parse({ packet: null, availability: 'missing' });
  }

  // Parsed before the packet is assembled, so `blockKey`/`blockState` are the
  // contract's vocabulary rather than whatever text the column held by the time the
  // two derivations below read them. A cast here would let a drifted block key reach
  // `deriveCoverageState`, which would then answer for a gate that does not exist.
  // `.length(12)` also does the arguing about short packets: eleven blocks is not a
  // smaller packet, it is one whose reader cannot tell which block is missing from
  // which is empty, so it throws rather than renders.
  const blocks = commonAssetViewBlocksSchema.parse(
    rows.map((row) => ({
      blockNo: Number(row.block_no),
      blockKey: row.block_key,
      blockState: row.block_state,
      stateReason: row.state_reason,
      evidenceCount: Number(row.evidence_count),
      payload: asPayload(row.payload),
    })),
  );

  return commonAssetViewResponseSchema.parse({
    packet: {
      entityKey: options.entityKey,
      assetViewId: head.view_key,
      revisionNo: Number(head.revision_no),
      economicClaimId: readEconomicClaimId(blocks),
      // Not a lookup that failed — a column that has no writer. Migration 118 adds
      // the place for it; `common-asset-view-store.ts` resolves `releaseId` and
      // `semanticSnapshotId` and nothing that produces an information set id, and
      // the append-only trigger forbids backfilling the rows already written. The
      // contract header records this as REQ-SRC-001 applied to our own output.
      informationSetId: null,
      semanticSnapshotId: head.semantic_snapshot_id,
      releaseId: head.release_id,
      packetDigest: head.packet_digest,
      asOfDate: head.as_of_date,
      // Pure, and therefore askable of any packet at any time — the derivation lives
      // with the planner, not here.
      coverageState: deriveCoverageState(blocks),
      blocks,
    },
    availability: 'available',
  });
}
