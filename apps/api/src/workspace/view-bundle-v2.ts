import { getWorkspaceToday } from './read-model.ts';
import { getResearchRecordDetail } from './record-detail.ts';
import { getWorkspaceShellSummary } from './shell-summary.ts';
import { getGeoSnapshot } from '../geo/read-model.ts';
import { getDecisionHistory } from '../history/read-model.ts';
import { getRadarSignals } from '../radar/read-model.ts';
import {
  withNamedReadQuery,
  type ReadQueryId,
  type ReadQueryMetricReporter,
} from '../server/named-read-query.ts';
import type { ReadSnapshotExecutor } from '../server/read-snapshot.ts';
import type { UserScope } from '../shared/user-scope.ts';
import { getSystemStatus } from '../status/read-model.ts';
import { createPostgresStockReadModel, getStockList } from '../stocks/read-model.ts';

import type { StockListResponse } from '@stock-insight/contracts';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type {
  DecisionHistoryPage,
  RadarSignalPage,
  ResearchRecordDetail,
  SystemStatus,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';
import type {
  WorkspaceReadView,
  WorkspaceShellSummary,
  WorkspaceViewBundleV2,
} from '@stock-insight/contracts/workspace-read-v2';

type WorkspaceViewQuery = Readonly<{
  cursor?: string;
  lane?: 'must_know' | 'for_you' | 'explore';
  record?: string;
}>;

type ScopedOptions = Readonly<{ userScope: UserScope }>;

export type WorkspaceViewBundleDependencies = Readonly<{
  shell: (executor: ReadSnapshotExecutor, options: ScopedOptions) => Promise<WorkspaceShellSummary>;
  today: (executor: ReadSnapshotExecutor, options: ScopedOptions) => Promise<WorkspaceToday>;
  record: (
    executor: ReadSnapshotExecutor,
    options: ScopedOptions & { recordKey: string },
  ) => Promise<ResearchRecordDetail | null>;
  stocks: (executor: ReadSnapshotExecutor, options: ScopedOptions) => Promise<StockListResponse>;
  radar: (
    executor: ReadSnapshotExecutor,
    options: ScopedOptions & { cursor?: string; limit: number },
  ) => Promise<RadarSignalPage>;
  geo: (executor: ReadSnapshotExecutor, options: ScopedOptions) => Promise<GeoSnapshot>;
  history: (
    executor: ReadSnapshotExecutor,
    options: ScopedOptions & { cursor?: string; limit: number },
  ) => Promise<DecisionHistoryPage>;
  status: (executor: ReadSnapshotExecutor, options: ScopedOptions) => Promise<SystemStatus>;
}>;

const defaultDependencies: WorkspaceViewBundleDependencies = {
  shell: getWorkspaceShellSummary,
  today: getWorkspaceToday,
  record: getResearchRecordDetail,
  stocks: (executor, { userScope }) =>
    getStockList({
      readModel: createPostgresStockReadModel(
        (sql, parameters) => executor.queryRows(sql, parameters),
        userScope,
      ),
    }),
  radar: getRadarSignals,
  geo: (executor) => getGeoSnapshot(executor, { now: new Date() }),
  history: getDecisionHistory,
  status: (executor) => getSystemStatus(executor),
};

function requireBoundedText(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function parseWorkspaceViewBundleQuery(
  view: WorkspaceReadView,
  raw: Readonly<Record<string, unknown>>,
): WorkspaceViewQuery {
  const allowed = new Set(
    view === 'today'
      ? ['lane', 'record']
      : view === 'radar' || view === 'history'
        ? ['cursor']
        : [],
  );
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && !allowed.has(key))
      throw new Error(`${key} is not allowed for ${view}`);
  }

  const cursor = requireBoundedText(raw.cursor, 1_024, 'cursor');
  const record = requireBoundedText(raw.record, 320, 'record');
  const lane = raw.lane;
  if (lane !== undefined && lane !== 'must_know' && lane !== 'for_you' && lane !== 'explore') {
    throw new Error('lane is invalid');
  }
  return {
    ...(cursor === undefined ? {} : { cursor }),
    ...(lane === undefined ? {} : { lane }),
    ...(record === undefined ? {} : { record }),
  };
}

export async function getWorkspaceViewBundleV2(
  executor: ReadSnapshotExecutor,
  options: Readonly<{
    userScope: UserScope;
    view: WorkspaceReadView;
    query?: WorkspaceViewQuery;
    dependencies?: Partial<WorkspaceViewBundleDependencies>;
    reportQueryMetric?: ReadQueryMetricReporter;
  }>,
): Promise<WorkspaceViewBundleV2> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const scoped = { userScope: options.userScope };
  const named = (queryId: ReadQueryId) =>
    withNamedReadQuery(executor, queryId, options.reportQueryMetric);
  const shell = await dependencies.shell(named('workspace.shell'), scoped);
  const query = options.query ?? {};

  switch (options.view) {
    case 'today': {
      const today = await dependencies.today(named('workspace.today'), scoped);
      const defaultRecord = query.record
        ? await dependencies.record(named('record.detail'), {
            ...scoped,
            recordKey: query.record,
          })
        : null;
      return { view: 'today', shell, today, defaultRecord };
    }
    case 'stocks':
      return {
        view: 'stocks',
        shell,
        stocks: await dependencies.stocks(named('stocks.list'), scoped),
      };
    case 'radar':
      return {
        view: 'radar',
        shell,
        radar: await dependencies.radar(named('radar.page'), {
          ...scoped,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: 30,
        }),
        geoSnapshot: await dependencies.geo(named('radar.page'), scoped),
      };
    case 'history':
      return {
        view: 'history',
        shell,
        history: await dependencies.history(named('history.page'), {
          ...scoped,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: 30,
        }),
      };
    case 'status':
      return {
        view: 'status',
        shell,
        status: await dependencies.status(named('status.summary'), scoped),
      };
  }
}
