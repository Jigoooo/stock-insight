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
  WITH health AS (
    SELECT current_edge_count
    FROM ops.temporal_graph_evidence_health
  )
  SELECT
    coalesce(health.current_edge_count, 0)::int AS total,
    count(DISTINCT edge.id) FILTER (WHERE evidence.id IS NOT NULL)::int AS linked,
    count(DISTINCT edge.id) FILTER (WHERE nullif(source.url, '') IS NOT NULL)::int AS clickable
  FROM health
  LEFT JOIN ops.current_temporal_graph_edge edge
    ON edge.approved = true
   AND edge.inferred = false
  LEFT JOIN ops.temporal_graph_edge_evidence association
    ON association.temporal_edge_id = edge.id
  LEFT JOIN ops.graph_evidence evidence
    ON evidence.id = association.evidence_id
  LEFT JOIN public.source_documents source
    ON source.source_key = evidence.source_key
  GROUP BY health.current_edge_count
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
  });
}
