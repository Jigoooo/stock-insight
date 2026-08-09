import type { ReadSnapshotExecutor } from './read-snapshot.ts';

export const namedReadQueryIds = [
  'workspace.today',
  'workspace.shell',
  'stocks.list',
  'stocks.detail',
  'radar.page',
  'history.page',
  'status.summary',
  'record.detail',
  'relations.graph',
  'impact.brief',
] as const;

export type ReadQueryId = (typeof namedReadQueryIds)[number];

export type ReadQueryMetric = Readonly<{
  queryId: ReadQueryId;
  durationMs: number;
  rowCount: number | null;
}>;

export type ReadQueryMetricReporter = (metric: ReadQueryMetric) => void;

const reportStructuredMetric: ReadQueryMetricReporter = (metric) => {
  console.info(JSON.stringify(metric));
};

export function withNamedReadQuery(
  executor: ReadSnapshotExecutor,
  queryId: ReadQueryId,
  report: ReadQueryMetricReporter = reportStructuredMetric,
  now: () => number = () => performance.now(),
): ReadSnapshotExecutor {
  return {
    queryRows: async <TRow extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<TRow[]> => {
      const startedAt = now();
      try {
        const rows = await executor.queryRows<TRow>(sql, params);
        report({
          queryId,
          durationMs: Math.max(0, Number((now() - startedAt).toFixed(3))),
          rowCount: rows.length,
        });
        return rows;
      } catch (error) {
        report({
          queryId,
          durationMs: Math.max(0, Number((now() - startedAt).toFixed(3))),
          rowCount: null,
        });
        throw error;
      }
    },
  };
}
