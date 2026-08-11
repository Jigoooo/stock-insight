import { getResearchRecordDetail } from './record-detail.ts';
import { getImpactBrief } from '../product/read-model.ts';
import { getEntityRelationsWithV2Preference } from '../relations/entity-relation-adapter.ts';
import {
  withNamedReadQuery,
  type ReadQueryId,
  type ReadQueryMetricReporter,
} from '../server/named-read-query.ts';
import type { ReadSnapshotExecutor } from '../server/read-snapshot.ts';
import { getCommonAssetView } from '../serving/common-asset-view-read-model.ts';
import type { UserScope } from '../shared/user-scope.ts';
import { createPostgresStockReadModel, getStockDetail } from '../stocks/read-model.ts';

import type { ImpactBriefResponse, StockDetailResponse } from '@stock-insight/contracts';
import type {
  CommonAssetViewPacket,
  CommonAssetViewResponse,
} from '@stock-insight/contracts/common-asset-view';
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
  /**
   * `REQ-REC-001` — 이 의존만 `userScope` 를 받지 않는다.
   *
   * 형제 넷과 모양을 맞추면 균일해 보이지만 그 균일함이 사는 값은 없고, 대신 개인화된
   * 공통 자산 뷰를 만들 수 있는 문이 열린다. 공통 패킷은 모든 사용자에게 같은
   * 패킷이므로, 닿을 수 없는 인자가 "닿지 않겠다"는 약속보다 강한 게이트다.
   */
  commonAssetView: (
    executor: ReadSnapshotExecutor,
    options: { entityKey: string },
  ) => Promise<CommonAssetViewResponse>;
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
  commonAssetView: (executor, { entityKey }) => getCommonAssetView(executor, { entityKey }),
};

const partialMessage = {
  relation: '관계 데이터를 확인하지 못했습니다.',
  impact: '영향 경로 데이터를 확인하지 못했습니다.',
  commonAssetView: '공통 자산 패킷을 확인하지 못했습니다.',
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

  // CAV 실패는 briefing 전체를 죽이지 않는다. 형제들과 같은 try/catch 이유이고,
  // 이 블록에서만 한 번 더 중요하다 — 297종목 밖의 종목에는 패킷이 아예 없는 것이
  // 정상이므로, 그 정상을 사고로 승격시키면 화면이 매번 부분 실패를 보고한다.
  // 그래서 `missing` 은 `partialFailures` 를 채우지 않고 `null` 로만 나간다.
  let commonAssetView: CommonAssetViewPacket | null = null;
  try {
    commonAssetView = (
      await dependencies.commonAssetView(named('assetView.packet'), {
        entityKey: options.entityKey,
      })
    ).packet;
  } catch {
    partialFailures.commonAssetView = partialMessage.commonAssetView;
  }

  return {
    entityKey: options.entityKey,
    surface: options.surface,
    stockDetail,
    relation,
    impactBrief,
    commonAssetView,
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
