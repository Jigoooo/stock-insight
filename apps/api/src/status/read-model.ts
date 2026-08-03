import { systemStatusSchema, type SystemStatus } from '@stock-insight/contracts/research-workspace';

export type SystemStatusQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetSystemStatusOptions = { now?: Date };

type DatasetRow = {
  domain: string;
  dataset_name: string;
  status: string;
  watermark_at: string | Date | null;
  row_count: number | string | null;
  analysis_run_id: string | null;
  analysis_revision: number | null;
};

type PipelineJobRow = {
  job_name: string;
  last_run_at: string | Date | null;
  last_success_at: string | Date | null;
  last_failure_at: string | Date | null;
  last_status: string | null;
  consecutive_failures: number | string | null;
  records_failures: boolean;
  stuck_since: string | Date | null;
};

type CoverageRow = {
  total: number | string;
  linked: number | string;
  clickable: number | string;
};

const DATASET_STATUS_SQL = `
  SELECT domain, dataset_name, status, watermark_at, row_count,
         analysis_run_id, analysis_revision
  FROM ops.dataset_watermark
  WHERE domain IN ('stock', 'common')
  UNION ALL
  SELECT domain, dataset_name, status, watermark_at, row_count,
         NULL::text AS analysis_run_id, NULL::integer AS analysis_revision
  FROM serving.dataset_watermark_live_v1
  ORDER BY domain ASC, dataset_name ASC
`;

const PUBLICATION_SOURCE_COVERAGE_SQL = `
  WITH latest AS (
    SELECT analysis_run_id, analysis_revision, cutoff_at, actual_record_count
    FROM ops.publication_projection_status
    WHERE domain = 'stock'
      AND projection_status = 'available'
    ORDER BY cutoff_at DESC, analysis_revision DESC
    LIMIT 1
  ), source_state AS (
    SELECT
      association.record_key,
      bool_or(nullif(revision.url, '') IS NOT NULL) AS clickable
    FROM latest
    JOIN ops.analysis_run_record_source association
      ON association.analysis_run_id = latest.analysis_run_id
     AND association.revision = latest.analysis_revision
     AND association.lifecycle_state = 'active'
    LEFT JOIN LATERAL (
      SELECT source_revision.url
      FROM ops.source_document_revision source_revision
      WHERE source_revision.source_key = association.source_key
        AND source_revision.known_at <= latest.cutoff_at
      ORDER BY source_revision.known_at DESC, source_revision.revision_no DESC
      LIMIT 1
    ) revision ON true
    GROUP BY association.record_key
  )
  SELECT
    coalesce(latest.actual_record_count, 0)::int AS total,
    count(source_state.record_key)::int AS linked,
    count(source_state.record_key) FILTER (WHERE source_state.clickable)::int AS clickable
  FROM latest
  LEFT JOIN source_state ON true
  GROUP BY latest.actual_record_count
`;

const GRAPH_SOURCE_COVERAGE_SQL = `
  WITH latest_snapshot AS (
    SELECT graph_snapshot_id, edge_count
    FROM analytics.graph_snapshot
    WHERE status = 'sealed'
    ORDER BY as_of DESC, known_at DESC, graph_snapshot_id DESC
    LIMIT 1
  ), evidence_state AS (
    SELECT
      evidence.relation_identity_id,
      bool_or(
        coalesce(
          nullif(revision.payload_metadata->>'url', ''),
          nullif(revision.payload_metadata->>'source_url', '')
        ) IS NOT NULL
      ) AS clickable
    FROM knowledge.relation_evidence_ledger evidence
    LEFT JOIN ingestion.source_revision revision
      ON revision.source_revision_id = evidence.source_revision_id
    GROUP BY evidence.relation_identity_id
  )
  SELECT
    snapshot.edge_count::int AS total,
    count(edge.graph_snapshot_edge_id)
      FILTER (WHERE evidence.relation_identity_id IS NOT NULL)::int AS linked,
    count(edge.graph_snapshot_edge_id)
      FILTER (WHERE evidence.clickable)::int AS clickable
  FROM latest_snapshot snapshot
  LEFT JOIN analytics.graph_snapshot_edge edge
    ON edge.graph_snapshot_id = snapshot.graph_snapshot_id
  LEFT JOIN evidence_state evidence
    ON evidence.relation_identity_id = edge.relation_identity_id
  GROUP BY snapshot.edge_count
  UNION ALL
  SELECT 0, 0, 0
  WHERE NOT EXISTS (SELECT 1 FROM latest_snapshot)
`;

// public.migration_runs is the pipeline job log despite its name — the schema
// ledger lives in public.schema_migration.
//
// Nothing has ever surfaced this. On 2026-08-01 the analytics pipeline failed
// three scheduled runs in a row and the only trace was rows in this table that
// no endpoint read. Two runs are still sitting at 'running' from 2026-07-26 and
// 2026-07-27, hard-killed and never finished, and nothing anywhere notices.
//
// 'partial' counts as a success: dart-financial-facts writes it when the
// OpenDART daily quota runs out mid-run, which is designed behaviour. Folding it
// into failure would hand DART a failure streak on every quota-limited day.
const PIPELINE_JOB_SQL = `
  WITH recent AS (
    SELECT job_name, status, started_at, finished_at
    FROM public.migration_runs
    WHERE started_at > $1::timestamptz - interval '14 days'
  ),
  ranked AS (
    SELECT job_name, status, started_at, finished_at,
           row_number() OVER (PARTITION BY job_name ORDER BY started_at DESC) AS recency,
           max(started_at) FILTER (WHERE status IN ('completed', 'success', 'partial'))
             OVER (PARTITION BY job_name) AS last_success_at
    FROM recent
  )
  SELECT job_name,
         max(started_at) AS last_run_at,
         max(last_success_at) AS last_success_at,
         max(started_at) FILTER (WHERE status IN ('failed', 'killed')) AS last_failure_at,
         max(status) FILTER (WHERE recency = 1) AS last_status,
         -- Runs since the most recent success. A job that has never succeeded in
         -- the window counts every failure it has.
         -- 'killed' counts here too: a run that was cut off did not succeed, and
         -- leaving it out would let a job that keeps getting killed read as idle.
         count(*) FILTER (
           WHERE status IN ('failed', 'killed')
             AND (last_success_at IS NULL OR started_at > last_success_at)
         )::int AS consecutive_failures,
         -- Wrapper stages insert only on success (see pipeline_common.sh), so a
         -- zero streak from them means "no record", not "no failure".
         (job_name NOT LIKE '%-stage') AS records_failures,
         min(started_at) FILTER (WHERE status = 'running' AND finished_at IS NULL) AS stuck_since
  FROM ranked
  GROUP BY job_name
  ORDER BY consecutive_failures DESC, job_name ASC
  LIMIT 60
`;

function toCount(value: number | string | null): number {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('Database returned an invalid count');
  return count;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid timestamp');
  return date.toISOString();
}

function normalizeAvailability(value: string): SystemStatus['datasets'][number]['availability'] {
  const normalized = value.toLowerCase();
  if (
    normalized === 'available' ||
    normalized === 'missing' ||
    normalized === 'collecting' ||
    normalized === 'stale' ||
    normalized === 'text_only' ||
    normalized === 'unsupported' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  return 'error';
}

function overallAvailability(
  values: Array<SystemStatus['datasets'][number]['availability']>,
): SystemStatus['overall'] {
  if (values.length === 0) return 'missing';
  for (const availability of [
    'error',
    'collecting',
    'stale',
    'missing',
    'text_only',
    'unsupported',
  ] as const) {
    if (values.includes(availability)) return availability;
  }
  return 'available';
}

// Unknown values become null rather than being coerced into a known state: an
// invented status is worse than an absent one on a page whose whole job is to say
// what is and is not known.
function normalizeJobStatus(
  value: string | null,
): SystemStatus['pipelineJobs'][number]['lastStatus'] {
  if (
    value === 'completed' ||
    value === 'success' ||
    value === 'partial' ||
    value === 'failed' ||
    value === 'running' ||
    value === 'killed'
  ) {
    return value;
  }
  return null;
}

function mapCoverage(row: CoverageRow | undefined): SystemStatus['sourceCoverage'] {
  const total = toCount(row?.total ?? 0);
  const linked = Math.min(toCount(row?.linked ?? 0), total);
  const clickable = Math.min(toCount(row?.clickable ?? 0), linked);
  return { linked, clickable, total };
}

export async function getSystemStatus(
  executor: SystemStatusQueryExecutor,
  options: GetSystemStatusOptions = {},
): Promise<SystemStatus> {
  const now = options.now ?? new Date();
  const datasetRows = await executor.queryRows<DatasetRow>(DATASET_STATUS_SQL);
  const [publicationCoverage] = await executor.queryRows<CoverageRow>(
    PUBLICATION_SOURCE_COVERAGE_SQL,
  );
  const [graphCoverage] = await executor.queryRows<CoverageRow>(GRAPH_SOURCE_COVERAGE_SQL);
  const jobRows = await executor.queryRows<PipelineJobRow>(PIPELINE_JOB_SQL, [now.toISOString()]);
  const datasets = datasetRows.map((row) => ({
    domain: row.domain,
    datasetName: row.dataset_name,
    availability: normalizeAvailability(row.status),
    watermarkAt: toIso(row.watermark_at),
    rowCount: row.row_count === null ? null : toCount(row.row_count),
    analysisRunId: row.analysis_run_id,
    analysisRevision: row.analysis_revision,
  }));

  return systemStatusSchema.parse({
    generatedAt: now.toISOString(),
    overall: overallAvailability(datasets.map(({ availability }) => availability)),
    datasets,
    sourceCoverage: mapCoverage(publicationCoverage),
    graphSourceCoverage: mapCoverage(graphCoverage),
    pipelineJobs: jobRows.map((row) => ({
      jobName: row.job_name,
      lastRunAt: toIso(row.last_run_at),
      lastSuccessAt: toIso(row.last_success_at),
      lastFailureAt: toIso(row.last_failure_at),
      lastStatus: normalizeJobStatus(row.last_status),
      consecutiveFailures: toCount(row.consecutive_failures),
      recordsFailures: row.records_failures,
      stuckSince: toIso(row.stuck_since),
    })),
  });
}
