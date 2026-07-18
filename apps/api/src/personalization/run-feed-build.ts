import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET F / F-2: personalized feed builder (Baseline §13).
// Two stages: candidate generation (published report + affinity-linked events +
// impact paths) then ranking with explanation codes and diversity constraints.
// No per-user LLM calls — assembly only. Editorial slots outrank preference.

const JOB_NAME = 'stock-insight-feed-build';
const FEED_SIZE = 20;
const MAX_SHARE_PER_ENTITY = 0.3;
const MIN_NEGATIVE_SLOTS = 1;

const USERS_SQL = `
SELECT profile.user_id,
       (now() AT TIME ZONE profile.timezone)::date::text AS feed_date
FROM personalization.user_profile profile
WHERE profile.personalization_opt_in
`;

const AFFINITY_SQL = `
SELECT affinity.user_id, affinity.asset_entity_id, affinity.affinity_type, affinity.weight
FROM personalization.user_asset_affinity affinity
WHERE affinity.valid_to IS NULL
`;

const PUBLISHED_REPORT_SQL = `
SELECT pointer.report_id, report.title
FROM serving.latest_report_pointer pointer
JOIN content.report report USING (report_id)
WHERE report.status = 'published'
`;

const CANDIDATE_EVENTS_SQL = `
SELECT event.event_id, event.event_type, event.target_entity_id,
       coalesce(event.occurred_at, event.created_at) AS occurred_at,
       (event.source_document_id IS NOT NULL) AS has_document,
       event.summary_text,
       coalesce(event.magnitude, 0) AS magnitude
FROM knowledge.event event
WHERE coalesce(event.occurred_at, event.created_at) >= now() - interval '7 days'
  AND event.target_entity_id IS NOT NULL
ORDER BY occurred_at DESC
LIMIT 500
`;

const CANDIDATE_PATHS_SQL = `
SELECT path.impact_path_id, path.target_entity_id, path.path_score,
       path.trigger_event_id, path.explanation ->> 'event_type' AS event_type
FROM analytics.impact_path path
WHERE path.expires_at > now()
ORDER BY path.path_score DESC
LIMIT 500
`;

// 1..2-hop neighborhood of the user's affinity assets (graph proximity signal).
const NEIGHBOR_SQL = `
WITH seed AS (
  SELECT DISTINCT affinity.asset_entity_id AS entity_id
  FROM personalization.user_asset_affinity affinity
  WHERE affinity.user_id = $1::uuid AND affinity.valid_to IS NULL
), hop1 AS (
  SELECT DISTINCT CASE WHEN relation.subject_entity_id = seed.entity_id
                       THEN relation.object_entity_id ELSE relation.subject_entity_id END AS entity_id
  FROM knowledge.relation relation
  JOIN seed ON seed.entity_id IN (relation.subject_entity_id, relation.object_entity_id)
  WHERE relation.status = 'active' AND relation.recorded_to IS NULL
)
SELECT entity_id, 1 AS hops FROM hop1
WHERE entity_id NOT IN (SELECT entity_id FROM seed)
`;

const NEGATIVE_EVENT_TYPES = new Set([
  'legal_action', 'supply_disruption', 'regulation', 'macro_shock', 'sec_8k',
]);

const CLEAR_SQL = `
DELETE FROM personalization.user_feed_item WHERE user_id = $1::uuid AND feed_date = $2::date
`;

const INSERT_ITEM_SQL = `
INSERT INTO personalization.user_feed_item (
  user_id, feed_date, rank, item_type, item_id, relevance_score, explanation_codes
) VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'derived', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

type Candidate = {
  itemType: 'report' | 'event' | 'impact_path';
  itemId: number;
  entityId: number | null;
  score: number;
  codes: string[];
  negative: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const users = await client.query<QueryResultRow & { user_id: string; feed_date: string }>(USERS_SQL);
    const affinities = await client.query<QueryResultRow & {
      user_id: string; asset_entity_id: string | number; affinity_type: string; weight: number;
    }>(AFFINITY_SQL);
    const reports = await client.query<QueryResultRow & { report_id: string | number; title: string }>(PUBLISHED_REPORT_SQL);
    const events = await client.query<QueryResultRow & {
      event_id: string | number; event_type: string; target_entity_id: string | number;
      occurred_at: Date; has_document: boolean; magnitude: string | number;
    }>(CANDIDATE_EVENTS_SQL);
    const paths = await client.query<QueryResultRow & {
      impact_path_id: string | number; target_entity_id: string | number;
      path_score: number; event_type: string | null;
    }>(CANDIDATE_PATHS_SQL);
    await client.query('COMMIT');

    let totalWritten = 0;
    const perUser: Record<string, { candidates: number; written: number; negativeSlots: number }> = {};

    for (const user of users.rows) {
      const userAffinity = new Map<number, { type: string; weight: number }>();
      for (const row of affinities.rows) {
        if (row.user_id === user.user_id) {
          userAffinity.set(Number(row.asset_entity_id), { type: row.affinity_type, weight: row.weight });
        }
      }
      await client.query('BEGIN READ ONLY');
      const neighbors = await client.query<QueryResultRow & { entity_id: string | number; hops: number }>(
        NEIGHBOR_SQL, [user.user_id]);
      await client.query('COMMIT');
      const neighborHops = new Map(neighbors.rows.map((row) => [Number(row.entity_id), row.hops]));

      const candidates: Candidate[] = [];
      // Editorial slot: latest published global report always leads the feed.
      for (const report of reports.rows) {
        candidates.push({
          itemType: 'report', itemId: Number(report.report_id), entityId: null,
          score: 10, codes: ['MARKET_ESSENTIAL'], negative: false,
        });
      }
      for (const event of events.rows) {
        const entityId = Number(event.target_entity_id);
        const affinity = userAffinity.get(entityId);
        const hops = neighborHops.get(entityId);
        const negative = NEGATIVE_EVENT_TYPES.has(event.event_type);
        let score = 0;
        const codes: string[] = [];
        if (affinity?.type === 'holding') { score += 1.0; codes.push('HOLDING_DIRECT'); }
        else if (affinity?.type === 'watchlist') { score += 0.9; codes.push('WATCHLIST_DIRECT'); }
        else if (hops !== undefined) { score += 0.5 / hops; codes.push(`SUPPLY_CHAIN_${hops}HOP`); }
        else { score += 0.1; codes.push('MARKET_WIDE'); }
        if (event.has_document) { score += 0.3; codes.push('SOURCE_BACKED'); }
        if (negative && affinity) { score += 0.4; codes.push('NEGATIVE_ON_HOLDING'); }
        const ageDays = (Date.now() - event.occurred_at.getTime()) / 86_400_000;
        score *= Math.exp(-Math.LN2 * (ageDays / 7));
        candidates.push({
          itemType: 'event', itemId: Number(event.event_id), entityId,
          score, codes, negative,
        });
      }
      for (const path of paths.rows) {
        const entityId = Number(path.target_entity_id);
        const affinity = userAffinity.get(entityId);
        if (!affinity) continue; // impact paths only surface for followed assets
        candidates.push({
          itemType: 'impact_path', itemId: Number(path.impact_path_id), entityId,
          score: 0.4 + path.path_score * 0.5,
          codes: [affinity.type === 'holding' ? 'HOLDING_DIRECT' : 'WATCHLIST_DIRECT', 'GRAPH_LINKAGE'],
          negative: NEGATIVE_EVENT_TYPES.has(path.event_type ?? ''),
        });
      }

      // Rank + diversity: max share per entity, at least one negative slot.
      candidates.sort((a, b) => b.score - a.score);
      const perEntityCap = Math.max(1, Math.floor(FEED_SIZE * MAX_SHARE_PER_ENTITY));
      const entityCounts = new Map<number, number>();
      const seen = new Set<string>();
      const selected: Candidate[] = [];
      const trySelect = (candidate: Candidate): boolean => {
        const key = `${candidate.itemType}:${candidate.itemId}`;
        if (seen.has(key)) return false;
        if (candidate.entityId !== null) {
          const count = entityCounts.get(candidate.entityId) ?? 0;
          if (count >= perEntityCap) return false;
          entityCounts.set(candidate.entityId, count + 1);
        }
        seen.add(key);
        selected.push(candidate);
        return true;
      };
      for (const candidate of candidates) {
        if (selected.length >= FEED_SIZE) break;
        trySelect(candidate);
      }
      // Negative-slot guarantee: swap in the best negative candidate if absent.
      if (!selected.some((candidate) => candidate.negative)) {
        const bestNegative = candidates.find(
          (candidate) => candidate.negative && !seen.has(`${candidate.itemType}:${candidate.itemId}`),
        );
        if (bestNegative && selected.length >= FEED_SIZE) {
          selected.pop();
          selected.push(bestNegative);
        } else if (bestNegative) {
          selected.push(bestNegative);
        }
      }

      perUser[user.user_id] = {
        candidates: candidates.length,
        written: selected.length,
        negativeSlots: selected.filter((candidate) => candidate.negative).length,
      };

      if (apply) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('statement_timeout', '60s', true)");
        await client.query(CLEAR_SQL, [user.user_id, user.feed_date]);
        let rank = 0;
        for (const candidate of selected) {
          rank += 1;
          await client.query(INSERT_ITEM_SQL, [
            user.user_id, user.feed_date, rank, candidate.itemType, candidate.itemId,
            Number(candidate.score.toFixed(4)), candidate.codes,
          ]);
          totalWritten += 1;
        }
        await client.query('COMMIT');
      }
    }

    const feedDates = Object.fromEntries(users.rows.map((user) => [user.user_id, user.feed_date]));
    const summary = { feedDates, users: users.rows.length, totalWritten, perUser };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `feed-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      users.rows.length,
      totalWritten,
      0,
      JSON.stringify(summary),
    ]);
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
