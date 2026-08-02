import pg, { type PoolClient } from 'pg';

// The world plane has no producer. Migration 032 projected knowledge.event into
// world.event once, on 2026-07-24, and ended with a parity assertion that
// world.event count equals knowledge.event count. That held at migration time.
// It has not held since: knowledge.event keeps growing (40-140 rows a day) while
// world.event froze at 3,041, and by 2026-08-03 the gap was 923 events — 23% of
// the plane missing, widening daily.
//
// serving.v_world_event_current_v1 reports a 100% yield over that frozen set, so
// nothing downstream looks broken. It is a snapshot of a dead pond.
//
// This runner is migration 032's projection, kept running. It invents nothing:
// the same event_key derivation, the same conservative 'rumored' lifecycle, the
// same rule that a participant row appears only where a real target entity
// already exists. Advancing lifecycle beyond 'rumored' needs evidence and is a
// separate problem (same family as claim verification).

const JOB_NAME = 'stock-insight-world-event-sync';
const APPLY = process.argv.includes('--apply');
const BACKFILL_POLICY = 'p1-w2-legacy-v1';

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

// Each legacy dedupe_key becomes a story cluster.
const STORY_SQL = `
INSERT INTO ingestion.story (story_key, first_published_at, metadata)
SELECT DISTINCT 'legacy-event:'||event.dedupe_key,
       min(event.announced_at) OVER (PARTITION BY event.dedupe_key),
       jsonb_build_object('backfill_policy',$1::text)
FROM knowledge.event event
ON CONFLICT (story_key) DO NOTHING
`;

// No policy metadata here: world.event has no metadata column — the provenance
// lives on the revision.
const EVENT_SQL = `
INSERT INTO world.event (event_key, event_type, subject_scope)
SELECT 'legacy-event:'||event.event_id::text, event.event_type, 'single_entity'
FROM knowledge.event event
ON CONFLICT (event_key) DO NOTHING
`;

// revision_no is always 1: this is a projection of a legacy row, not a revision
// history of its own. A legacy event that changes would need its own revision
// rule, which does not exist yet — so we never write revision 2 here.
const REVISION_SQL = `
INSERT INTO world.event_revision (
  event_id, revision_no, lifecycle_state, summary_text, magnitude, magnitude_unit,
  surprise_score, story_id, source_revision_id, extraction_run_id,
  published_at, available_at, known_at, valid_from, metadata
)
SELECT world_event.event_id, 1, 'rumored',
       event.summary_text, event.magnitude, event.magnitude_unit, event.surprise_score,
       story.story_id, NULL, event.extraction_run_id,
       event.announced_at, event.announced_at,
       greatest(event.announced_at, event.created_at), event.occurred_at,
       jsonb_build_object(
         'backfill_policy',$1::text,
         'legacy_event_id',event.event_id,
         'legacy_verification_status',event.verification_status
       )
FROM knowledge.event event
JOIN world.event world_event
  ON world_event.event_key = 'legacy-event:'||event.event_id::text
LEFT JOIN ingestion.story story
  ON story.story_key = 'legacy-event:'||event.dedupe_key
WHERE NOT EXISTS (
  SELECT 1 FROM world.event_revision existing
  WHERE existing.event_id = world_event.event_id AND existing.revision_no = 1
)
`;

// No entity link is invented: a participant row appears only where the legacy
// event already names a real target entity.
const PARTICIPANT_SQL = `
INSERT INTO world.event_participant (event_revision_id, entity_id, participant_role, role_detail)
SELECT revision.event_revision_id, event.target_entity_id, 'target',
       jsonb_build_object('backfill_policy',$1::text)
FROM knowledge.event event
JOIN world.event world_event
  ON world_event.event_key = 'legacy-event:'||event.event_id::text
JOIN world.event_revision revision
  ON revision.event_id = world_event.event_id AND revision.revision_no = 1
WHERE event.target_entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM world.event_participant existing
    WHERE existing.event_revision_id = revision.event_revision_id
      AND existing.participant_role = 'target'
      AND existing.entity_id IS NOT DISTINCT FROM event.target_entity_id
  )
`;

const PARITY_SQL = `
SELECT
  (SELECT count(*) FROM knowledge.event)::bigint AS legacy_events,
  (SELECT count(*) FROM world.event WHERE event_key LIKE 'legacy-event:%')::bigint AS world_events,
  (SELECT count(*) FROM world.event_revision revision
     JOIN world.event world_event USING (event_id)
     WHERE world_event.event_key LIKE 'legacy-event:%' AND revision.revision_no = 1
  )::bigint AS world_revisions
`;

const INSERT_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES (
  'world-event-sync-' || gen_random_uuid()::text,
  $1, 'world-projection', 'completed', $2, clock_timestamp(),
  $3, $4, $5, null, $6::jsonb
)
`;

export type WorldEventParity = {
  legacyEvents: number;
  worldEvents: number;
  worldRevisions: number;
};

/**
 * Pure check so the parity rule is testable without a database.
 *
 * Migration 032 ended with exactly this assertion and it has been silently false
 * since the day after it ran. Re-asserting it every sync is what turns "the world
 * plane drifted" from something you have to go looking for into something that
 * fails loudly.
 */
export function parityFailure(parity: WorldEventParity): string | null {
  if (parity.worldEvents === parity.legacyEvents && parity.worldRevisions === parity.legacyEvents) {
    return null;
  }
  return (
    `world-event projection parity mismatch: legacy=${parity.legacyEvents} ` +
    `events=${parity.worldEvents} revisions=${parity.worldRevisions}`
  );
}

async function readParity(client: PoolClient): Promise<WorldEventParity> {
  const result = await client.query<{
    legacy_events: string;
    world_events: string;
    world_revisions: string;
  }>(PARITY_SQL);
  const row = result.rows[0]!;
  return {
    legacyEvents: Number(row.legacy_events),
    worldEvents: Number(row.world_events),
    worldRevisions: Number(row.world_revisions),
  };
}

async function run(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    // One projector at a time. Two concurrent runs would both see the same gap.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('stock-insight-world-event-sync', 0))",
    );

    const before = await readParity(client);

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            ...before,
            missingEvents: before.legacyEvents - before.worldEvents,
            missingRevisions: before.legacyEvents - before.worldRevisions,
            hint: before.legacyEvents === before.worldEvents ? 'in sync' : 'rerun with --apply',
          },
          null,
          2,
        ),
      );
      return;
    }

    const stories = await client.query(STORY_SQL, [BACKFILL_POLICY]);
    const events = await client.query(EVENT_SQL);
    const revisions = await client.query(REVISION_SQL, [BACKFILL_POLICY]);
    const participants = await client.query(PARTICIPANT_SQL, [BACKFILL_POLICY]);

    const after = await readParity(client);
    // Fail closed: a projection that cannot reach parity has a rule this runner
    // does not implement, and committing a partial plane would restore exactly the
    // "100% yield over a frozen set" illusion this exists to end.
    const failure = parityFailure(after);
    if (failure) throw new Error(failure);

    const summary = {
      mode: 'apply',
      storiesInserted: stories.rowCount ?? 0,
      eventsInserted: events.rowCount ?? 0,
      revisionsInserted: revisions.rowCount ?? 0,
      participantsInserted: participants.rowCount ?? 0,
      ...after,
    };
    await client.query(INSERT_RUN_SQL, [
      JOB_NAME,
      startedAt,
      after.legacyEvents,
      summary.eventsInserted + summary.revisionsInserted,
      after.legacyEvents - summary.eventsInserted,
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ jobName: JOB_NAME, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Importing this module for its pure parity check must not open a connection.
if (process.argv[1]?.endsWith('run-world-event-sync.ts')) {
  await run();
}
