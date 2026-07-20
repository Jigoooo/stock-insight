export type PublicationSnapshotIdentity = {
  analysisRunId: string;
  analysisRevision: number;
};

export type PublicationProjectionRow = {
  analysis_run_id: string;
  analysis_revision: number;
  cutoff_at: string | Date;
  source_watermark_at: string | Date;
  fresh_until: string | Date;
  projection_status: string;
};

type ProjectionQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

const LATEST_PROJECTION_SQL = `
  SELECT analysis_run_id, analysis_revision, cutoff_at, source_watermark_at,
         fresh_until, projection_status
  FROM ops.publication_projection_status
  WHERE domain = 'stock'
    AND projection_status IN ('available', 'stale')
  ORDER BY CASE projection_status WHEN 'available' THEN 0 ELSE 1 END,
           cutoff_at DESC, analysis_revision DESC
  LIMIT 1
`;

const EXACT_PROJECTION_SQL = `
  SELECT analysis_run_id, analysis_revision, cutoff_at, source_watermark_at,
         fresh_until, projection_status
  FROM ops.publication_projection_status
  WHERE domain = 'stock'
    AND projection_status IN ('available', 'stale')
    AND analysis_run_id = $1
    AND analysis_revision = $2
  LIMIT 1
`;

export async function selectPublicationProjection(
  executor: ProjectionQueryExecutor,
  snapshot?: PublicationSnapshotIdentity,
): Promise<PublicationProjectionRow | undefined> {
  if (snapshot) {
    if (!snapshot.analysisRunId.trim() || !Number.isInteger(snapshot.analysisRevision)) {
      throw new Error('publication snapshot identity is invalid');
    }
    const [projection] = await executor.queryRows<PublicationProjectionRow>(EXACT_PROJECTION_SQL, [
      snapshot.analysisRunId,
      snapshot.analysisRevision,
    ]);
    if (!projection) throw new Error('requested publication snapshot is no longer available');
    return projection;
  }
  const [projection] = await executor.queryRows<PublicationProjectionRow>(LATEST_PROJECTION_SQL);
  return projection;
}
