import { z } from 'zod';

import {
  impactBriefResponseSchema,
  stockDetailResponseSchema,
  stockListResponseSchema,
  type ImpactBriefResponse,
  type StockDetailResponse,
  type StockListResponse,
} from '@stock-insight/contracts';
import {
  commonAssetViewPacketSchema,
  type CommonAssetViewPacket,
} from '@stock-insight/contracts/common-asset-view';
import { geoSnapshotSchema, type GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import {
  decisionHistoryPageSchema,
  entityRelationGraphSchema,
  radarSignalPageSchema,
  researchRecordDetailSchema,
  systemStatusSchema,
  workspaceTodaySchema,
  type DecisionHistoryPage,
  type EntityRelationGraph,
  type RadarSignalPage,
  type ResearchRecordDetail,
  type SystemStatus,
  type WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

const countSchema = z.number().int().nonnegative().max(10_000_000);

export const workspaceReadViewSchema = z.enum(['today', 'stocks', 'radar', 'history', 'status']);

export type WorkspaceReadView = z.infer<typeof workspaceReadViewSchema>;

export const entityBriefingSurfaceSchema = z.enum(['stocks', 'market_connections']);
export type EntityBriefingSurface = z.infer<typeof entityBriefingSurfaceSchema>;

export const workspaceShellSummarySchema = z.object({
  radarScopeTotal: countSchema,
  watchlistCount: countSchema,
});

export type WorkspaceShellSummary = z.infer<typeof workspaceShellSummarySchema>;

export const workspaceViewBundleV2Schema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('today'),
    shell: workspaceShellSummarySchema,
    today: workspaceTodaySchema,
    defaultRecord: researchRecordDetailSchema.nullable(),
  }),
  z.object({
    view: z.literal('stocks'),
    shell: workspaceShellSummarySchema,
    stocks: stockListResponseSchema,
  }),
  z.object({
    view: z.literal('radar'),
    shell: workspaceShellSummarySchema,
    radar: radarSignalPageSchema,
    geoSnapshot: geoSnapshotSchema,
  }),
  z.object({
    view: z.literal('history'),
    shell: workspaceShellSummarySchema,
    history: decisionHistoryPageSchema,
  }),
  z.object({
    view: z.literal('status'),
    shell: workspaceShellSummarySchema,
    status: systemStatusSchema,
  }),
]);

export type WorkspaceViewBundleV2 =
  | {
      view: 'today';
      shell: WorkspaceShellSummary;
      today: WorkspaceToday;
      defaultRecord: ResearchRecordDetail | null;
    }
  | { view: 'stocks'; shell: WorkspaceShellSummary; stocks: StockListResponse }
  | {
      view: 'radar';
      shell: WorkspaceShellSummary;
      radar: RadarSignalPage;
      geoSnapshot: GeoSnapshot;
    }
  | { view: 'history'; shell: WorkspaceShellSummary; history: DecisionHistoryPage }
  | { view: 'status'; shell: WorkspaceShellSummary; status: SystemStatus };

const briefingPartialFailuresSchema = z.object({
  relation: z.string().min(1).optional(),
  impact: z.string().min(1).optional(),
  commonAssetView: z.string().min(1).optional(),
});

export const entityBriefingV2Schema = z.object({
  entityKey: z.string().min(1),
  surface: entityBriefingSurfaceSchema,
  stockDetail: stockDetailResponseSchema.nullable(),
  relation: entityRelationGraphSchema.nullable(),
  impactBrief: impactBriefResponseSchema.nullable(),
  /**
   * 12블록 공통 자산 패킷(`serving.common_asset_view`).
   *
   * `null` 은 두 가지를 뜻할 수 있고 둘 다 정상이다: 이 종목의 패킷이 아직 지어지지
   * 않았거나(297 빌드 대상 밖), 조회가 실패해 `partialFailures.commonAssetView` 가
   * 채워졌거나. 후자만 실패다.
   *
   * 이 필드가 붙는 것만으로 컨트롤러 · BFF 프록시 · api-client 는 바뀌지 않는다 —
   * 셋 다 이 스키마로 파싱하므로 새 필드가 타입까지 달고 자동으로 도착한다.
   */
  commonAssetView: commonAssetViewPacketSchema.nullable(),
  partialFailures: briefingPartialFailuresSchema,
});

export type EntityBriefingV2 = {
  entityKey: string;
  surface: EntityBriefingSurface;
  stockDetail: StockDetailResponse | null;
  relation: EntityRelationGraph | null;
  impactBrief: ImpactBriefResponse | null;
  commonAssetView: CommonAssetViewPacket | null;
  partialFailures: { relation?: string; impact?: string; commonAssetView?: string };
};

export const recordBriefingV2Schema = z.object({
  record: researchRecordDetailSchema,
  relation: entityRelationGraphSchema.nullable(),
  partialFailures: z.object({ relation: z.string().min(1).optional() }),
});

export type RecordBriefingV2 = {
  record: ResearchRecordDetail;
  relation: EntityRelationGraph | null;
  partialFailures: { relation?: string };
};
