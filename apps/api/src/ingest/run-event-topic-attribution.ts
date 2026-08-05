// Attaches a macro-natured event to the TOPIC it is about.
//
// run-event-text-attribution attaches events to companies. This is its sibling
// for the events no company name appears in — "국채 금리가 급등했다" is about
// rates, and there is no issuer in the sentence to attach it to.
//
// Why a topic and not a series. knowledge.event.target_entity_id is a SINGLE
// value, and the rates topic has four mapped series (DGS10, DGS2, FEDFUNDS,
// WALCL). Picking one would be the invention this family of jobs exists to
// avoid, so under a strict rule only topics with exactly one series could ever
// be attributed — fx and energy, 15 events. The topic node removes the choice:
// a topic is always one thing, and MEASURED_BY carries the event back down to
// every series underneath it.
//
// Precedence needs no scheduling. run-event-text-attribution treats a Metric
// target as "not yet attributed" (its candidate set is `target_entity_id IS NULL
// OR target.entity_type = 'Metric'`), and a topic entity is a Metric. So if a
// company name does turn up in the text, that job overwrites this one's answer
// whichever order they run in. A company is a better answer than a topic and
// gets to win by construction rather than by cron ordering.

import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

const JOB_NAME = 'stock-insight-event-topic-attribution';
const POLICY = 'topic-vocabulary-exact-match-v1';
const APPLY = process.argv.includes('--apply');

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

// Only genuinely unattributed events. Measured 2026-08-05: of the events whose
// text matches a topic, exactly one already carries a non-null target, so
// widening this to Metric-labelled events would gain a single row while opening
// a fight with the company job over the collection-feed pseudo-entities that
// are its territory.
const CANDIDATE_SQL = `
WITH candidate AS (
  SELECT event.event_id, event.summary_text
  FROM serving.v_knowledge_event_current_v1 event
  WHERE event.summary_text IS NOT NULL
    AND event.target_entity_id IS NULL
),
hit AS (
  SELECT candidate.event_id, vocabulary.topic, min(vocabulary.term) AS term
  FROM candidate
  JOIN analytics.market_topic_term vocabulary
    ON vocabulary.active
   AND position(vocabulary.term in candidate.summary_text) > 0
  GROUP BY candidate.event_id, vocabulary.topic
)
SELECT hit.event_id,
       min(hit.topic) AS topic,
       min(hit.term) AS term,
       count(DISTINCT hit.topic) AS topic_matches,
       min(topic_entity.entity_id) AS topic_entity_id,
       -- Distinguishes "no node yet" from "no node possible". A topic with a
       -- mapped series but no entity means migration 068 is pending; a topic the
       -- mapping never lists (market, trade) has no series to bridge to at all,
       -- which is a measured dead end, not a schema gap.
       bool_or(mapped.topic IS NOT NULL) AS topic_has_series
FROM hit
LEFT JOIN core.entity topic_entity
  ON topic_entity.entity_type = 'Metric'
 AND topic_entity.canonical_name = 'topic:' || hit.topic
LEFT JOIN LATERAL (
  SELECT 1 AS topic FROM analytics.macro_series_topic mapping
  WHERE mapping.topic = hit.topic LIMIT 1
) mapped ON true
GROUP BY hit.event_id
ORDER BY hit.event_id
`;

// Guarded on IS NULL, not on a value read earlier: this job only ever fills a
// hole. If something attributed the event between the read and the write, that
// answer is at least as good as this one and must not be clobbered.
const UPDATE_SQL = `
UPDATE knowledge.event AS event
SET target_entity_id = $2::bigint,
    metadata = event.metadata || jsonb_build_object(
      'entity_resolution', jsonb_build_object(
        'policy', $3::text,
        'matched_term', $4::text,
        'matched_topic', $5::text,
        'matched_kind', 'topic',
        'resolved_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
WHERE event.event_id = $1::bigint
  AND event.target_entity_id IS NULL
RETURNING event_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

type TopicHitRow = QueryResultRow & {
  event_id: string | number;
  topic: string;
  term: string;
  topic_matches: string | number;
  topic_entity_id: string | number | null;
  topic_has_series: boolean | null;
};

export type TopicAttributionDecision =
  | { attach: true; topic: string; term: string; topicEntityId: number }
  | { attach: false; reason: 'ambiguous' | 'topic_entity_missing' | 'topic_has_no_series' };

/**
 * Two refusals, and they mean different things.
 *
 * `ambiguous` — the text matches more than one topic. An article about both
 * tariffs and the won is not an article about one of them, and choosing would be
 * a guess. Same rule the company job applies to two company names.
 *
 * `topic_has_no_series` — the vocabulary knows this topic but the mapping has no
 * series under it, so no node exists and none should: market and trade are dead
 * ends by measurement, not by oversight. FRED has no daily series representing
 * tariffs, and correlating every stock with an index is beta.
 *
 * `topic_entity_missing` — the topic HAS series but no core.entity, which only
 * happens while migration 068 is unapplied. Kept apart from the case above so a
 * pending migration can never be read as a permanent dead end, or the reverse.
 */
export function decideTopic(
  row: Pick<
    TopicHitRow,
    'topic' | 'term' | 'topic_matches' | 'topic_entity_id' | 'topic_has_series'
  >,
): TopicAttributionDecision {
  if (Number(row.topic_matches) !== 1) return { attach: false, reason: 'ambiguous' };
  if (row.topic_entity_id === null) {
    return {
      attach: false,
      reason: row.topic_has_series === true ? 'topic_entity_missing' : 'topic_has_no_series',
    };
  }
  return {
    attach: true,
    topic: row.topic,
    term: row.term,
    topicEntityId: Number(row.topic_entity_id),
  };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client: PoolClient = await pool.connect();

  try {
    const { rows } = await client.query<TopicHitRow>(CANDIDATE_SQL, []);
    const decided = rows.map((row) => ({ row, decision: decideTopic(row) }));
    const attachable = decided.filter((entry) => entry.decision.attach);
    const ambiguous = decided.filter(
      (entry) => !entry.decision.attach && entry.decision.reason === 'ambiguous',
    ).length;
    const missingEntity = decided.filter(
      (entry) => !entry.decision.attach && entry.decision.reason === 'topic_entity_missing',
    ).length;
    const noSeries = decided.filter(
      (entry) => !entry.decision.attach && entry.decision.reason === 'topic_has_no_series',
    ).length;

    let attached = 0;
    if (APPLY) {
      for (const entry of attachable) {
        if (!entry.decision.attach) continue;
        const result = await client.query(UPDATE_SQL, [
          entry.row.event_id,
          entry.decision.topicEntityId,
          POLICY,
          entry.decision.term,
          entry.decision.topic,
        ]);
        attached += result.rowCount ?? 0;
      }
    }

    const byTopic: Record<string, number> = {};
    for (const entry of attachable) {
      if (entry.decision.attach)
        byTopic[entry.decision.topic] = (byTopic[entry.decision.topic] ?? 0) + 1;
    }

    const summary = {
      job: JOB_NAME,
      mode: APPLY ? 'apply' : 'dry-run',
      policy: POLICY,
      matchedEvents: decided.length,
      attachable: attachable.length,
      ambiguousSkipped: ambiguous,
      // Not an error and not an ambiguity: migration 068 has not been applied.
      topicEntityMissingSkipped: missingEntity,
      // A measured dead end, not a gap. market and trade have no macro series to
      // bridge to, so there is nothing to attach these events to.
      topicHasNoSeriesSkipped: noSeries,
      byTopic,
      attached,
      sample: attachable.slice(0, 10).map((entry) => ({
        eventId: Number(entry.row.event_id),
        topic: entry.row.topic,
        term: entry.row.term,
      })),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (APPLY && attached > 0) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        `${JOB_NAME}-${randomUUID()}`,
        JOB_NAME,
        'completed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-event-topic-attribution.ts')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
