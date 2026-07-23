export type ShadowArtifactQueryExecutor = Readonly<{
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]>;
}>;

export type AppendShadowArtifactResult = Readonly<{
  shadowExperimentRunId: string;
  candidateCount: number;
  metricCount: number;
}>;

const experimentKinds = new Set([
  'eventrag',
  'pathsim',
  'nbfnet',
  'hgt',
  'tgn',
  'pcmci',
  'sequential_conformal',
  'contextual_bandit',
  'decision_focused',
  'offline_rl',
  'remote_sensing',
]);
const candidateKinds = new Set(['event', 'entity', 'relation', 'content', 'facility', 'policy']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function probability(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nullablePositiveInteger(value: unknown): value is number | null {
  return value === null || positiveInteger(value);
}

function nullableFinite(value: unknown): value is number | null {
  return value === null || finite(value);
}

function nullableNonnegativeInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function nullableDigest(value: unknown): value is string | null {
  return value === null || digest(value);
}

function nonempty(value: unknown, maximumLength = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength;
}

function parseUtcTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  try {
    return new Date(parsed).toISOString() === value ? parsed : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function validInput(input: unknown): input is {
  run: Record<string, unknown>;
  candidates: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
} {
  const root = asRecord(input);
  const run = asRecord(root?.run);
  if (
    root === null ||
    run === null ||
    !Array.isArray(root.candidates) ||
    !Array.isArray(root.metrics)
  ) {
    return false;
  }
  const dataCutoff = parseUtcTimestamp(run.dataCutoff);
  const knownAt = parseUtcTimestamp(run.knownAt);
  const completedAt = parseUtcTimestamp(run.completedAt);
  if (
    typeof run.runKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      run.runKey,
    ) ||
    !experimentKinds.has(run.experimentKind as string) ||
    !['offline', 'shadow'].includes(run.executionMode as string) ||
    !['completed', 'abstained', 'failed'].includes(run.terminalStatus as string) ||
    !nullablePositiveInteger(run.graphSnapshotId) ||
    !Number.isFinite(dataCutoff) ||
    !Number.isFinite(knownAt) ||
    !Number.isFinite(completedAt) ||
    knownAt < dataCutoff ||
    completedAt < knownAt ||
    !nonempty(run.modelVersion) ||
    !(run.baselineVersion === null || nonempty(run.baselineVersion)) ||
    !digest(run.inputDigest) ||
    !nullableDigest(run.modelArtifactDigest) ||
    asRecord(run.configuration) === null ||
    root.candidates.length > 10_000 ||
    root.metrics.length > 10_000
  ) {
    return false;
  }

  const candidateKeys = new Set<string>();
  const candidates: Record<string, unknown>[] = [];
  for (const value of root.candidates) {
    const candidate = asRecord(value);
    const candidateKnownAt = parseUtcTimestamp(candidate?.knownAt);
    if (
      candidate === null ||
      !candidateKinds.has(candidate.candidateKind as string) ||
      !nonempty(candidate.candidateKey) ||
      candidateKeys.has(candidate.candidateKey) ||
      candidate.methodKind !== run.experimentKind ||
      !nullablePositiveInteger(candidate.eventRevisionId) ||
      !nullablePositiveInteger(candidate.targetEntityId) ||
      !probability(candidate.score) ||
      !positiveInteger(candidate.rank) ||
      asRecord(candidate.lineage) === null ||
      asRecord(candidate.explanation) === null ||
      !Number.isFinite(candidateKnownAt) ||
      candidateKnownAt < dataCutoff ||
      candidateKnownAt > completedAt
    ) {
      return false;
    }
    candidateKeys.add(candidate.candidateKey);
    candidates.push(candidate);
  }

  const metricKeys = new Set<string>();
  const metrics: Record<string, unknown>[] = [];
  for (const value of root.metrics) {
    const metric = asRecord(value);
    if (
      metric === null ||
      !nonempty(metric.metricKey) ||
      metricKeys.has(metric.metricKey) ||
      !nullableFinite(metric.metricValue) ||
      !nullableNonnegativeInteger(metric.numeratorCount) ||
      !nullableNonnegativeInteger(metric.denominatorCount) ||
      (metric.numeratorCount !== null &&
        metric.denominatorCount !== null &&
        (metric.numeratorCount as number) > (metric.denominatorCount as number)) ||
      !nullableFinite(metric.confidenceLower) ||
      !nullableFinite(metric.confidenceUpper) ||
      (metric.confidenceLower !== null &&
        metric.confidenceUpper !== null &&
        (metric.confidenceLower as number) > (metric.confidenceUpper as number)) ||
      !(metric.gatePassed === null || typeof metric.gatePassed === 'boolean') ||
      asRecord(metric.detail) === null
    ) {
      return false;
    }
    metricKeys.add(metric.metricKey);
    metrics.push(metric);
  }
  root.candidates = candidates;
  root.metrics = metrics;
  return true;
}

export async function appendShadowExperimentArtifact(
  executor: ShadowArtifactQueryExecutor,
  input: unknown,
): Promise<AppendShadowArtifactResult> {
  if (!validInput(input)) throw new TypeError('Invalid shadow experiment artifact');
  const { run, candidates, metrics } = input;
  await executor.query('BEGIN');
  try {
    const rows = await executor.query<{ shadow_experiment_run_id: string }>(
      `INSERT INTO analytics.shadow_experiment_run (
         run_key, experiment_kind, execution_mode, terminal_status,
         graph_snapshot_id, data_cutoff, known_at, model_version,
         baseline_version, input_digest, model_artifact_digest, configuration,
         candidate_only, accepted_fact_allowed, order_executable, completed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,TRUE,FALSE,FALSE,$13)
       RETURNING shadow_experiment_run_id::text`,
      [
        run.runKey,
        run.experimentKind,
        run.executionMode,
        run.terminalStatus,
        run.graphSnapshotId,
        run.dataCutoff,
        run.knownAt,
        run.modelVersion,
        run.baselineVersion,
        run.inputDigest,
        run.modelArtifactDigest,
        JSON.stringify(run.configuration),
        run.completedAt,
      ],
    );
    const runId = rows[0]?.shadow_experiment_run_id;
    if (typeof runId !== 'string' || runId.length === 0) {
      throw new Error('Shadow experiment run insert did not return an id');
    }

    for (const candidate of candidates) {
      await executor.query(
        `INSERT INTO analytics.candidate_score (
           shadow_experiment_run_id, candidate_kind, candidate_key, method_kind,
           event_revision_id, target_entity_id, score, rank, lineage, explanation,
           known_at, candidate_only, accepted_fact_allowed, order_executable
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,TRUE, FALSE, FALSE)`,
        [
          runId,
          candidate.candidateKind,
          candidate.candidateKey,
          candidate.methodKind,
          candidate.eventRevisionId,
          candidate.targetEntityId,
          candidate.score,
          candidate.rank,
          JSON.stringify(candidate.lineage),
          JSON.stringify(candidate.explanation),
          candidate.knownAt,
        ],
      );
    }

    for (const metric of metrics) {
      await executor.query(
        `INSERT INTO analytics.shadow_metric (
           shadow_experiment_run_id, metric_key, metric_value, numerator_count,
           denominator_count, confidence_lower, confidence_upper, gate_passed, detail
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [
          runId,
          metric.metricKey,
          metric.metricValue,
          metric.numeratorCount,
          metric.denominatorCount,
          metric.confidenceLower,
          metric.confidenceUpper,
          metric.gatePassed,
          JSON.stringify(metric.detail),
        ],
      );
    }
    await executor.query('COMMIT');
    return {
      shadowExperimentRunId: runId,
      candidateCount: candidates.length,
      metricCount: metrics.length,
    };
  } catch (error) {
    try {
      await executor.query('ROLLBACK');
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
}
