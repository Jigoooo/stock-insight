import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// Attaches an event to a company when its own text names that company outright.
//
// run-event-entity-resolution.ts resolves events through foreign keys only
// (legacy_signal_id -> market_signals -> entities). Events extracted from news
// documents have no such key, so 891 unique summaries sit unattributed even when
// the headline says "AMD Stock Dips Ahead of Earnings".
//
// This is inference and it is named as such. What keeps it defensible is the
// narrowness, measured 2026-08-03 against the whole unattributed set:
//
//   name >= 4 chars, single match     21 events, sample clean
//   ticker >= 3 chars, word boundary   7 events, sample clean
//   neither                          852 events (96.8%)
//
// The loose version was measured too and rejected: allowing 2-character names
// matched 하이브 inside 하이브리드, SK inside SK실트론, and LS inside "홍콩 ELS
// 과징금". Korean particles attach directly to nouns, so no word-boundary rule
// separates 두산으로의 (correct) from 두산타워 (wrong) — the fix has to be the
// length floor, not a cleverer boundary.
//
// Every write records which string matched, so a wrong attribution can be found
// and reversed by that string rather than re-derived.

const JOB_NAME = 'stock-insight-event-text-attribution';
const POLICY = 'text-exact-match-v1';
const APPLY = process.argv.includes('--apply');

// Below 4 the false-positive classes above appear. Tickers get 3 because they are
// matched on a word boundary, which Latin text actually honours.
const MIN_NAME_LENGTH = 4;
const MIN_TICKER_LENGTH = 3;

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

// One statement so candidates, names and tickers are read consistently, and so a
// second match for the same event can veto the first rather than racing it.
const CANDIDATE_SQL = `
WITH company_name AS (
  SELECT identity.entity_id, source.name
  FROM (
    SELECT entity_key, name FROM public.company_profiles WHERE name IS NOT NULL
    UNION
    SELECT NULL::text, name FROM core.v_security_universe WHERE name IS NOT NULL
  ) source
  JOIN core.entity_identifier identity
    ON identity.identifier_type = 'INTERNAL_KEY'
   AND identity.identifier_value = coalesce(
         source.entity_key,
         (SELECT cp.entity_key FROM public.company_profiles cp WHERE cp.name = source.name LIMIT 1)
       )
  WHERE char_length(btrim(regexp_replace(source.name, '\\(주\\)|주식회사', '', 'g'))) >= $1
),
ticker AS (
  SELECT identity.entity_id, substring(identity.identifier_value from 4) AS symbol
  FROM core.entity_identifier identity
  WHERE identity.identifier_type = 'INTERNAL_KEY'
    AND identity.identifier_value LIKE 'US:%'
    AND char_length(substring(identity.identifier_value from 4)) >= $2
),
-- Current revisions only. Migration 062 made a re-extraction supersede rather
-- than duplicate; attaching a company to a superseded observation would put the
-- same headline on its page more than once.
--
-- Two kinds of candidate, and the second one is why this job was widened.
--
-- Unattributed events are the original case. But 1,302 events measured
-- 2026-08-04 are attributed to a Metric pseudo-entity — us_insider_buys,
-- us_corporate_events, gl_major_event — which are the names of collection feeds,
-- not things a headline is about. All 258 gl_major_event rows are SpaceX stories.
-- Those events were invisible here because they already had a target, so the
-- IS NULL filter skipped them: a wrong answer hid the question.
--
-- The matching rules below are unchanged. This widens what is asked, not what
-- counts as a match — a Metric target is treated as "not yet attributed", which
-- is what it actually is.
candidate AS (
  SELECT event.event_id, event.summary_text, event.target_entity_id
  FROM serving.v_knowledge_event_current_v1 event
  LEFT JOIN core.entity target ON target.entity_id = event.target_entity_id
  WHERE event.summary_text IS NOT NULL
    AND (event.target_entity_id IS NULL OR target.entity_type = 'Metric')
),
hit AS (
  SELECT candidate.event_id, company_name.entity_id, company_name.name AS term, 'name' AS kind
  FROM candidate
  JOIN company_name
    ON position(btrim(regexp_replace(company_name.name, '\\(주\\)|주식회사', '', 'g'))
                in candidate.summary_text) > 0
  UNION
  SELECT candidate.event_id, ticker.entity_id, ticker.symbol, 'ticker'
  FROM candidate
  JOIN ticker ON candidate.summary_text ~ ('\\y' || ticker.symbol || '\\y')
)
SELECT hit.event_id,
       min(hit.entity_id) AS entity_id,
       min(hit.term) AS term,
       min(hit.kind) AS kind,
       count(DISTINCT hit.entity_id) AS entity_matches,
       -- Carried so the write can be guarded against the value it was read at,
       -- and so a wrong move is reversible from the row itself.
       min(candidate.target_entity_id) AS previous_target_entity_id
FROM hit
JOIN candidate ON candidate.event_id = hit.event_id
GROUP BY hit.event_id
ORDER BY hit.event_id
`;

// Ambiguity is not resolved by picking one. An event naming two companies is a
// different kind of event, and guessing which one it is about would be exactly
// the invention this job avoids.
// The guard is now "still what we read", not "still null". Widening the candidate
// set to Metric-targeted events means this can overwrite a target, so the write
// must not clobber a value that changed under it — and the value it replaces is
// recorded, so a wrong move is reversible from the row rather than re-derived.
const UPDATE_SQL = `
UPDATE knowledge.event AS event
SET target_entity_id = $2::bigint,
    metadata = event.metadata || jsonb_build_object(
      'entity_resolution', jsonb_build_object(
        'policy', $3::text,
        'matched_term', $4::text,
        'matched_kind', $5::text,
        'previous_target_entity_id', $6::bigint,
        'resolved_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
WHERE event.event_id = $1::bigint
  AND event.target_entity_id IS NOT DISTINCT FROM $6::bigint
RETURNING event_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

type HitRow = QueryResultRow & {
  event_id: string | number;
  entity_id: string | number;
  term: string;
  kind: string;
  entity_matches: string | number;
  previous_target_entity_id: string | number | null;
};

export type AttributionDecision =
  | { attach: true; term: string; kind: string }
  | { attach: false; reason: 'ambiguous' };

export function decide(row: Pick<HitRow, 'term' | 'kind' | 'entity_matches'>): AttributionDecision {
  if (Number(row.entity_matches) !== 1) return { attach: false, reason: 'ambiguous' };
  return { attach: true, term: row.term, kind: row.kind };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client: PoolClient = await pool.connect();

  try {
    const { rows } = await client.query<HitRow>(CANDIDATE_SQL, [
      MIN_NAME_LENGTH,
      MIN_TICKER_LENGTH,
    ]);
    const decided = rows.map((row) => ({ row, decision: decide(row) }));
    const attachable = decided.filter((entry) => entry.decision.attach);
    const ambiguous = decided.length - attachable.length;

    let attached = 0;
    if (APPLY) {
      for (const entry of attachable) {
        if (!entry.decision.attach) continue;
        const result = await client.query(UPDATE_SQL, [
          entry.row.event_id,
          entry.row.entity_id,
          POLICY,
          entry.decision.term,
          entry.decision.kind,
          entry.row.previous_target_entity_id,
        ]);
        attached += result.rowCount ?? 0;
      }
    }

    const byKind: Record<string, number> = {};
    for (const entry of attachable) {
      if (entry.decision.attach)
        byKind[entry.decision.kind] = (byKind[entry.decision.kind] ?? 0) + 1;
    }

    const summary = {
      job: JOB_NAME,
      mode: APPLY ? 'apply' : 'dry-run',
      policy: POLICY,
      minNameLength: MIN_NAME_LENGTH,
      minTickerLength: MIN_TICKER_LENGTH,
      matchedEvents: decided.length,
      attachable: attachable.length,
      ambiguousSkipped: ambiguous,
      byKind,
      attached,
      // Two different things happen now and a single total hides which. A fresh
      // attribution fills a hole; a move takes an event off a collection-feed
      // label it never belonged to. The second is the reason this job was widened.
      attachableFromNull: attachable.filter((entry) => entry.row.previous_target_entity_id === null)
        .length,
      attachableFromMetricLabel: attachable.filter(
        (entry) => entry.row.previous_target_entity_id !== null,
      ).length,
      sample: attachable.slice(0, 10).map((entry) => ({
        eventId: Number(entry.row.event_id),
        term: entry.row.term,
        kind: entry.row.kind,
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

if (process.argv[1]?.endsWith('run-event-text-attribution.ts')) {
  await main();
}
