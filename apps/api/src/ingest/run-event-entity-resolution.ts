import pg, { type PoolClient } from 'pg';

// Migration 012 imported legacy market signals into knowledge.event and tried to
// carry the entity link with them:
//
//   LEFT JOIN core.entity_identifier stock_ident
//     ON stock_ident.identifier_type = 'INTERNAL_KEY'
//    AND stock_ident.identifier_value = legacy_entity.entity_key
//
// It is a LEFT JOIN, so every signal whose identifier did not exist *at migration
// time* landed with target_entity_id NULL. core.entity_identifier was filled out
// afterwards — by migrations 009/029 and the ongoing core-identity sync — and the
// same join now resolves for all 1,516 of them.
//
// So this is not new attribution. It is migration 012's own rule, re-applied
// against the identifiers that exist today. Nothing is inferred from text: the
// chain is entirely foreign keys.
//
//   event.metadata.legacy_signal_id -> market_signals.entity_id
//     -> entities.entity_key -> core.entity_identifier(INTERNAL_KEY) -> core.entity
//
// The 889 unlinked events that DO have a source document are deliberately left
// alone: only one of them resolves through a legacy signal, so attributing the
// rest would mean guessing a company from news text. That is a different problem
// with a different evidence bar.

const JOB_NAME = 'stock-insight-event-entity-resolution';
const APPLY = process.argv.includes('--apply');

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

// Only NULL -> value. An event that already names an entity is never rewritten:
// this pass fills a gap, it does not adjudicate existing links.
const RESOLVABLE_SQL = `
SELECT event.event_id, identifier.entity_id
FROM knowledge.event event
JOIN public.market_signals signal
  ON signal.id = (event.metadata->>'legacy_signal_id')::bigint
JOIN public.entities legacy_entity ON legacy_entity.id = signal.entity_id
JOIN core.entity_identifier identifier
  ON identifier.identifier_type = 'INTERNAL_KEY'
 AND identifier.identifier_value = legacy_entity.entity_key
WHERE event.target_entity_id IS NULL
  AND event.metadata->>'provenance' = 'legacy_no_document'
`;

const UPDATE_SQL = `
UPDATE knowledge.event AS event
SET target_entity_id = resolved.entity_id,
    metadata = event.metadata || jsonb_build_object(
      'entity_resolution', jsonb_build_object(
        'policy', 'legacy-signal-identifier-v1',
        'resolved_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
FROM (${RESOLVABLE_SQL}) AS resolved
WHERE event.event_id = resolved.event_id
  AND event.target_entity_id IS NULL
`;

const COUNTS_SQL = `
SELECT
  (SELECT count(*) FROM knowledge.event WHERE target_entity_id IS NULL)::bigint AS unlinked,
  (SELECT count(*) FROM knowledge.event
     WHERE target_entity_id IS NULL AND source_document_id IS NOT NULL)::bigint AS unlinked_with_document,
  (SELECT count(*) FROM (${RESOLVABLE_SQL}) resolvable)::bigint AS resolvable
`;

const INSERT_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES (
  'event-entity-resolution-' || gen_random_uuid()::text,
  $1, 'legacy-signal-identifier', 'completed', $2, clock_timestamp(),
  $3, $4, $5, null, $6::jsonb
)
`;

export type EventEntityCounts = {
  unlinked: number;
  unlinkedWithDocument: number;
  resolvable: number;
};

/**
 * What is left to do after a pass, and whether it is the kind that this runner
 * can do anything about.
 *
 * Pure so the distinction is testable: "still unlinked" is expected and fine —
 * news-derived events have no identifier chain — but "still resolvable" after a
 * run means the update did not take, which is a failure.
 */
export function residualFailure(counts: EventEntityCounts): string | null {
  if (counts.resolvable === 0) return null;
  return `event entity resolution left ${counts.resolvable} resolvable events unlinked`;
}

async function readCounts(client: PoolClient): Promise<EventEntityCounts> {
  const result = await client.query<{
    unlinked: string;
    unlinked_with_document: string;
    resolvable: string;
  }>(COUNTS_SQL);
  const row = result.rows[0]!;
  return {
    unlinked: Number(row.unlinked),
    unlinkedWithDocument: Number(row.unlinked_with_document),
    resolvable: Number(row.resolvable),
  };
}

async function run(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('stock-insight-event-entity-resolution', 0))",
    );

    const before = await readCounts(client);

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            ...before,
            // Everything else lacks an identifier chain and would need entity
            // extraction from text — a different evidence bar, not this job.
            notResolvableHere: before.unlinked - before.resolvable,
            hint: before.resolvable === 0 ? 'nothing to resolve' : 'rerun with --apply',
          },
          null,
          2,
        ),
      );
      return;
    }

    const updated = await client.query(UPDATE_SQL);
    const after = await readCounts(client);
    const failure = residualFailure(after);
    if (failure) throw new Error(failure);

    const summary = {
      mode: 'apply',
      resolved: updated.rowCount ?? 0,
      unlinkedBefore: before.unlinked,
      unlinkedAfter: after.unlinked,
      unlinkedWithDocument: after.unlinkedWithDocument,
    };
    await client.query(INSERT_RUN_SQL, [
      JOB_NAME,
      startedAt,
      before.resolvable,
      summary.resolved,
      after.unlinked,
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

if (process.argv[1]?.endsWith('run-event-entity-resolution.ts')) {
  await run();
}
