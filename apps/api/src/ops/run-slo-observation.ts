import { randomUUID } from 'node:crypto';
import pg, { type PoolClient } from 'pg';

// The SLO observer migration 083 described and nobody wrote.
//
// 083 created governance.slo_definition, governance.slo_observation and eight
// definitions, and its own header says why: "Without a ledger of what the SLOs are
// and what they measured, that clause has no input and safety state is decoration."
// The ledger was created and never written to. slo_observation sat at 0 rows, so
// slo_current_v1 reflected definitions and nothing else, and REQ-SAFE-002 had no
// input at all — the same shape as K4 reading expectations nothing produced.
//
// A GAUGE, NOT A GATE. This never throws on a breach. A breached SLO is a number to
// watch; whether it moves the product's state is migration 082's decision, taken by
// run-safety-state-downgrade.ts from the ledger this writes. Same split as
// run-table-reachability-audit.ts (reports) versus run-source-contract-audit.ts
// (fails the run).
//
// WINDOWS LOOK BACKWARD, SO VERIFICATION DOES NOT WAIT. Every measurement is a
// lookback from a cutoff, so any past cutoff can be computed now. `--as-of` and
// `--from/--to` exist for that: replaying thirty days answers "would this have
// caught the outage" and "does this fire on a normal weekend" today, instead of
// promoting thresholds nobody has ever seen fire. Replay is dry-run only — a past
// window's value written into an append-only ledger would distort which observation
// slo_current_v1 considers latest, and there is no delete.

const JOB_NAME = 'stock-insight-slo-observation';

export type SloComparison = 'at_least' | 'at_most';

export type SloDefinitionRow = {
  sloKey: string;
  sloKind: string;
  subject: string;
  comparison: SloComparison;
  threshold: number;
  unit: string;
  windowHours: number;
};

export type SloMeasurement = {
  observedValue: number;
  detail: Record<string, unknown>;
};

/**
 * Whether a measurement can honestly be computed for a past cutoff.
 *
 * serving.content_pack carries only a current status: a pack servable last week is
 * `superseded` now, with no history to reconstruct from. Evaluating today's status
 * against a past window produced a breach on all thirty-one replayed days while the
 * live cutoff read clean — a PIT violation, not a signal. These two refuse a past
 * cutoff rather than answer wrongly.
 */
const REPLAYABLE: Record<string, boolean> = {
  'knowledge.claim.growth': true,
  'ingestion.source_revision.growth': true,
  'knowledge.relation_evidence.growth': true,
  'ops.pipeline.expected_runs': true,
  'governance.coverage_ledger.delta': true,
  'ops.pipeline.wrapper_failure_streak': true,
  'ingestion.parser.drift': true,
  'serving.content_pack.servable': false,
  'serving.content_pack.freshness': false,
};

export type SloObservationRow = {
  sloKey: string;
  observedValue: number;
  thresholdAtObservation: number;
  comparisonAtObservation: SloComparison;
  breached: boolean;
  windowStart: string;
  windowEnd: string;
  detail: Record<string, unknown>;
};

export type SloSkip = { sloKey: string; reason: string };

/**
 * The verdict `slo_observation_verdict_matches` will accept, and no other.
 *
 * Both sides are strict: equality is clean. A gauge written with `<=` is rejected by
 * the CHECK at INSERT time, which is the constraint doing its job — the stored
 * verdict has to follow from the numbers stored beside it.
 */
export function sloBreached(
  comparison: SloComparison,
  observedValue: number,
  threshold: number,
): boolean {
  return comparison === 'at_least' ? observedValue < threshold : observedValue > threshold;
}

export function buildObservationRow(
  definition: SloDefinitionRow,
  measurement: SloMeasurement,
  window: { start: string; end: string },
): SloObservationRow {
  if (!Number.isFinite(measurement.observedValue)) {
    throw new Error(`${definition.sloKey} produced a non-finite observation`);
  }
  return {
    sloKey: definition.sloKey,
    observedValue: measurement.observedValue,
    // Snapshotted, not joined on read. A threshold can be revised and a past
    // observation must keep the verdict it was judged under.
    thresholdAtObservation: definition.threshold,
    comparisonAtObservation: definition.comparison,
    breached: sloBreached(definition.comparison, measurement.observedValue, definition.threshold),
    windowStart: window.start,
    windowEnd: window.end,
    detail: measurement.detail,
  };
}

export type SloObservationArgs = {
  apply: boolean;
  cutoffs: string[] | null;
};

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function dayCutoffs(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error('replay range must be YYYY-MM-DD');
  if (end < start) throw new Error('replay --to precedes --from');
  const cutoffs: string[] = [];
  for (let at = start; at <= end; at += 86_400_000) {
    cutoffs.push(new Date(at).toISOString());
  }
  return cutoffs;
}

export function parseSloObservationArgs(argv: readonly string[]): SloObservationArgs {
  let apply = false;
  let asOf: string | undefined;
  let from: string | undefined;
  let to: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--as-of' || argument === '--from' || argument === '--to') {
      const value = valueAfter(argv, index, argument);
      if (argument === '--as-of') asOf = value;
      else if (argument === '--from') from = value;
      else to = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown SLO observation argument: ${String(argument)}`);
  }
  if (asOf && (from || to)) throw new Error('--as-of cannot be combined with a replay range');
  if ((from && !to) || (to && !from)) throw new Error('replay needs both --from and --to');
  if (from && to) {
    // A replayed window is a calculation about the past, not something that was
    // observed then. Writing it would misrepresent when it was known.
    if (apply) throw new Error('replay is dry-run only');
    return { apply, cutoffs: dayCutoffs(from, to) };
  }
  if (asOf) {
    const parsed = new Date(asOf);
    if (Number.isNaN(parsed.valueOf())) throw new Error('--as-of must be a parseable timestamp');
    return { apply, cutoffs: [parsed.toISOString()] };
  }
  // null means "ask the database for its clock" — REQ-PIT-003 forbids now() as a
  // business cutoff, and run-pit-now-audit.ts audits the SQL text for it.
  return { apply, cutoffs: null };
}

type QueryClient = {
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

const DEFINITIONS_SQL = `
SELECT slo_key, slo_kind, subject, comparison, threshold::float8 AS threshold,
       unit, window_hours
  FROM governance.slo_definition
 WHERE definition_state = 'active'
 ORDER BY slo_key
`;

/**
 * One measurement per slo_key. Keyed by the definition rather than by kind, because
 * two `artifact_count` gauges over different subjects are different queries and
 * pretending otherwise is how a gauge ends up counting the wrong table.
 *
 * Each returns `observedValue` plus the detail that makes the number checkable.
 * A measurement with no input returns null: the SLO is then skipped and named in the
 * summary rather than given an invented value.
 */
const MEASUREMENTS: Record<
  string,
  (client: QueryClient, window: { start: string; end: string }) => Promise<SloMeasurement | null>
> = {
  'knowledge.claim.growth': async (client, window) => {
    const row = (
      await client.query(
        `SELECT count(*)::float8 AS observed, max(claim_id) AS max_claim_id
           FROM knowledge.claim
          WHERE observed_at >= $1::timestamptz AND observed_at < $2::timestamptz`,
        [window.start, window.end],
      )
    ).rows[0]!;
    return {
      observedValue: Number(row.observed),
      detail: {
        maxClaimId: row.max_claim_id == null ? null : Number(row.max_claim_id),
        // knowledge.claim has no insert-time column. observed_at is the closest
        // honest proxy for arrival, and a backfill carrying old observed_at values
        // would not register here.
        arrivalProxy: 'observed_at',
      },
    };
  },

  'ingestion.source_revision.growth': async (client, window) => {
    const row = (
      await client.query(
        `SELECT count(*)::float8 AS observed, count(DISTINCT source_record_identity_id) AS identities
           FROM ingestion.source_revision
          WHERE ingested_at >= $1::timestamptz AND ingested_at < $2::timestamptz`,
        [window.start, window.end],
      )
    ).rows[0]!;
    return {
      observedValue: Number(row.observed),
      detail: { distinctIdentities: Number(row.identities), arrivalProxy: 'ingested_at' },
    };
  },

  'serving.content_pack.servable': async (client, window) => {
    // A level, not a growth: "servable packs must exist" at the cutoff.
    const row = (
      await client.query(
        `SELECT count(*)::float8 AS observed
           FROM serving.content_pack
          WHERE status = 'published'
            AND published_at <= $1::timestamptz
            AND fresh_until > $1::timestamptz`,
        [window.end],
      )
    ).rows[0]!;
    return { observedValue: Number(row.observed), detail: { measuredAt: window.end } };
  },

  'ops.pipeline.expected_runs': async (client, window) => {
    const rows = (
      await client.query(
        // summary->>'wrapper_attempt', not source_system. Stage receipts carry
        // source_system='pipeline-wrapper' too — measured live, the looser filter
        // counted 191 rows where only 28 were wrapper attempts. Only
        // pipeline_start_wrapper_attempt stamps the flag.
        `SELECT job_name, count(*)::int AS attempts
           FROM public.migration_runs
          WHERE summary->>'wrapper_attempt' = 'true'
            AND started_at >= $1::timestamptz AND started_at < $2::timestamptz
          GROUP BY job_name ORDER BY job_name`,
        [window.start, window.end],
      )
    ).rows;
    const perWrapper = Object.fromEntries(
      rows.map((row) => [String(row.job_name), Number(row.attempts)]),
    );
    const total = rows.reduce((sum, row) => sum + Number(row.attempts), 0);
    return {
      observedValue: total,
      // The definition says "attempts observed versus scheduled" but its threshold is
      // at_least 1, and four wrappers are scheduled. The two do not agree and no code
      // or doc resolves it. The observer measures what is written and reports the
      // per-wrapper breakdown, so the gap is visible without a frozen threshold being
      // quietly rewritten here.
      detail: { perWrapper, scheduledWrapperCount: 4 },
    };
  },

  'serving.content_pack.freshness': async (client, window) => {
    const row = (
      await client.query(
        `SELECT extract(epoch FROM ($1::timestamptz - max(built_at))) / 3600.0 AS observed,
                max(built_at) AS newest_built_at
           FROM serving.content_pack
          WHERE status = 'published'
            AND published_at <= $1::timestamptz
            AND fresh_until > $1::timestamptz`,
        [window.end],
      )
    ).rows[0]!;
    // No servable pack at all is not an age. Reporting one would be inventing a
    // number, and "packs must exist" is already its own SLO.
    if (row.observed == null) return null;
    return {
      observedValue: Number(row.observed),
      detail: { newestBuiltAt: row.newest_built_at },
    };
  },

  'knowledge.relation_evidence.growth': async (client, window) => {
    const row = (
      await client.query(
        `SELECT count(*)::float8 AS observed,
                count(DISTINCT relation_identity_id) AS relations
           FROM knowledge.relation_evidence_ledger
          WHERE recorded_at >= $1::timestamptz AND recorded_at < $2::timestamptz`,
        [window.start, window.end],
      )
    ).rows[0]!;
    return {
      observedValue: Number(row.observed),
      detail: { distinctRelations: Number(row.relations), arrivalProxy: 'recorded_at' },
    };
  },

  'ingestion.parser.drift': async (client, window) => {
    // Drift is the two most recent shaped revisions of one source disagreeing, where
    // the newer of them landed inside the window. Comparing against "the newest shape
    // now" would report a change forever after it happened.
    const rows = (
      await client.query(
        `WITH ordered AS (
           SELECT source_id, shape_digest, revision_ingested_at,
                  row_number() OVER (PARTITION BY source_id
                                     ORDER BY revision_ingested_at DESC,
                                              source_shape_revision_id DESC) AS recency
             FROM governance.source_shape_revision
            WHERE revision_ingested_at < $2::timestamptz
         )
         SELECT newest.source_id, source.provider_key,
                newest.shape_digest <> prior.shape_digest AS drifted,
                newest.revision_ingested_at
           FROM ordered newest
           JOIN ordered prior
             ON prior.source_id = newest.source_id AND prior.recency = 2
           JOIN ingestion.source source ON source.source_id = newest.source_id
          WHERE newest.recency = 1
            AND newest.revision_ingested_at >= $1::timestamptz`,
        [window.start, window.end],
      )
    ).rows;
    const drifted = rows.filter((row) => row.drifted === true);
    // Sources with only one shaped revision have nothing to compare against. They are
    // not drift, and saying so keeps a count of zero from meaning "all clear" when it
    // means "nothing was comparable".
    const comparableTotal = (
      await client.query(
        `SELECT count(*)::int AS comparable
           FROM (SELECT source_id FROM governance.source_shape_revision
                  WHERE revision_ingested_at < $1::timestamptz
                  GROUP BY source_id HAVING count(*) >= 2) source_with_history`,
        [window.end],
      )
    ).rows[0]!;
    return {
      observedValue: drifted.length,
      detail: {
        driftedSources: drifted.map((row) => String(row.provider_key)).sort(),
        comparedInWindow: rows.length,
        sourcesWithShapeHistory: Number(comparableTotal.comparable),
      },
    };
  },

  'ops.pipeline.wrapper_failure_streak': async (client, window) => {
    // The logic of governance.pipeline_wrapper_health_v1, bounded by the cutoff
    // instead of by now(). The view answers "how are the wrappers" for an operator
    // reading a log line; a gauge has to answer it for a past cutoff too, or it can
    // never be replayed against the outage it exists for.
    const rows = (
      await client.query(
        `WITH wrapper_run AS (
           SELECT job_name, status,
                  row_number() OVER (PARTITION BY job_name
                                     ORDER BY started_at DESC, id DESC) AS recency
             FROM public.migration_runs
            WHERE job_name LIKE 'stock-insight-%-wrapper'
              AND status <> 'running'
              AND started_at < $1::timestamptz
         ),
         streak AS (
           SELECT job_name,
                  COALESCE(
                    (SELECT min(recency) FROM wrapper_run ok
                      WHERE ok.job_name = wrapper_run.job_name AND ok.status = 'completed') - 1,
                    max(recency)
                  ) AS consecutive_failures
             FROM wrapper_run GROUP BY job_name
         )
         SELECT job_name, consecutive_failures FROM streak ORDER BY job_name`,
        [window.end],
      )
    ).rows;
    const streaks = Object.fromEntries(
      rows.map((row) => [String(row.job_name), Number(row.consecutive_failures)]),
    );
    // Two consecutive settled failures is the pattern; one is a transient.
    const failing = Object.entries(streaks).filter(([, streak]) => streak >= 2);
    return {
      observedValue: failing.length,
      detail: {
        streaks,
        failingWrappers: failing.map(([job]) => job),
        // news and fundamentals leave no wrapper attempt row, so they cannot appear
        // here. Named so the count never reads as covering the whole fleet.
        uncoveredWrappers: ['stock-insight-news', 'stock-insight-fundamentals'],
      },
    };
  },

  'governance.coverage_ledger.delta': async (client, window) => {
    // Per coverage key, this revision's ratio minus the ratio of the revision it
    // superseded, and the observed value is the WORST of them.
    //
    // A mean or a summed ratio lets one source dying be hidden by another growing,
    // which is exactly the failure "coverage must not silently shrink" is about. The
    // minimum keeps the declared ratio_delta unit and makes that concealment
    // impossible.
    const row = (
      await client.query(
        `WITH revised AS (
           SELECT current.coverage_key,
                  current.observed_artifact_count::float8 / current.expected_artifact_count
                    - prior.observed_artifact_count::float8 / prior.expected_artifact_count
                    AS ratio_delta
             FROM governance.coverage_ledger current
             JOIN governance.coverage_ledger prior
               ON prior.coverage_ledger_id = current.supersedes_coverage_ledger_id
            WHERE current.created_at >= $1::timestamptz AND current.created_at < $2::timestamptz
              AND current.expected_artifact_count > 0
              AND prior.expected_artifact_count > 0
         ),
         windowed AS (
           SELECT count(*)::int AS revisions_in_window
             FROM governance.coverage_ledger
            WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
         )
         SELECT (SELECT min(ratio_delta) FROM revised) AS observed,
                (SELECT count(*) FROM revised) AS comparable,
                (SELECT revisions_in_window FROM windowed) AS revisions_in_window,
                (SELECT coverage_key FROM revised ORDER BY ratio_delta LIMIT 1) AS worst_key`,
        [window.start, window.end],
      )
    ).rows[0]!;
    if (row.observed == null) return null;
    const comparable = Number(row.comparable);
    const revisions = Number(row.revisions_in_window);
    return {
      observedValue: Number(row.observed),
      detail: {
        comparableRevisions: comparable,
        // Revisions with no predecessor or no positive expected count cannot yield a
        // ratio delta. Reported so the gauge never reads as covering more than it did.
        revisionsInWindow: revisions,
        excludedRevisions: revisions - comparable,
        worstCoverageKey: row.worst_key == null ? null : String(row.worst_key),
      },
    };
  },
};

export async function observeSlos(
  client: QueryClient,
  cutoff: string,
  options: { live?: boolean } = {},
): Promise<{ observations: SloObservationRow[]; skipped: SloSkip[] }> {
  const live = options.live ?? true;
  const definitions = (await client.query(DEFINITIONS_SQL)).rows.map(
    (row): SloDefinitionRow => ({
      sloKey: String(row.slo_key),
      sloKind: String(row.slo_kind),
      subject: String(row.subject),
      comparison: String(row.comparison) as SloComparison,
      threshold: Number(row.threshold),
      unit: String(row.unit),
      windowHours: Number(row.window_hours),
    }),
  );
  const observations: SloObservationRow[] = [];
  const skipped: SloSkip[] = [];
  for (const definition of definitions) {
    const measure = MEASUREMENTS[definition.sloKey];
    if (!measure) {
      skipped.push({
        sloKey: definition.sloKey,
        reason: 'no measurement implemented for this definition',
      });
      continue;
    }
    if (!live && REPLAYABLE[definition.sloKey] === false) {
      skipped.push({
        sloKey: definition.sloKey,
        reason: 'subject keeps no status history, so a past cutoff cannot be reconstructed',
      });
      continue;
    }
    const end = new Date(cutoff);
    const start = new Date(end.getTime() - definition.windowHours * 3_600_000);
    const window = { start: start.toISOString(), end: end.toISOString() };
    const measurement = await measure(client, window);
    if (!measurement) {
      skipped.push({ sloKey: definition.sloKey, reason: 'no measurable input in the window' });
      continue;
    }
    observations.push(buildObservationRow(definition, measurement, window));
  }
  return { observations, skipped };
}

const INSERT_OBSERVATION_SQL = `
INSERT INTO governance.slo_observation (
  slo_key, observed_value, threshold_at_observation, comparison_at_observation,
  breached, window_start, window_end, observed_by, detail
) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9::jsonb)
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

type PgModule = {
  Pool: new (options: { connectionString: string; max: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function run(): Promise<void> {
  const args = parseSloObservationArgs(process.argv.slice(2));
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    const cutoffs =
      args.cutoffs ??
      [String((await client.query('SELECT clock_timestamp() AS at')).rows[0]!.at)].map((value) =>
        new Date(value).toISOString(),
      );

    const runs: Array<{
      cutoff: string;
      observations: SloObservationRow[];
      skipped: SloSkip[];
    }> = [];
    for (const cutoff of cutoffs) {
      // The audit must never be the thing that changes what it is auditing.
      await client.query('BEGIN READ ONLY');
      try {
        const result = await observeSlos(client, cutoff, { live: args.cutoffs === null });
        runs.push({ cutoff, ...result });
      } finally {
        await client.query('COMMIT');
      }
    }

    const summary = {
      job: JOB_NAME,
      mode: args.apply ? 'apply' : 'dry-run',
      cutoffs: cutoffs.length,
      observations: runs.flatMap((entry) =>
        entry.observations.map((observation) => ({
          cutoff: entry.cutoff,
          sloKey: observation.sloKey,
          observedValue: observation.observedValue,
          threshold: observation.thresholdAtObservation,
          comparison: observation.comparisonAtObservation,
          breached: observation.breached,
          detail: observation.detail,
        })),
      ),
      // Never silent: an SLO with no measurable input is named, not dropped.
      skipped: runs.flatMap((entry) =>
        entry.skipped.map((skip) => ({ cutoff: entry.cutoff, ...skip })),
      ),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (args.apply) {
      for (const entry of runs) {
        for (const observation of entry.observations) {
          await client.query(INSERT_OBSERVATION_SQL, [
            observation.sloKey,
            observation.observedValue,
            observation.thresholdAtObservation,
            observation.comparisonAtObservation,
            observation.breached,
            observation.windowStart,
            observation.windowEnd,
            JOB_NAME,
            JSON.stringify(observation.detail),
          ]);
        }
      }
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

if (process.argv[1]?.endsWith('run-slo-observation.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
