import { hostname } from 'node:os';

import { Client, type QueryResultRow } from 'pg';

import { assignCommunities } from './graph-community.ts';
import type { SnapshotEdgeInput } from './graph-snapshot.ts';
import { buildImpactPaths, type ImpactPathEdge } from './impact-path-builder.ts';
import { planPriceCorrelations, type PriceObservation } from './price-correlation.ts';
import { planRelationMeasurements } from './relation-measurement.ts';

// P0-3 — L5 analytics producer (roadmap §4 P0-3).
// Fills the three empty L5 tables against the LATEST SEALED snapshot:
//   analytics.impact_path_v2 (+ analytics.impact_path_step, exact edge FKs)
//   analytics.graph_community (+ members, deterministic membership keys)
//   analytics.relation_measurement (price correlations; validation only)
// Contract: append-only, idempotent per (snapshot, run key), fail-closed.
// Measurements VALIDATE structural relations — they never create edges (C3).

const APPLY = process.argv.includes('--apply');
// --rehearse exercises the FULL write path (claim, inserts, finish) and then
// rolls back — a production-safe write rehearsal.
const REHEARSE = process.argv.includes('--rehearse');
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const RULE_VERSION = 'impact-v2-r1';
const HOP_DECAY = 0.7;
const MAX_HOPS = 2;
const MAX_PATHS_PER_EVENT = 20;
const MAX_EXPANDED_STATES = 50_000;
const MIN_COMMUNITY_SIZE = 2;
const CORRELATION_WINDOW_DAYS = 45;
const MIN_OVERLAPPING_RETURNS = 10;
const MEASUREMENT_MODEL_VERSION = 'pearson-returns-v1';
const EVENT_LOOKBACK_DAYS = 14;
const EVENT_LIMIT = 500;
const FRESHNESS_HALF_LIFE_DAYS = 14;

const EVENT_TYPE_BOOST: Record<string, number> = {
  capex_increase: 1.1,
  ma_deal: 1.1,
  regulation: 1.05,
  supply_disruption: 1.1,
  earnings: 1.0,
  sec_8k: 0.9,
  policy_event: 0.95,
  analyst: 0.7,
  insider_trade: 0.6,
};

type SnapshotRow = QueryResultRow & {
  graph_snapshot_id: string | number;
  as_of: Date | string;
  known_at: Date | string;
};

type SnapshotEdgeRow = QueryResultRow & {
  graph_snapshot_edge_id: string | number;
  relation_revision_id: string | number;
  relation_identity_id: string | number;
  subject_entity_id: string | number;
  object_entity_id: string | number;
  predicate: string;
  relation_kind: string;
  confidence: number;
};

type EventRow = QueryResultRow & {
  event_id: string | number;
  event_type: string;
  target_entity_id: string | number;
  occurred_at: Date | string;
  has_document: boolean;
};

type PriceRow = QueryResultRow & {
  entity_id: string | number;
  snapshot_date: string;
  value: number;
};

function numeric(value: string | number, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('invalid timestamp from database');
  return date.toISOString();
}

function eventStrength(row: EventRow): number {
  const base = row.has_document ? 0.9 : 0.5;
  return Math.min(1, base * (EVENT_TYPE_BOOST[row.event_type] ?? 0.8));
}

function freshness(occurredAtIso: string, asOfIso: string): number {
  const ageDays = Math.max(
    0,
    (new Date(asOfIso).getTime() - new Date(occurredAtIso).getTime()) / 86_400_000,
  );
  return Math.exp((-Math.LN2 * ageDays) / FRESHNESS_HALF_LIFE_DAYS);
}

async function loadLatestSealedSnapshot(client: Client): Promise<{
  graphSnapshotId: number;
  asOf: string;
  knownAt: string;
}> {
  const result = await client.query<SnapshotRow>(
    `SELECT graph_snapshot_id, as_of, known_at
     FROM analytics.graph_snapshot
     WHERE status = 'sealed'
     ORDER BY graph_snapshot_id DESC
     LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('no sealed graph snapshot exists — run v2-graph publish first');
  return {
    graphSnapshotId: numeric(row.graph_snapshot_id, 'graphSnapshotId'),
    asOf: toIso(row.as_of),
    knownAt: toIso(row.known_at),
  };
}

async function loadSnapshotEdges(
  client: Client,
  graphSnapshotId: number,
): Promise<{ pathEdges: ImpactPathEdge[]; communityEdges: SnapshotEdgeInput[] }> {
  const result = await client.query<SnapshotEdgeRow>(
    `SELECT graph_snapshot_edge_id, relation_revision_id, relation_identity_id,
            subject_entity_id, object_entity_id, predicate, relation_kind, confidence
     FROM analytics.graph_snapshot_edge
     WHERE graph_snapshot_id = $1
     ORDER BY graph_snapshot_edge_id`,
    [graphSnapshotId],
  );
  const pathEdges: ImpactPathEdge[] = [];
  const communityEdges: SnapshotEdgeInput[] = [];
  for (const row of result.rows) {
    const subjectEntityId = numeric(row.subject_entity_id, 'subjectEntityId');
    const objectEntityId = numeric(row.object_entity_id, 'objectEntityId');
    pathEdges.push({
      graphSnapshotEdgeId: numeric(row.graph_snapshot_edge_id, 'graphSnapshotEdgeId'),
      subjectEntityId,
      objectEntityId,
      predicate: row.predicate,
      confidence: Number(row.confidence),
    });
    communityEdges.push({
      relationRevisionId: numeric(row.relation_revision_id, 'relationRevisionId'),
      relationIdentityId: numeric(row.relation_identity_id, 'relationIdentityId'),
      revisionStatus: 'accepted',
      validFrom: '1970-01-01T00:00:00.000Z',
      validTo: null,
      knownFrom: '1970-01-01T00:00:00.000Z',
      subjectEntityId,
      objectEntityId,
      predicate: row.predicate,
      relationKind: row.relation_kind,
      confidence: Number(row.confidence),
    });
  }
  return { pathEdges, communityEdges };
}

async function loadStockEntityIds(client: Client): Promise<Set<number>> {
  const result = await client.query<QueryResultRow & { entity_id: string | number }>(
    `SELECT entity_id FROM core.entity WHERE entity_type = 'Stock'`,
  );
  return new Set(result.rows.map((row) => numeric(row.entity_id, 'stockEntityId')));
}

async function loadRecentEvents(client: Client, asOf: string): Promise<EventRow[]> {
  const result = await client.query<EventRow>(
    `SELECT event.event_id, event.event_type, event.target_entity_id,
            coalesce(event.occurred_at, event.created_at) AS occurred_at,
            (event.source_document_id IS NOT NULL) AS has_document
     FROM knowledge.event event
     WHERE event.target_entity_id IS NOT NULL
       AND coalesce(event.occurred_at, event.created_at)
             >= $1::timestamptz - make_interval(days => $2)
       AND coalesce(event.occurred_at, event.created_at) <= $1::timestamptz
     ORDER BY coalesce(event.occurred_at, event.created_at) DESC, event.event_id DESC
     LIMIT $3`,
    [asOf, EVENT_LOOKBACK_DAYS, EVENT_LIMIT],
  );
  return result.rows;
}

async function loadPriceSeries(
  client: Client,
  entityIds: readonly number[],
  asOf: string,
): Promise<Map<number, PriceObservation[]>> {
  if (entityIds.length === 0) return new Map();
  const result = await client.query<PriceRow>(
    `SELECT identifier.entity_id,
            snapshot.snapshot_date::text AS snapshot_date,
            snapshot.value
     FROM stock.market_snapshots snapshot
     JOIN public.entities legacy
       ON legacy.entity_key = CASE
            WHEN snapshot.region = 'KR' THEN 'KR:' || snapshot.symbol
            ELSE 'US:' || snapshot.symbol
          END
     JOIN core.entity_identifier identifier
       ON identifier.identifier_type = 'INTERNAL_KEY'
      AND identifier.identifier_value = legacy.entity_key
      AND identifier.valid_to IS NULL
     WHERE snapshot.snapshot_type = 'single_stock'
       AND snapshot.symbol IS NOT NULL
       AND snapshot.value IS NOT NULL
       AND snapshot.snapshot_date::date >= ($1::timestamptz - make_interval(days => $2))::date
       AND snapshot.snapshot_date::date <= $1::timestamptz::date
       AND identifier.entity_id = ANY($3::bigint[])
     ORDER BY identifier.entity_id, snapshot.snapshot_date, snapshot.collected_at DESC`,
    [asOf, CORRELATION_WINDOW_DAYS, entityIds],
  );
  const byEntity = new Map<number, PriceObservation[]>();
  const seenDate = new Set<string>();
  for (const row of result.rows) {
    const entityId = numeric(row.entity_id, 'priceEntityId');
    const dateKey = `${entityId}|${row.snapshot_date}`;
    if (seenDate.has(dateKey)) continue; // keep latest collected_at per day
    seenDate.add(dateKey);
    const list = byEntity.get(entityId) ?? [];
    list.push({ date: row.snapshot_date, value: Number(row.value) });
    byEntity.set(entityId, list);
  }
  return byEntity;
}

async function main(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const snapshot = await loadLatestSealedSnapshot(client);
    const { pathEdges, communityEdges } = await loadSnapshotEdges(client, snapshot.graphSnapshotId);
    if (pathEdges.length === 0) throw new Error('sealed snapshot has no edges');
    const stockEntityIds = await loadStockEntityIds(client);
    const events = await loadRecentEvents(client, snapshot.asOf);

    // ── impact paths ─────────────────────────────────────────────────────────
    const inferenceRunId = `${RULE_VERSION}:snapshot-${snapshot.graphSnapshotId}`;
    const pathsByEvent: Array<{
      event: EventRow;
      paths: ReturnType<typeof buildImpactPaths>;
    }> = [];
    let skippedEventSources = 0;
    for (const event of events) {
      const sourceEntityId = numeric(event.target_entity_id, 'eventTargetEntityId');
      // The walk starts FROM the event's entity; a stock source is terminal by
      // contract, so walk from it only via the undirected expansion by treating
      // it as a non-terminal origin (exclude it from the terminal set locally).
      const localStockSet = new Set(stockEntityIds);
      localStockSet.delete(sourceEntityId);
      const strength = eventStrength(event) * freshness(toIso(event.occurred_at), snapshot.asOf);
      if (strength <= 0.01) {
        skippedEventSources += 1;
        continue;
      }
      const paths = buildImpactPaths(
        {
          eventId: numeric(event.event_id, 'eventId'),
          sourceEntityId,
          eventStrength: Math.min(1, strength),
        },
        pathEdges,
        {
          maxHops: MAX_HOPS,
          hopDecay: HOP_DECAY,
          maxPathsPerEvent: MAX_PATHS_PER_EVENT,
          maxExpandedStates: MAX_EXPANDED_STATES,
          stockEntityIds: localStockSet,
          undirectedEdges: true,
        },
      );
      if (paths.length > 0) pathsByEvent.push({ event, paths });
    }
    const totalPaths = pathsByEvent.reduce((total, entry) => total + entry.paths.length, 0);

    // ── communities ──────────────────────────────────────────────────────────
    const communityResult = assignCommunities(communityEdges, {
      minCommunitySize: MIN_COMMUNITY_SIZE,
    });

    // ── measurements (validation only) ───────────────────────────────────────
    const snapshotEntityIds = [
      ...new Set(pathEdges.flatMap((edge) => [edge.subjectEntityId, edge.objectEntityId])),
    ].sort((a, b) => a - b);
    const priceSeries = await loadPriceSeries(client, snapshotEntityIds, snapshot.asOf);
    const structuralPairs = [
      ...new Map(
        pathEdges.map((edge) => [
          `${Math.min(edge.subjectEntityId, edge.objectEntityId)}|${Math.max(edge.subjectEntityId, edge.objectEntityId)}`,
          { subjectEntityId: edge.subjectEntityId, objectEntityId: edge.objectEntityId },
        ]),
      ).values(),
    ];
    const correlationInputs = planPriceCorrelations(priceSeries, structuralPairs, {
      asOf: snapshot.asOf,
      windowDays: CORRELATION_WINDOW_DAYS,
      minOverlappingReturns: MIN_OVERLAPPING_RETURNS,
      modelVersion: MEASUREMENT_MODEL_VERSION,
    });
    const measurementPlan = planRelationMeasurements(correlationInputs, { asOf: snapshot.asOf });
    if (measurementPlan.rejected.length > 0) {
      throw new Error(
        `measurement planner rejected ${measurementPlan.rejected.length} inputs: ` +
          measurementPlan.rejected[0]!.reason,
      );
    }

    const summary = {
      mode: APPLY ? 'apply' : 'dry-run',
      graphSnapshotId: snapshot.graphSnapshotId,
      snapshotAsOf: snapshot.asOf,
      inferenceRunId,
      eventsConsidered: events.length,
      eventsSkippedWeak: skippedEventSources,
      eventsWithPaths: pathsByEvent.length,
      impactPaths: totalPaths,
      communities: communityResult.communities.length,
      communityMembers: communityResult.communities.reduce(
        (total, community) => total + community.memberEntityIds.length,
        0,
      ),
      priceSeriesEntities: priceSeries.size,
      measurements: measurementPlan.accepted.length,
    };

    if (!APPLY && !REHEARSE) {
      console.log(JSON.stringify(summary));
      return;
    }

    // ── apply: one claim-fenced transaction, idempotent per snapshot+run ─────
    const naturalRunKey = `v2-analytics-publish:snapshot-${snapshot.graphSnapshotId}`;
    const claimedBy = `${hostname()}:${process.pid}`;
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL lock_timeout='5s'`);
      await client.query(`SET LOCAL statement_timeout='10min'`);
      const claim = await client.query<
        QueryResultRow & { claimed: boolean; fencing_token: string | number; owner: string }
      >(`SELECT * FROM ops.claim_pipeline_run($1,$2,$3,$4)`, [
        naturalRunKey,
        'analytics.l5_producers_v2',
        claimedBy,
        1800,
      ]);
      const claimRow = claim.rows[0]!;
      if (!claimRow.claimed) {
        console.log(
          JSON.stringify({ ...summary, outcome: 'already_completed', owner: claimRow.owner }),
        );
        await client.query('ROLLBACK');
        return;
      }
      const token = Number(claimRow.fencing_token);

      // Idempotency: replaying the same run key must not duplicate rows.
      const existing = await client.query<QueryResultRow & { count: string | number }>(
        `SELECT count(*) AS count FROM analytics.impact_path_v2
         WHERE graph_snapshot_id = $1 AND inference_run_id = $2`,
        [snapshot.graphSnapshotId, inferenceRunId],
      );
      if (Number(existing.rows[0]!.count) > 0) {
        throw new Error(
          `impact paths already exist for ${inferenceRunId} — append-only replay refused`,
        );
      }

      let insertedPaths = 0;
      let insertedSteps = 0;
      for (const { event, paths } of pathsByEvent) {
        // One row per (event, target): builder already returns the best-first
        // ordering; keep only the strongest path per target under the natural
        // UNIQUE (snapshot, event, target, run).
        const bestPerTarget = new Map<number, (typeof paths)[number]>();
        for (const path of paths) {
          if (!bestPerTarget.has(path.targetEntityId)) {
            bestPerTarget.set(path.targetEntityId, path);
          }
        }
        for (const path of bestPerTarget.values()) {
          const inserted = await client.query<
            QueryResultRow & { impact_path_v2_id: string | number }
          >(
            `INSERT INTO analytics.impact_path_v2 (
               graph_snapshot_id, trigger_event_id, source_entity_id, target_entity_id,
               hop_count, path_score, direction, horizon, inference_kind, rule_version,
               explanation, inference_run_id, status
             ) VALUES ($1,$2,$3,$4,$5,$6,'unknown','1q','rule_derived',$7,$8::jsonb,$9,'building')
             RETURNING impact_path_v2_id`,
            [
              snapshot.graphSnapshotId,
              path.eventId,
              path.sourceEntityId,
              path.targetEntityId,
              path.hopCount,
              Math.min(1, Math.max(0, path.pathScore)),
              RULE_VERSION,
              JSON.stringify({
                eventType: event.event_type,
                predicates: path.steps.map((step) => step.graphSnapshotEdgeId),
                note: 'industrial linkage strength; never a price prediction',
              }),
              inferenceRunId,
            ],
          );
          const impactPathId = numeric(inserted.rows[0]!.impact_path_v2_id, 'impactPathV2Id');
          insertedPaths += 1;
          for (const step of path.steps) {
            await client.query(
              `INSERT INTO analytics.impact_path_step (
                 impact_path_v2_id, step_no, graph_snapshot_edge_id,
                 from_entity_id, to_entity_id, edge_contribution
               ) VALUES ($1,$2,$3,$4,$5,$6)`,
              [
                impactPathId,
                step.stepNo,
                step.graphSnapshotEdgeId,
                step.fromEntityId,
                step.toEntityId,
                Math.min(1, Math.max(0, step.edgeContribution)),
              ],
            );
            insertedSteps += 1;
          }
          // DB guard contract: building → sealed only after every step exists
          // and the step chain matches source/target/hop_count exactly.
          const sealed = await client.query(
            `UPDATE analytics.impact_path_v2
             SET status = 'sealed', sealed_at = clock_timestamp()
             WHERE impact_path_v2_id = $1 AND status = 'building'`,
            [impactPathId],
          );
          if (sealed.rowCount !== 1) {
            throw new Error(`impact path ${impactPathId} seal failed`);
          }
        }
      }

      let insertedCommunities = 0;
      let insertedMembers = 0;
      for (const community of communityResult.communities) {
        const inserted = await client.query<
          QueryResultRow & { graph_community_id: string | number }
        >(
          `INSERT INTO analytics.graph_community (
             graph_snapshot_id, algorithm, parameters, community_key, member_count, modularity
           ) VALUES ($1,$2,$3::jsonb,$4,$5,NULL)
           ON CONFLICT (graph_snapshot_id, algorithm, community_key) DO NOTHING
           RETURNING graph_community_id`,
          [
            snapshot.graphSnapshotId,
            communityResult.algorithm,
            JSON.stringify(communityResult.parameters),
            community.communityKey,
            community.memberEntityIds.length,
          ],
        );
        const communityRow = inserted.rows[0];
        if (!communityRow) continue; // replayed community — members already exist
        const communityId = numeric(communityRow.graph_community_id, 'graphCommunityId');
        insertedCommunities += 1;
        for (const memberEntityId of community.memberEntityIds) {
          await client.query(
            `INSERT INTO analytics.graph_community_member (
               graph_community_id, entity_id, membership_strength
             ) VALUES ($1,$2,1)
             ON CONFLICT (graph_community_id, entity_id) DO NOTHING`,
            [communityId, memberEntityId],
          );
          insertedMembers += 1;
        }
      }

      let insertedMeasurements = 0;
      for (const measurement of measurementPlan.accepted) {
        const inserted = await client.query(
          `INSERT INTO analytics.relation_measurement (
             graph_snapshot_id, subject_entity_id, object_entity_id, measurement_kind,
             window_start, window_end, value, model_config, input_watermark
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
           ON CONFLICT (graph_snapshot_id, subject_entity_id, object_entity_id,
                        measurement_kind, window_start, window_end) DO NOTHING`,
          [
            snapshot.graphSnapshotId,
            measurement.subjectEntityId,
            measurement.objectEntityId,
            measurement.measurementKind,
            measurement.windowStart,
            measurement.windowEnd,
            measurement.value,
            JSON.stringify(measurement.modelConfig),
            JSON.stringify(measurement.inputWatermark),
          ],
        );
        insertedMeasurements += inserted.rowCount ?? 0;
      }

      const finished = await client.query<QueryResultRow & { finished: boolean }>(
        `SELECT ops.finish_pipeline_run($1,$2,$3,'completed') AS finished`,
        [naturalRunKey, claimedBy, token],
      );
      if (!finished.rows[0]!.finished) throw new Error('pipeline claim finish was fenced out');
      if (REHEARSE && !APPLY) {
        await client.query('ROLLBACK');
        console.log(
          JSON.stringify({
            ...summary,
            mode: 'rehearse',
            outcome: 'rolled_back_after_full_write',
            insertedPaths,
            insertedSteps,
            insertedCommunities,
            insertedMembers,
            insertedMeasurements,
          }),
        );
        return;
      }
      await client.query('COMMIT');
      console.log(
        JSON.stringify({
          ...summary,
          outcome: 'completed',
          fencingToken: token,
          insertedPaths,
          insertedSteps,
          insertedCommunities,
          insertedMembers,
          insertedMeasurements,
        }),
      );
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
