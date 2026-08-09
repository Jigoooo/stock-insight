import { getResearchRecordDetail } from './record-detail.ts';
import { getImpactBrief } from '../product/read-model.ts';
import { getEntityRelationsWithV2Preference } from '../relations/entity-relation-adapter.ts';
import {
  withNamedReadQuery,
  type ReadQueryId,
  type ReadQueryMetricReporter,
} from '../server/named-read-query.ts';
import type { ReadSnapshotExecutor } from '../server/read-snapshot.ts';
import type { UserScope } from '../shared/user-scope.ts';
import { createPostgresStockReadModel, getStockDetail } from '../stocks/read-model.ts';

import type { ImpactBriefResponse, StockDetailResponse } from '@stock-insight/contracts';
import type {
  EntityRelationGraph,
  ResearchRecordDetail,
} from '@stock-insight/contracts/research-workspace';
import type {
  EntityBriefingSurface,
  EntityBriefingV2,
  RecordBriefingV2,
} from '@stock-insight/contracts/workspace-read-v2';

type ScopedOptions = Readonly<{ userScope: UserScope }>;

export type WorkspaceBriefingDependencies = Readonly<{
  stockDetail: (
    executor: ReadSnapshotExecutor,
    options: ScopedOptions & { entityKey: string },
  ) => Promise<StockDetailResponse>;
  relation: (
    executor: ReadSnapshotExecutor,
    options: ScopedOptions & { entityKey: string; depth: 1 | 2 },
  ) => Promise<EntityRelationGraph | null>;
  impact: (
    executor: ReadSnapshotExecutor,
    options: ScopedOptions & { entityKey: string },
  ) => Promise<ImpactBriefResponse>;
  record: (
    executor: ReadSnapshotExecutor,
    options: ScopedOptions & { recordKey: string },
  ) => Promise<ResearchRecordDetail | null>;
}>;

const defaultDependencies: WorkspaceBriefingDependencies = {
  stockDetail: (executor, { entityKey, userScope }) =>
    getStockDetail(entityKey, {
      readModel: createPostgresStockReadModel(
        (sql, parameters) => executor.queryRows(sql, parameters),
        userScope,
      ),
    }),
  relation: async (executor, { depth, entityKey, userScope }) =>
    (
      await getEntityRelationsWithV2Preference(executor, {
        depth,
        entityKey,
        userId: userScope.userId,
        now: new Date(),
      })
    ).graph,
  impact: (executor, { entityKey }) => getImpactBrief(executor, { entityKey }),
  record: getResearchRecordDetail,
};

const partialMessage = {
  relation: '관계 데이터를 확인하지 못했습니다.',
  impact: '영향 경로 데이터를 확인하지 못했습니다.',
} as const;

export async function getEntityBriefingV2(
  executor: ReadSnapshotExecutor,
  options: Readonly<{
    entityKey: string;
    surface: EntityBriefingSurface;
    userScope: UserScope;
    dependencies?: Partial<WorkspaceBriefingDependencies>;
    reportQueryMetric?: ReadQueryMetricReporter;
  }>,
): Promise<EntityBriefingV2> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const scoped = { entityKey: options.entityKey, userScope: options.userScope };
  const named = (queryId: ReadQueryId) =>
    withNamedReadQuery(executor, queryId, options.reportQueryMetric);
  const stockDetail =
    options.surface === 'stocks'
      ? await dependencies.stockDetail(named('stocks.detail'), scoped)
      : null;
  const partialFailures: EntityBriefingV2['partialFailures'] = {};

  let relation: EntityRelationGraph | null = null;
  try {
    relation = await dependencies.relation(named('relations.graph'), {
      ...scoped,
      depth: options.surface === 'stocks' ? 2 : 1,
    });
  } catch {
    partialFailures.relation = partialMessage.relation;
  }

  let impactBrief: ImpactBriefResponse | null = null;
  try {
    impactBrief = await dependencies.impact(named('impact.brief'), scoped);
    if (impactBrief.availability === 'error') {
      partialFailures.impact = partialMessage.impact;
      impactBrief = null;
    }
  } catch {
    partialFailures.impact = partialMessage.impact;
  }

  return {
    entityKey: options.entityKey,
    surface: options.surface,
    stockDetail,
    relation,
    impactBrief,
    partialFailures,
  };
}

export async function getRecordBriefingV2(
  executor: ReadSnapshotExecutor,
  options: Readonly<{
    recordKey: string;
    userScope: UserScope;
    dependencies?: Partial<WorkspaceBriefingDependencies>;
    reportQueryMetric?: ReadQueryMetricReporter;
  }>,
): Promise<RecordBriefingV2 | null> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const named = (queryId: ReadQueryId) =>
    withNamedReadQuery(executor, queryId, options.reportQueryMetric);
  const record = await dependencies.record(named('record.detail'), {
    recordKey: options.recordKey,
    userScope: options.userScope,
  });
  if (!record) return null;

  const entityKey = record.affectedEntityKeys[0];
  if (!entityKey) return { record, relation: null, partialFailures: {} };
  try {
    const relation = await dependencies.relation(named('relations.graph'), {
      entityKey,
      depth: 1,
      userScope: options.userScope,
    });
    return { record, relation, partialFailures: {} };
  } catch {
    return {
      record,
      relation: null,
      partialFailures: { relation: partialMessage.relation },
    };
  }
}
