import { z } from 'zod';

import { stockListResponseSchema, type StockListResponse } from '@stock-insight/contracts';
import { geoSnapshotSchema, type GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import {
  decisionHistoryPageSchema,
  radarSignalPageSchema,
  researchRecordDetailSchema,
  systemStatusSchema,
  workspaceTodaySchema,
  type DecisionHistoryPage,
  type RadarSignalPage,
  type ResearchRecordDetail,
  type SystemStatus,
  type WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

const countSchema = z.number().int().nonnegative().max(10_000_000);

export const workspaceReadViewSchema = z.enum(['today', 'stocks', 'radar', 'history', 'status']);

export type WorkspaceReadView = z.infer<typeof workspaceReadViewSchema>;

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
