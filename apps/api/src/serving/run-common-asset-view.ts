// K6 — build serving.common_asset_view for the served universe.
//
//   node apps/api/src/serving/run-common-asset-view.ts                 # dry run
//   node apps/api/src/serving/run-common-asset-view.ts --apply
//   node apps/api/src/serving/run-common-asset-view.ts --as-of 2026-08-01 --apply
//
// Dry run is the default and it reports the block-state census, which is the number
// worth reading: how many assets have each block available, partial, unverified,
// unproduced or ineligible. Four blocks are empty by construction today and the
// census is how anyone notices when one of them fills.

import pg from 'pg';

import {
  planCommonAssetView,
  type CommonAssetViewBlockState,
  type CommonAssetViewPlan,
} from './common-asset-view-plan.ts';
import {
  insertCommonAssetView,
  loadAssetSourceFacts,
  loadSubjectEntityIds,
  nextReleaseId,
  openRelease,
  publishRelease,
  truncationReport,
  type QueryClient,
} from './common-asset-view-store.ts';

import { canonicalDigest } from '../shared/canonical-json.ts';

export type CommonAssetViewArgs = {
  mode: 'dry-run' | 'apply';
  asOfDate: string;
  limit: number;
};

const DEFAULT_LIMIT = 500;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

export function parseCommonAssetViewArgs(
  argv: readonly string[],
  today: string,
): CommonAssetViewArgs {
  let mode: CommonAssetViewArgs['mode'] = 'dry-run';
  let asOfDate = today;
  let limit = DEFAULT_LIMIT;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') {
      mode = 'apply';
      continue;
    }
    if (flag === '--as-of') {
      const value = argv[index + 1];
      if (!value) throw new Error('--as-of requires a value');
      if (!isCalendarDate(value)) throw new Error(`--as-of must be YYYY-MM-DD, got ${value}`);
      asOfDate = value;
      index += 1;
      continue;
    }
    if (flag === '--limit') {
      const value = argv[index + 1];
      if (!value) throw new Error('--limit requires a value');
      limit = Number(value);
      if (!Number.isInteger(limit) || limit <= 0)
        throw new Error('--limit must be a positive integer');
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${flag}`);
  }

  return { mode, asOfDate, limit };
}

export type BlockCensus = Record<string, Record<CommonAssetViewBlockState, number>>;

export function censusOf(plans: readonly CommonAssetViewPlan[]): BlockCensus {
  const census: BlockCensus = {};
  for (const plan of plans) {
    for (const block of plan.blocks) {
      const row = (census[block.blockKey] ??= {
        available: 0,
        partial: 0,
        unverified_only: 0,
        not_produced: 0,
        no_eligible_source: 0,
      });
      row[block.blockState] += 1;
    }
  }
  return census;
}

async function resolveSemanticSnapshotId(client: QueryClient): Promise<string> {
  const { rows } = await client.query<{ semantic_snapshot_id: string }>(
    `SELECT semantic_snapshot_id FROM governance.semantic_snapshot
      ORDER BY created_at DESC LIMIT 1`,
  );
  const snapshot = rows[0]?.semantic_snapshot_id;
  if (!snapshot) throw new Error('governance.semantic_snapshot is empty; K6 cannot name a release');
  return snapshot;
}

/**
 * The state the release is built under, read from the ledger rather than assumed.
 * `release_manifest.safety_state` is a historical fact about the release — migration
 * 081 keeps it a plain column for exactly this reason — so a release built under
 * CAUTION must keep saying CAUTION after the system recovers.
 */
async function resolveSafetyState(client: QueryClient): Promise<string> {
  const { rows } = await client.query<{ safety_state: string }>(
    `SELECT safety_state FROM governance.safety_state_current_v1 WHERE scope = 'global'`,
  );
  const state = rows[0]?.safety_state;
  if (!state)
    throw new Error(
      'governance.safety_state_current_v1 has no global row; K6 will not guess a state',
    );
  return state;
}

export async function runCommonAssetView(
  client: QueryClient,
  args: CommonAssetViewArgs,
  now: Date,
): Promise<{ census: BlockCensus; planned: number; truncated: number; releaseId: string }> {
  const entityIds = await loadSubjectEntityIds(client, args.limit);
  const semanticSnapshotId = await resolveSemanticSnapshotId(client);
  const { releaseId, supersedesReleaseId } = await nextReleaseId(client, args.asOfDate);

  const batch = await loadAssetSourceFacts(client, {
    entityIds,
    asOfDate: args.asOfDate,
    releaseId,
    semanticSnapshotId,
  });

  const plans = [...batch.values()].map((facts) => planCommonAssetView(facts));
  const truncated = truncationReport(batch);
  const census = censusOf(plans);

  if (args.mode === 'apply') {
    const safetyState = await resolveSafetyState(client);
    await client.query('BEGIN');
    try {
      // Keyed on the as-of date, not the release id: the id is unique per run by
      // construction, so locking it would let two concurrent runs both proceed and
      // publish two releases claiming the same day.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `common-asset-view:${args.asOfDate}`,
      ]);
      await openRelease(client, {
        releaseId,
        supersedesReleaseId,
        semanticSnapshotId,
        safetyState,
        builtAt: now.toISOString(),
        createdBy: 'run-common-asset-view',
      });
      for (const plan of plans) {
        await insertCommonAssetView(client, plan, {
          releaseId,
          semanticSnapshotId,
          builtBy: 'run-common-asset-view',
        });
      }
      await publishRelease(client, {
        releaseId,
        supersedesReleaseId,
        // The release digest is over the packet digests, so two releases agree only
        // when every packet in them agrees. That is what REQ-REL-001 compares.
        digest: releaseDigestOf(plans),
        freshUntil: new Date(now.valueOf() + 36 * 3_600_000).toISOString(),
        publishedAt: now.toISOString(),
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  return { census, planned: plans.length, truncated: truncated.length, releaseId };
}

/** Digest over every packet in the release, so two releases agree only when all their packets do. */
export function releaseDigestOf(plans: readonly CommonAssetViewPlan[]): string {
  return canonicalDigest(
    [...plans]
      .sort((a, b) => a.viewKey.localeCompare(b.viewKey))
      .map((plan) => [plan.viewKey, plan.packetDigest]),
  );
}

async function main(): Promise<void> {
  const now = new Date();
  const args = parseCommonAssetViewArgs(process.argv.slice(2), now.toISOString().slice(0, 10));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const result = await runCommonAssetView(client as unknown as QueryClient, args, now);
    console.log(
      JSON.stringify(
        {
          mode: args.mode,
          asOfDate: args.asOfDate,
          releaseId: result.releaseId,
          planned: result.planned,
          truncatedLists: result.truncated,
          census: result.census,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
