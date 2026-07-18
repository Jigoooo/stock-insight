import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  computeProbabilityMetrics,
  expandingLabelProbabilities,
  type ExpandingForecast,
  type ProbabilityObservation,
} from './probability-calibration.ts';

const JOB_NAME = 'stock-insight-probability-calibration';
const MIN_SAMPLE_N = 30;

const OUTCOMES_SQL = `
SELECT issuance.id,
       issuance.market,
       issuance.horizon_days,
       coalesce(issuance.confidence_label, 'unlabeled') AS confidence_label,
       issuance.issued_at,
       issuance.predicted_probability::float8 AS predicted_probability,
       issuance.probability_method,
       issuance.probability_reference_at,
       outcome.known_at,
       outcome.observed_on,
       outcome.target_hit
FROM ops.forecast_issuance_ledger issuance
JOIN ops.v_forecast_first_mature_outcome outcome
  ON outcome.forecast_id = issuance.id
WHERE outcome.evaluation_phase = 'final'
  AND outcome.target_hit IS NOT NULL
  AND outcome.known_at <= $1::timestamptz
ORDER BY issuance.issued_at, issuance.id
`;

const REFRESH_LABEL_CALIBRATION_SQL = `
INSERT INTO analytics.calibration_profile (
  group_market, group_horizon_days, group_confidence, sample_n,
  target_hit_rate, invalidation_rate, direction_hit_rate, avg_outcome_value,
  insufficient_sample, method, sample_from, sample_to, computed_at
)
SELECT issuance.market,
       issuance.horizon_days,
       coalesce(issuance.confidence_label, 'unlabeled'),
       count(*)::int,
       round(avg(CASE WHEN outcome.target_hit THEN 1.0 ELSE 0.0 END)::numeric, 4),
       round(avg(CASE WHEN outcome.invalidation_hit THEN 1.0 ELSE 0.0 END)::numeric, 4),
       CASE WHEN count(outcome.direction_hit) >= 10
            THEN round(avg(CASE WHEN outcome.direction_hit THEN 1.0 ELSE 0.0 END)::numeric, 4) END,
       round(avg(outcome.outcome_value)::numeric, 4),
       count(*) < 30,
       'label_hit_rate_v2 (probability metrics in serving.probability_scorecard_v1)',
       min(outcome.observed_on),
       max(outcome.observed_on),
       $1::timestamptz
FROM ops.v_forecast_first_mature_outcome outcome
JOIN ops.forecast_issuance_ledger issuance ON issuance.id = outcome.forecast_id
WHERE outcome.evaluation_phase = 'final'
  AND outcome.target_hit IS NOT NULL
  AND outcome.known_at <= $1::timestamptz
GROUP BY 1, 2, 3
ON CONFLICT (
  group_market, group_horizon_days, group_confidence,
  ((computed_at AT TIME ZONE 'UTC')::date)
) WHERE method = 'label_hit_rate_v2 (probability metrics in serving.probability_scorecard_v1)'
DO UPDATE SET
  sample_n = EXCLUDED.sample_n,
  target_hit_rate = EXCLUDED.target_hit_rate,
  invalidation_rate = EXCLUDED.invalidation_rate,
  direction_hit_rate = EXCLUDED.direction_hit_rate,
  avg_outcome_value = EXCLUDED.avg_outcome_value,
  insufficient_sample = EXCLUDED.insufficient_sample,
  sample_from = EXCLUDED.sample_from,
  sample_to = EXCLUDED.sample_to,
  computed_at = EXCLUDED.computed_at
WHERE analytics.calibration_profile.computed_at <= EXCLUDED.computed_at
RETURNING profile_id
`;

const UPSERT_SNAPSHOT_SQL = `
INSERT INTO analytics.probability_calibration_snapshot (
  evaluation_mode, group_market, group_horizon_days, probability_method,
  sample_n, brier_score, log_loss, expected_calibration_error,
  calibration_bins, insufficient_sample, sample_from, sample_to,
  data_cutoff, computed_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, now())
ON CONFLICT (
  evaluation_mode, group_market, group_horizon_days, probability_method, data_cutoff
) DO UPDATE SET
  sample_n = EXCLUDED.sample_n,
  brier_score = EXCLUDED.brier_score,
  log_loss = EXCLUDED.log_loss,
  expected_calibration_error = EXCLUDED.expected_calibration_error,
  calibration_bins = EXCLUDED.calibration_bins,
  insufficient_sample = EXCLUDED.insufficient_sample,
  sample_from = EXCLUDED.sample_from,
  sample_to = EXCLUDED.sample_to,
  computed_at = now()
RETURNING snapshot_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'derived', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type OutcomeRow = QueryResultRow & {
  id: string | number;
  market: string;
  horizon_days: number;
  confidence_label: string;
  issued_at: Date;
  predicted_probability: number | null;
  probability_method: string | null;
  probability_reference_at: Date | null;
  known_at: Date;
  observed_on: Date;
  target_hit: boolean;
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

type ScoredRow = {
  market: string;
  horizonDays: number;
  method: string;
  probability: number;
  outcome: boolean;
  observedOn: Date;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function groupRows(rows: ScoredRow[]): Map<string, ScoredRow[]> {
  const groups = new Map<string, ScoredRow[]>();
  for (const row of rows) {
    const key = `${row.market}\0${row.horizonDays}\0${row.method}`;
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return groups;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query<OutcomeRow>(OUTCOMES_SQL, [startedAt.toISOString()]);
    await client.query('COMMIT');
    const rows = result.rows;
    const cutoff = rows.reduce(
      (max, row) => (row.known_at > max ? row.known_at : max),
      new Date(0),
    );

    // Live mode: only probabilities actually stamped on issuance, with a PIT-safe reference.
    const liveRows: ScoredRow[] = rows
      .filter(
        (row) =>
          row.predicted_probability !== null &&
          row.probability_method !== null &&
          row.probability_reference_at !== null &&
          row.probability_reference_at <= row.issued_at,
      )
      .map((row) => ({
        market: row.market,
        horizonDays: row.horizon_days,
        method: row.probability_method!,
        probability: row.predicted_probability!,
        outcome: row.target_hit,
        observedOn: row.observed_on,
      }));

    // Historical mode: expanding-window segment base rate. Each row sees only outcomes
    // whose knownAt was available at its own issuance time.
    const expandingInput: ExpandingForecast[] = rows.map((row) => ({
      id: Number(row.id),
      market: row.market,
      horizonDays: row.horizon_days,
      confidenceLabel: row.confidence_label,
      issuedAt: row.issued_at,
      knownAt: row.known_at,
      targetHit: row.target_hit,
    }));
    const expandingRows: ScoredRow[] = expandingLabelProbabilities(expandingInput, MIN_SAMPLE_N).map(
      (row) => ({
        market: row.market,
        horizonDays: row.horizonDays,
        method: 'expanding_label_target_hit_v1',
        probability: row.probability,
        outcome: row.targetHit,
        observedOn: rows.find((source) => Number(source.id) === row.id)!.observed_on,
      }),
    );

    const modes = [
      { name: 'live_issued_probability', rows: liveRows },
      { name: 'historical_expanding_baseline', rows: expandingRows },
    ] as const;
    const snapshots: Array<Record<string, unknown>> = [];
    let written = 0;
    let labelProfilesWritten = 0;

    if (apply) {
      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '120s', true)");
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [JOB_NAME]);
      const labelRefresh = await client.query(REFRESH_LABEL_CALIBRATION_SQL, [
        startedAt.toISOString(),
      ]);
      labelProfilesWritten = labelRefresh.rowCount ?? 0;
    }
    for (const mode of modes) {
      for (const group of groupRows(mode.rows).values()) {
        const sample = group[0]!;
        const observations: ProbabilityObservation[] = group.map((row) => ({
          probability: row.probability,
          outcome: row.outcome,
        }));
        const metrics = computeProbabilityMetrics(observations);
        const dates = group.map((row) => row.observedOn).sort((a, b) => a.getTime() - b.getTime());
        const snapshot = {
          evaluationMode: mode.name,
          market: sample.market,
          horizonDays: sample.horizonDays,
          probabilityMethod: sample.method,
          ...metrics,
          insufficientSample: metrics.sample_n < MIN_SAMPLE_N,
          sampleFrom: dates[0]!.toISOString().slice(0, 10),
          sampleTo: dates.at(-1)!.toISOString().slice(0, 10),
        };
        snapshots.push(snapshot);
        if (apply) {
          const inserted = await client.query(UPSERT_SNAPSHOT_SQL, [
            snapshot.evaluationMode,
            snapshot.market,
            snapshot.horizonDays,
            snapshot.probabilityMethod,
            snapshot.sample_n,
            snapshot.brier_score,
            snapshot.log_loss,
            snapshot.expected_calibration_error,
            JSON.stringify(snapshot.calibration_bins),
            snapshot.insufficientSample,
            snapshot.sampleFrom,
            snapshot.sampleTo,
            cutoff.toISOString(),
          ]);
          written += inserted.rowCount ?? 0;
        }
      }
    }

    const summary = {
      finalOutcomes: rows.length,
      liveProbabilityRows: liveRows.length,
      historicalExpandingRows: expandingRows.length,
      snapshots: snapshots.length,
      written,
      labelProfilesWritten,
      dataCutoff: cutoff.toISOString(),
      preview: snapshots.slice(0, 8),
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `prob-calibration-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      rows.length,
      written + labelProfilesWritten,
      Math.max(0, rows.length - liveRows.length - expandingRows.length),
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
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
